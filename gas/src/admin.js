/**
 * Admin — จัดการ Members, Users, Stations, Events (SPEC.md §4, §9)
 * ทุกการเขียนข้อมูลหลักผ่าน withScriptLock_ และบันทึก Audit Log
 */

const IMPORT_BATCH_MAX = 500;

// ---------------- Members ----------------

/** สมาชิกทั้งหมด (รวมที่ไม่ Active) สำหรับหน้าจัดการ */
function adminMembersList_() {
  const table = readTable_(SHEET.MEMBERS);
  const items = findObjects_(table, function (m) { return !!toText_(m.MemberID); }).map(memberView_);
  return ok_('OK', null, { items: items });
}

/** payload: { memberId, fullName?, office?, memberType?, active?, reason } */
function adminMembersUpdate_(payload, ctx) {
  const memberId = toText_(payload.memberId);
  const reason = toText_(payload.reason);
  if (!memberId) return fail_('INVALID_INPUT', 'กรุณาระบุเลขสมาชิก');
  if (!reason) return fail_('INVALID_INPUT', 'กรุณาระบุเหตุผล');

  const patch = {};
  if (payload.fullName !== undefined) {
    patch.FullName = toText_(payload.fullName).replace(/\s+/g, ' ');
    if (!patch.FullName) return fail_('INVALID_INPUT', 'ชื่อ-นามสกุลต้องไม่ว่าง');
  }
  if (payload.office !== undefined) patch.Office = toText_(payload.office);
  if (payload.memberType !== undefined) {
    patch.MemberType = toText_(payload.memberType);
    if ([MEMBER_TYPE.ORDINARY, MEMBER_TYPE.ASSOCIATE].indexOf(patch.MemberType) === -1) {
      return fail_('INVALID_INPUT', 'ประเภทสมาชิกไม่ถูกต้อง');
    }
  }
  if (payload.active !== undefined) patch.Active = payload.active === true;
  if (Object.keys(patch).length === 0) return fail_('INVALID_INPUT', 'ไม่มีข้อมูลที่ต้องแก้ไข');

  const before = withScriptLock_(function () {
    const table = readTable_(SHEET.MEMBERS);
    const m = findMemberById_(table, memberId);
    if (!m) appError_('MEMBER_NOT_FOUND');
    patch.UpdatedAt = nowIso_();
    patch.UpdatedBy = ctx.userId;
    updateObject_(table, m._row, patch);
    SpreadsheetApp.flush();
    return m;
  });

  invalidateMembersCache_();
  writeAudit_(ctx.userId, 'MEMBER_UPDATED', 'Member', memberId, reason, {
    before: { fullName: before.FullName, office: before.Office, memberType: before.MemberType, active: toBool_(before.Active) },
    changes: Object.keys(patch).filter(function (k) { return k !== 'UpdatedAt' && k !== 'UpdatedBy'; }),
  });
  return ok_('OK', 'บันทึกข้อมูลสมาชิกแล้ว');
}

/**
 * นำเข้าสมาชิกทีละ batch (≤ 500 แถว) ทำได้เฉพาะตอนที่ไม่มี Open Event
 * payload: { rows: [{memberId, fullName, office, memberType, active?}], batchIndex?, fileName? }
 * MemberID ที่มีอยู่แล้ว = อัปเดต, ที่ยังไม่มี = เพิ่ม — เขียนทั้งตารางครั้งเดียวภายใน Lock
 */
function adminMembersImportBatch_(payload, ctx) {
  if (findOpenEvent_()) return fail_('INVALID_INPUT', 'นำเข้าไฟล์ไม่ได้ขณะเปิดรับลงทะเบียน ให้ใช้การเพิ่มสมาชิกทีละราย');
  const rows = Array.isArray(payload.rows) ? payload.rows : null;
  if (!rows || rows.length === 0) return fail_('INVALID_INPUT', 'ไม่มีข้อมูลที่จะนำเข้า');
  if (rows.length > IMPORT_BATCH_MAX) return fail_('INVALID_INPUT', 'นำเข้าได้ไม่เกิน ' + IMPORT_BATCH_MAX + ' แถวต่อครั้ง');

  const errors = [];
  const seen = {};
  const clean = rows.map(function (r, i) {
    const row = {
      memberId: toText_(r && r.memberId),
      fullName: toText_(r && r.fullName).replace(/\s+/g, ' '),
      office: toText_(r && r.office),
      memberType: toText_(r && r.memberType),
      active: !(r && r.active === false),
    };
    const line = i + 1;
    if (!MEMBER_ID_PATTERN.test(row.memberId)) errors.push({ row: line, message: 'เลขสมาชิกไม่ถูกต้อง' });
    else if (seen[row.memberId]) errors.push({ row: line, message: 'เลขสมาชิกซ้ำในไฟล์: ' + row.memberId });
    seen[row.memberId] = true;
    if (!row.fullName) errors.push({ row: line, message: 'ไม่มีชื่อ-นามสกุล' });
    if ([MEMBER_TYPE.ORDINARY, MEMBER_TYPE.ASSOCIATE].indexOf(row.memberType) === -1) {
      errors.push({ row: line, message: 'ประเภทสมาชิกไม่ถูกต้อง: ' + row.memberType });
    }
    return row;
  });
  if (errors.length) return fail_('INVALID_INPUT', 'พบข้อมูลไม่ถูกต้อง ' + errors.length + ' รายการ', { errors: errors.slice(0, 50) });

  const result = withScriptLock_(function () {
    const table = readTable_(SHEET.MEMBERS);
    const index = {};
    table.rows.forEach(function (r, i) { index[toText_(r[table.col.MemberID])] = i; });
    const now = nowIso_();
    let inserted = 0;
    let updated = 0;
    clean.forEach(function (row) {
      const obj = {
        MemberID: row.memberId, FullName: row.fullName, Office: row.office,
        MemberType: row.memberType, Active: row.active, UpdatedAt: now, UpdatedBy: ctx.userId,
      };
      if (row.memberId in index) {
        const i = index[row.memberId];
        const current = rowToObject_(table, i);
        Object.keys(obj).forEach(function (k) { current[k] = obj[k]; });
        table.rows[i] = objectToRow_(table, current);
        updated++;
      } else {
        table.rows.push(objectToRow_(table, obj));
        index[row.memberId] = table.rows.length - 1;
        inserted++;
      }
    });
    const width = table.headers.length;
    const sanitized = table.rows.map(function (r) {
      return r.map(function (v) { return typeof v === 'string' && v.charAt(0) !== "'" ? sanitizeCell_(v) : v; });
    });
    ensureRows_(table.sheet, sanitized.length + 1);
    table.sheet.getRange(2, 1, sanitized.length, width).setValues(sanitized);
    SpreadsheetApp.flush();
    return { inserted: inserted, updated: updated };
  });

  invalidateMembersCache_();
  writeAudit_(ctx.userId, 'MEMBERS_IMPORTED', 'Member', '', '', {
    fileName: toText_(payload.fileName), batchIndex: Number(payload.batchIndex) || 0,
    inserted: result.inserted, updated: result.updated,
  });
  return ok_('OK', 'นำเข้าแล้ว: เพิ่ม ' + result.inserted + ' ราย, ปรับปรุง ' + result.updated + ' ราย', result);
}

function ensureRows_(sheet, needed) {
  if (sheet.getMaxRows() < needed) sheet.insertRowsAfter(sheet.getMaxRows(), needed - sheet.getMaxRows());
}

// ---------------- Users ----------------

function adminUsersList_() {
  const table = readTable_(SHEET.USERS);
  const items = findObjects_(table, function (u) { return !!toText_(u.UserID); }).map(function (u) {
    return {
      userId: toText_(u.UserID),
      username: toText_(u.Username),
      fullName: toText_(u.FullName),
      role: toText_(u.Role),
      defaultStationId: toText_(u.DefaultStationID),
      mustChangePin: toBool_(u.MustChangePin),
      lockedUntil: lockedUntil_(u),
      active: toBool_(u.Active),
    };
  });
  return ok_('OK', null, { items: items });
}

/** payload: { username, fullName, role, defaultStationId?, pin } — ผู้ใช้ต้องเปลี่ยน PIN เมื่อเข้าครั้งแรก */
function adminUsersCreate_(payload, ctx) {
  const username = toText_(payload.username).toLowerCase();
  const fullName = toText_(payload.fullName);
  const role = toText_(payload.role);
  const pin = toText_(payload.pin);
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) return fail_('INVALID_INPUT', 'ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _ - ยาว 3–30 ตัว');
  if (!fullName) return fail_('INVALID_INPUT', 'กรุณากรอกชื่อ-นามสกุล');
  if (ALL_ROLES.indexOf(role) === -1) return fail_('INVALID_INPUT', 'บทบาทไม่ถูกต้อง');
  if (!PIN_PATTERN.test(pin) || isWeakPin_(pin)) return fail_('INVALID_INPUT', 'PIN เริ่มต้นต้องเป็นตัวเลข 6 หลักที่ไม่เดาง่าย');

  const userId = withScriptLock_(function () {
    const table = readTable_(SHEET.USERS);
    if (findUserByUsername_(table, username)) appError_('INVALID_INPUT', 'ชื่อผู้ใช้นี้มีอยู่แล้ว');
    return createUser_(table, {
      username: username, fullName: fullName, role: role,
      defaultStationId: toText_(payload.defaultStationId), pin: pin, mustChangePin: true,
    });
  });
  writeAudit_(ctx.userId, 'USER_CREATED', 'User', userId, '', { username: username, role: role });
  return ok_('OK', 'เพิ่มผู้ใช้แล้ว', { userId: userId });
}

/**
 * payload: { userId, fullName?, role?, defaultStationId?, active?, resetPin?, unlock? }
 * resetPin: PIN ใหม่ (บังคับเปลี่ยนเมื่อเข้าครั้งถัดไป และปลดล็อก)
 * กันไม่ให้ไม่มี Admin ที่ Active เหลืออยู่
 */
function adminUsersUpdate_(payload, ctx) {
  const userId = toText_(payload.userId);
  if (!userId) return fail_('INVALID_INPUT', 'กรุณาระบุผู้ใช้');
  const patch = {};
  const changes = [];
  if (payload.fullName !== undefined) {
    patch.FullName = toText_(payload.fullName);
    if (!patch.FullName) return fail_('INVALID_INPUT', 'ชื่อ-นามสกุลต้องไม่ว่าง');
    changes.push('fullName');
  }
  if (payload.role !== undefined) {
    patch.Role = toText_(payload.role);
    if (ALL_ROLES.indexOf(patch.Role) === -1) return fail_('INVALID_INPUT', 'บทบาทไม่ถูกต้อง');
    changes.push('role');
  }
  if (payload.defaultStationId !== undefined) { patch.DefaultStationID = toText_(payload.defaultStationId); changes.push('defaultStationId'); }
  if (payload.active !== undefined) { patch.Active = payload.active === true; changes.push('active'); }
  if (payload.resetPin !== undefined) {
    const pin = toText_(payload.resetPin);
    if (!PIN_PATTERN.test(pin) || isWeakPin_(pin)) return fail_('INVALID_INPUT', 'PIN ใหม่ต้องเป็นตัวเลข 6 หลักที่ไม่เดาง่าย');
    const salt = newSalt_();
    patch.PinSalt = salt;
    patch.PinHash = hashPin_(salt, pin);
    patch.MustChangePin = true;
    patch.FailedAttempts = 0;
    patch.LockedUntil = '';
    changes.push('resetPin');
  }
  if (payload.unlock === true) { patch.FailedAttempts = 0; patch.LockedUntil = ''; changes.push('unlock'); }
  if (changes.length === 0) return fail_('INVALID_INPUT', 'ไม่มีข้อมูลที่ต้องแก้ไข');

  withScriptLock_(function () {
    const table = readTable_(SHEET.USERS);
    const user = findObject_(table, function (u) { return toText_(u.UserID) === userId; });
    if (!user) appError_('INVALID_INPUT', 'ไม่พบผู้ใช้');
    const losesAdmin = user.Role === ROLE.ADMIN && toBool_(user.Active) &&
      ((patch.Role && patch.Role !== ROLE.ADMIN) || patch.Active === false);
    if (losesAdmin) {
      const otherAdmins = findObjects_(table, function (u) {
        return u.Role === ROLE.ADMIN && toBool_(u.Active) && toText_(u.UserID) !== userId;
      });
      if (otherAdmins.length === 0) appError_('INVALID_INPUT', 'ต้องมีผู้ดูแลระบบที่ใช้งานได้อย่างน้อย 1 คน');
    }
    updateObject_(table, user._row, patch);
    SpreadsheetApp.flush();
  });
  writeAudit_(ctx.userId, 'USER_UPDATED', 'User', userId, '', { changes: changes });
  return ok_('OK', 'บันทึกข้อมูลผู้ใช้แล้ว');
}

// ---------------- Stations ----------------

function adminStationsList_() {
  const table = readTable_(SHEET.STATIONS);
  const items = findObjects_(table, function (s) { return !!toText_(s.StationID); }).map(function (s) {
    return { stationId: toText_(s.StationID), stationName: toText_(s.StationName), active: toBool_(s.Active) };
  });
  return ok_('OK', null, { items: items });
}

/** payload: { stationId, stationName, active } — เพิ่มหรือแก้ */
function adminStationsUpsert_(payload, ctx) {
  const stationId = toText_(payload.stationId);
  const stationName = toText_(payload.stationName);
  if (!/^[0-9A-Za-z-]{1,10}$/.test(stationId)) return fail_('INVALID_INPUT', 'รหัสจุดใช้ตัวเลข/ตัวอักษร ไม่เกิน 10 ตัว');
  if (!stationName) return fail_('INVALID_INPUT', 'กรุณากรอกชื่อจุดลงทะเบียน');
  const active = payload.active !== false;

  const created = withScriptLock_(function () {
    const table = readTable_(SHEET.STATIONS);
    const s = findObject_(table, function (x) { return toText_(x.StationID) === stationId; });
    if (s) updateObject_(table, s._row, { StationName: stationName, Active: active });
    else appendObject_(table, { StationID: stationId, StationName: stationName, Active: active });
    SpreadsheetApp.flush();
    return !s;
  });
  writeAudit_(ctx.userId, created ? 'STATION_CREATED' : 'STATION_UPDATED', 'Station', stationId, '', { stationName: stationName, active: active });
  return ok_('OK', 'บันทึกจุดลงทะเบียนแล้ว');
}

// ---------------- Events ----------------

function adminEventsList_() {
  const table = readTable_(SHEET.EVENTS);
  const items = findObjects_(table, function (e) { return !!toText_(e.EventID); }).map(eventView_)
    .sort(function (a, b) { return b.eventDate.localeCompare(a.eventDate); });
  return ok_('OK', null, { items: items });
}

/** payload: { eventId?, eventName, eventDate (yyyy-MM-dd), quorumThreshold } — ไม่มี eventId = สร้างใหม่ (DRAFT) */
function adminEventsUpsert_(payload, ctx) {
  const eventName = toText_(payload.eventName);
  const eventDate = toText_(payload.eventDate);
  const threshold = Number(payload.quorumThreshold);
  if (!eventName) return fail_('INVALID_INPUT', 'กรุณากรอกชื่องานประชุม');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return fail_('INVALID_INPUT', 'วันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD');
  if (!(threshold >= 0) || Math.floor(threshold) !== threshold) return fail_('INVALID_INPUT', 'องค์ประชุมต้องเป็นจำนวนเต็มไม่ติดลบ');

  const eventId = toText_(payload.eventId);
  const id = withScriptLock_(function () {
    const table = readTable_(SHEET.EVENTS);
    if (eventId) {
      const e = findObject_(table, function (x) { return toText_(x.EventID) === eventId; });
      if (!e) appError_('INVALID_INPUT', 'ไม่พบงานประชุม');
      updateObject_(table, e._row, { EventName: eventName, EventDate: eventDate, QuorumThreshold: threshold });
      SpreadsheetApp.flush();
      return eventId;
    }
    const newId = newId_('EV');
    appendObject_(table, {
      EventID: newId, EventName: eventName, EventDate: eventDate,
      Status: EVENT_STATUS.DRAFT, QuorumThreshold: threshold, OpenedAt: '', ClosedAt: '',
    });
    SpreadsheetApp.flush();
    return newId;
  });
  invalidateSummaryCache_(id);
  writeAudit_(ctx.userId, eventId ? 'EVENT_UPDATED' : 'EVENT_CREATED', 'Event', id, '', {
    eventName: eventName, eventDate: eventDate, quorumThreshold: threshold,
  });
  return ok_('OK', 'บันทึกงานประชุมแล้ว', { eventId: id });
}

/** payload: { eventId, reason? } — เปิดได้ครั้งละหนึ่งงาน */
function adminEventsOpen_(payload, ctx) {
  const eventId = toText_(payload.eventId);
  withScriptLock_(function () {
    const table = readTable_(SHEET.EVENTS);
    const e = findObject_(table, function (x) { return toText_(x.EventID) === eventId; });
    if (!e) appError_('INVALID_INPUT', 'ไม่พบงานประชุม');
    if (e.Status === EVENT_STATUS.OPEN) appError_('INVALID_INPUT', 'งานนี้เปิดอยู่แล้ว');
    const other = findObject_(table, function (x) { return x.Status === EVENT_STATUS.OPEN; });
    if (other) appError_('INVALID_INPUT', 'มีงานที่เปิดอยู่แล้ว: ' + toText_(other.EventName) + ' กรุณาปิดก่อน');
    if (e.Status === EVENT_STATUS.CLOSED && !toText_(payload.reason)) {
      appError_('INVALID_INPUT', 'การเปิดงานที่ปิดไปแล้วอีกครั้งต้องระบุเหตุผล');
    }
    updateObject_(table, e._row, { Status: EVENT_STATUS.OPEN, OpenedAt: toText_(e.OpenedAt) || nowIso_(), ClosedAt: '' });
    SpreadsheetApp.flush();
  });
  invalidateSummaryCache_(eventId);
  writeAudit_(ctx.userId, 'EVENT_OPENED', 'Event', eventId, toText_(payload.reason), {});
  return ok_('OK', 'เปิดรับลงทะเบียนแล้ว');
}

/** payload: { eventId } — ปิดรับลงทะเบียน แล้ว export ผลสุดท้ายไปสเปรดชีตสำรอง */
function adminEventsClose_(payload, ctx) {
  const eventId = toText_(payload.eventId);
  withScriptLock_(function () {
    const table = readTable_(SHEET.EVENTS);
    const e = findObject_(table, function (x) { return toText_(x.EventID) === eventId; });
    if (!e) appError_('INVALID_INPUT', 'ไม่พบงานประชุม');
    if (e.Status !== EVENT_STATUS.OPEN) appError_('INVALID_INPUT', 'งานนี้ไม่ได้เปิดอยู่');
    updateObject_(table, e._row, { Status: EVENT_STATUS.CLOSED, ClosedAt: nowIso_() });
    SpreadsheetApp.flush();
  });
  invalidateSummaryCache_(eventId);
  let backupSheet = '';
  try {
    backupSheet = snapshotCheckins_('FINAL_' + eventId);
  } catch (err) {
    console.error('final export failed: ' + err.message);
  }
  writeAudit_(ctx.userId, 'EVENT_CLOSED', 'Event', eventId, '', { finalBackup: backupSheet });
  return ok_('OK', backupSheet ? 'ปิดรับลงทะเบียนแล้ว และสำรองผลสุดท้ายไว้ที่ชีต ' + backupSheet
    : 'ปิดรับลงทะเบียนแล้ว แต่สำรองผลสุดท้ายไม่สำเร็จ กรุณา Export รายงานเก็บไว้', { backupSheet: backupSheet });
}
