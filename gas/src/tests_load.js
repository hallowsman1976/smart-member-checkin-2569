/**
 * เตรียม/ล้างข้อมูลสำหรับ load test บน staging (tests/load/run.mjs) — ต้องตั้ง TEST_MODE=true
 * setupLoadTest: Staff zz_load_staff01–08 + zz_load_sup (PIN สุ่มเดียวกัน ไม่บังคับเปลี่ยน),
 *                สมาชิกทดสอบ ZL0001–ZL0120 และงาน "zz_test load" ที่เปิดรับลงทะเบียน
 * teardownLoadTest: ปิดงาน ปิดบัญชี และปิดสิทธิ์สมาชิกทดสอบ
 */

const LOAD_MEMBER_COUNT = 120; // load test ใช้ 42 คนต่อรอบ → รันซ้ำได้ 2 รอบต่อการ setup

function setupLoadTest() {
  if (getProp_('TEST_MODE') !== 'true') throw new Error('ใช้ได้เฉพาะ staging ที่ตั้ง TEST_MODE=true');
  initializeSheets();
  const open = findOpenEvent_();
  if (open && open.eventName.indexOf('zz_test') !== 0) throw new Error('มี Open Event จริงอยู่ (' + open.eventName + ')');
  closeTestEvents_();

  const pin = randomPin_();
  const users = readTable_(SHEET.USERS);
  const accounts = [];
  for (let i = 1; i <= 8; i++) accounts.push({ username: 'zz_load_staff0' + i, role: ROLE.STAFF, station: ('0' + i).slice(-2) });
  accounts.push({ username: 'zz_load_sup', role: ROLE.SUPERVISOR, station: '' });
  accounts.forEach(function (a) {
    const salt = newSalt_();
    const existing = findUserByUsername_(users, a.username);
    if (existing) {
      updateObject_(users, existing._row, {
        Role: a.role, PinSalt: salt, PinHash: hashPin_(salt, pin), MustChangePin: false,
        FailedAttempts: 0, LockedUntil: '', Active: true,
      });
    } else {
      createUser_(users, { username: a.username, fullName: 'Load test ' + a.username, role: a.role, defaultStationId: a.station, pin: pin, mustChangePin: false });
    }
  });

  const members = readTable_(SHEET.MEMBERS);
  for (let i = 1; i <= LOAD_MEMBER_COUNT; i++) {
    const id = 'ZL' + ('000' + i).slice(-4);
    const m = findMemberById_(members, id);
    const obj = { FullName: 'zz_load สมาชิก ' + i, Office: 'ทดสอบ', MemberType: MEMBER_TYPE.ORDINARY, Active: true, UpdatedAt: nowIso_(), UpdatedBy: 'LOAD' };
    if (m) updateObject_(members, m._row, obj);
    else appendObject_(members, Object.assign({ MemberID: id }, obj));
  }
  invalidateMembersCache_();

  const eventId = newId_('ZLE');
  appendObject_(readTable_(SHEET.EVENTS), {
    EventID: eventId, EventName: 'zz_test load ' + nowIso_().slice(0, 16), EventDate: nowIso_().slice(0, 10),
    Status: EVENT_STATUS.OPEN, QuorumThreshold: 10, OpenedAt: nowIso_(), ClosedAt: '',
  });
  SpreadsheetApp.flush();
  writeAudit_('SYSTEM', 'LOAD_TEST_SETUP', 'Event', eventId, '', { users: accounts.length, members: LOAD_MEMBER_COUNT });

  console.log('พร้อมแล้ว: งาน ' + eventId + ' เปิดอยู่, บัญชี zz_load_staff01–08 และ zz_load_sup');
  console.log('LOAD_PIN=' + pin + ' (ใช้ตอนสคริปต์ load test ถาม PIN ใช้ได้จนกว่าจะรัน teardownLoadTest)');
  return { eventId: eventId, pin: pin };
}

function teardownLoadTest() {
  closeTestEvents_();
  const users = readTable_(SHEET.USERS);
  findObjects_(users, function (u) { return toText_(u.Username).indexOf('zz_load_') === 0 && toBool_(u.Active); })
    .forEach(function (u) { updateObject_(users, u._row, { Active: false }); });
  const members = readTable_(SHEET.MEMBERS);
  findObjects_(members, function (m) { return toText_(m.MemberID).indexOf('ZL') === 0 && toBool_(m.Active); })
    .forEach(function (m) { updateObject_(members, m._row, { Active: false }); });
  invalidateMembersCache_();
  SpreadsheetApp.flush();
  writeAudit_('SYSTEM', 'LOAD_TEST_TEARDOWN', '', '', '', {});
  console.log('ปิดงานทดสอบ ปิดบัญชี zz_load_* และปิดสิทธิ์สมาชิก ZL* แล้ว');
}
