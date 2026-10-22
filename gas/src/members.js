/**
 * Members — SPEC.md §4, §7
 * members.list ส่งแค่ 4 ฟิลด์ของ Member ที่ Active; cache ฝั่ง server ใช้เพื่อค้นหาเท่านั้น ห้ามใช้ตัดสินการลงทะเบียน
 */

const MEMBERS_CACHE_KEY = 'members:list';
const MEMBERS_CACHE_TTL_SECONDS = 10 * 60;
const CACHE_CHUNK_CHARS = 25000; // ≤ 100KB ต่อค่าแม้เป็นอักษรไทย 3 ไบต์ทั้งหมด
const MEMBER_ID_PATTERN = /^[0-9A-Za-z-]{1,20}$/;

function membersList_() {
  let items = getChunkedCache_(MEMBERS_CACHE_KEY);
  if (!items) {
    const table = readTable_(SHEET.MEMBERS);
    items = findObjects_(table, function (m) { return toText_(m.MemberID) && toBool_(m.Active); })
      .map(publicMember_);
    putChunkedCache_(MEMBERS_CACHE_KEY, items, MEMBERS_CACHE_TTL_SECONDS);
  }
  return ok_('OK', null, { items: items, loadedAt: nowIso_() });
}

/**
 * เพิ่ม Walk-in Member ทีละราย ทำได้ขณะ Event เปิดอยู่
 * payload: { memberId, fullName, office, memberType, reason }
 */
function adminMembersAdd_(payload, ctx) {
  const memberId = toText_(payload.memberId);
  const fullName = toText_(payload.fullName).replace(/\s+/g, ' ');
  const office = toText_(payload.office);
  const memberType = toText_(payload.memberType);
  const reason = toText_(payload.reason);

  if (!MEMBER_ID_PATTERN.test(memberId)) return fail_('INVALID_INPUT', 'เลขสมาชิกต้องเป็นตัวเลขหรือตัวอักษร ไม่เกิน 20 ตัว');
  if (!fullName) return fail_('INVALID_INPUT', 'กรุณากรอกชื่อ-นามสกุล');
  if ([MEMBER_TYPE.ORDINARY, MEMBER_TYPE.ASSOCIATE].indexOf(memberType) === -1) {
    return fail_('INVALID_INPUT', 'ประเภทสมาชิกไม่ถูกต้อง');
  }
  if (!reason) return fail_('INVALID_INPUT', 'กรุณาระบุเหตุผลที่เพิ่มสมาชิก');

  const member = withScriptLock_(function () {
    const table = readTable_(SHEET.MEMBERS);
    if (findMemberById_(table, memberId)) appError_('INVALID_INPUT', 'เลขสมาชิกนี้มีอยู่แล้ว');
    const obj = {
      MemberID: memberId,
      FullName: fullName,
      Office: office,
      MemberType: memberType,
      Active: true,
      UpdatedAt: nowIso_(),
      UpdatedBy: ctx.userId,
    };
    appendObject_(table, obj);
    SpreadsheetApp.flush();
    return obj;
  });

  invalidateMembersCache_();
  writeAudit_(ctx.userId, 'MEMBER_ADDED', 'Member', memberId, reason, { walkIn: true });
  return ok_('OK', 'เพิ่มสมาชิกแล้ว', { member: publicMember_(member) });
}

function findMemberById_(table, memberId) {
  return findObject_(table, function (m) { return toText_(m.MemberID) === memberId; });
}

function publicMember_(m) {
  return {
    memberId: toText_(m.MemberID),
    fullName: toText_(m.FullName),
    office: toText_(m.Office),
    memberType: toText_(m.MemberType),
  };
}

function invalidateMembersCache_() {
  CacheService.getScriptCache().remove(MEMBERS_CACHE_KEY + ':meta');
}

/** เก็บค่าที่ใหญ่เกิน 100KB โดยแบ่งเป็นหลาย key; meta ระบุ version เพื่อไม่ให้อ่านชิ้นส่วนเก่าปนใหม่ */
function putChunkedCache_(key, value, ttl) {
  const json = JSON.stringify(value);
  const version = Utilities.getUuid().slice(0, 8);
  const entries = {};
  let count = 0;
  for (let i = 0; i < json.length; i += CACHE_CHUNK_CHARS) {
    entries[key + ':' + version + ':' + count] = json.slice(i, i + CACHE_CHUNK_CHARS);
    count++;
  }
  const cache = CacheService.getScriptCache();
  cache.putAll(entries, ttl);
  cache.put(key + ':meta', JSON.stringify({ version: version, count: count }), ttl);
}

function getChunkedCache_(key) {
  const cache = CacheService.getScriptCache();
  const metaRaw = cache.get(key + ':meta');
  if (!metaRaw) return null;
  const meta = JSON.parse(metaRaw);
  const keys = [];
  for (let i = 0; i < meta.count; i++) keys.push(key + ':' + meta.version + ':' + i);
  const parts = cache.getAll(keys);
  let json = '';
  for (let i = 0; i < keys.length; i++) {
    if (typeof parts[keys[i]] !== 'string') return null;
    json += parts[keys[i]];
  }
  return JSON.parse(json);
}
