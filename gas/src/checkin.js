/**
 * Check-in — SPEC.md §6, ADR 0002 (หนึ่งแถวต่อ EventID+MemberID ตลอดไป)
 * ทุกการเขียน Checkins และ Members ผ่าน withScriptLock_ เท่านั้น
 */

const LOCK_TIMEOUT_MS = 10000;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

/** รอ Lock ไม่เกิน 10 วินาที ถ้าไม่ได้ให้ตอบ BUSY โดยยังไม่ได้เขียนอะไร */
function withScriptLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_TIMEOUT_MS)) appError_('BUSY');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/** payload: { memberId } + req.requestId — Event/Station/Staff มาจาก server ทั้งหมด */
function checkinCreate_(payload, ctx, req) {
  const requestId = requireRequestId_(req);
  const memberId = toText_(payload.memberId);
  if (!memberId) return fail_('INVALID_INPUT', 'กรุณาเลือกสมาชิก');

  const event = findOpenEvent_();
  if (!event) return fail_('EVENT_CLOSED');
  const member = requireActiveMember_(memberId);

  const result = withScriptLock_(function () {
    return upsertCheckin_({
      eventId: event.eventId,
      memberId: memberId,
      requestId: requestId,
      source: CHECKIN_SOURCE.STATION,
      stationId: ctx.stationId,
      staffId: ctx.userId,
      checkinTime: nowIso_(),
    });
  });

  if (result.outcome === 'CREATED' || result.outcome === 'REACTIVATED') {
    writeAudit_(ctx.userId, result.outcome === 'CREATED' ? 'CHECKIN' : 'RECHECKIN', 'Checkin', result.checkin.CheckinID, '', {
      eventId: event.eventId, memberId: memberId, stationId: ctx.stationId, requestId: requestId,
    });
  }
  return checkinResponse_(result, member);
}

/**
 * payload: { requestId } ค้นจากทุก Event หรือ { memberId } ค้นใน Open Event
 * อ่านจากชีตจริงเสมอ เพื่อใช้ตรวจผลก่อน retry หลัง UNKNOWN
 */
function checkinStatus_(payload) {
  const requestId = toText_(payload.requestId);
  const memberId = toText_(payload.memberId);
  if (!requestId && !memberId) return fail_('INVALID_INPUT', 'ต้องระบุ requestId หรือ memberId');

  const table = readTable_(SHEET.CHECKINS);
  let row = null;
  let event = null;
  if (requestId) {
    row = findObject_(table, function (c) { return toText_(c.RequestID) === requestId; });
  } else {
    event = findOpenEvent_();
    if (event) {
      row = findObject_(table, function (c) {
        return toText_(c.EventID) === event.eventId && toText_(c.MemberID) === memberId;
      });
    }
  }

  const members = readTableMemo_(SHEET.MEMBERS);
  const member = findMemberById_(members, row ? toText_(row.MemberID) : memberId);
  return ok_('OK', null, {
    found: !!row,
    openEvent: requestId ? undefined : event,
    member: member ? memberView_(member) : null,
    checkin: row ? checkinView_(row, stationNames_()) : null,
  });
}

/**
 * payload: { limit?, offset?, stationId?, eventId? }
 * Staff: บังคับเป็น Station ตัวเองใน Open Event; Supervisor/Admin: กรองได้ (ค่าเริ่มต้นคือ Open Event)
 */
function checkinHistory_(payload, ctx) {
  const limit = Math.min(Math.max(parseInt(payload.limit, 10) || 50, 1), 500);
  const offset = Math.max(parseInt(payload.offset, 10) || 0, 0);
  const openEvent = findOpenEvent_();

  let eventId;
  let stationId;
  if (ctx.role === ROLE.STAFF) {
    if (!openEvent) return ok_('OK', null, { items: [], total: 0 });
    eventId = openEvent.eventId;
    stationId = ctx.stationId;
  } else {
    eventId = toText_(payload.eventId) || (openEvent ? openEvent.eventId : '');
    stationId = toText_(payload.stationId);
  }

  const table = readTable_(SHEET.CHECKINS);
  const rows = findObjects_(table, function (c) {
    return (!eventId || toText_(c.EventID) === eventId) && (!stationId || toText_(c.StationID) === stationId);
  });
  rows.sort(function (a, b) { return toText_(b.CheckinTime).localeCompare(toText_(a.CheckinTime)); });

  const members = readTableMemo_(SHEET.MEMBERS);
  const memberById = {};
  members.rows.forEach(function (r) { memberById[toText_(r[members.col.MemberID])] = r; });
  const stations = stationNames_();

  const items = rows.slice(offset, offset + limit).map(function (c) {
    const view = checkinView_(c, stations);
    const m = memberById[view.memberId];
    view.fullName = m ? toText_(m[members.col.FullName]) : '';
    view.office = m ? toText_(m[members.col.Office]) : '';
    view.memberType = m ? toText_(m[members.col.MemberType]) : '';
    return view;
  });
  return ok_('OK', null, { items: items, total: rows.length, eventId: eventId, stationId: stationId });
}

/** payload: { memberId, reason, eventId? } — Admin เท่านั้น */
function adminCheckinsCancel_(payload, ctx) {
  const memberId = toText_(payload.memberId);
  const reason = toText_(payload.reason);
  if (!memberId) return fail_('INVALID_INPUT', 'กรุณาระบุเลขสมาชิก');
  if (!reason) return fail_('INVALID_INPUT', 'กรุณาระบุเหตุผลการยกเลิก');
  const event = resolveAdminEvent_(payload);

  const previous = withScriptLock_(function () {
    const table = readTable_(SHEET.CHECKINS);
    const row = findObject_(table, function (c) {
      return toText_(c.EventID) === event.eventId && toText_(c.MemberID) === memberId;
    });
    if (!row) appError_('INVALID_INPUT', 'ไม่พบรายการลงทะเบียนของสมาชิกนี้');
    if (row.Status !== CHECKIN_STATUS.REGISTERED) appError_('INVALID_INPUT', 'รายการนี้ถูกยกเลิกไปแล้ว');
    updateObject_(table, row._row, {
      Status: CHECKIN_STATUS.CANCELLED,
      UpdatedAt: nowIso_(),
      UpdatedBy: ctx.userId,
    });
    SpreadsheetApp.flush();
    return row;
  });

  writeAudit_(ctx.userId, 'CHECKIN_CANCELLED', 'Checkin', previous.CheckinID, reason, {
    eventId: event.eventId,
    memberId: memberId,
    checkinTime: toText_(previous.CheckinTime),
    stationId: toText_(previous.StationID),
    staffId: toText_(previous.StaffID),
    source: toText_(previous.Source),
  });
  return ok_('OK', 'ยกเลิกการลงทะเบียนแล้ว');
}

/**
 * นำเข้า Paper Check-in — กฎกันซ้ำชุดเดียวกับ checkin.create
 * payload: { memberId, checkinTime, stationId, reason, eventId? } + req.requestId
 * eventId ใช้เมื่อนำเข้าหลังปิดงาน (ค่าเริ่มต้นคือ Open Event)
 */
function adminCheckinsPaper_(payload, ctx, req) {
  const requestId = requireRequestId_(req);
  const memberId = toText_(payload.memberId);
  const stationId = toText_(payload.stationId);
  const reason = toText_(payload.reason);
  if (!memberId) return fail_('INVALID_INPUT', 'กรุณาระบุเลขสมาชิก');
  if (!reason) return fail_('INVALID_INPUT', 'กรุณาระบุเหตุผล');
  if (!stationNames_()[stationId]) return fail_('INVALID_INPUT', 'ไม่พบจุดลงทะเบียน ' + stationId);

  const time = new Date(toText_(payload.checkinTime));
  if (!toText_(payload.checkinTime) || isNaN(time.getTime())) return fail_('INVALID_INPUT', 'เวลาลงทะเบียนไม่ถูกต้อง');
  if (time.getTime() > Date.now() + 5 * 60000) return fail_('INVALID_INPUT', 'เวลาลงทะเบียนต้องไม่อยู่ในอนาคต');

  const event = resolveAdminEvent_(payload);
  const member = requireActiveMember_(memberId);

  const result = withScriptLock_(function () {
    return upsertCheckin_({
      eventId: event.eventId,
      memberId: memberId,
      requestId: requestId,
      source: CHECKIN_SOURCE.PAPER,
      stationId: stationId,
      staffId: ctx.userId,
      checkinTime: Utilities.formatDate(time, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX"),
    });
  });

  if (result.outcome === 'CREATED' || result.outcome === 'REACTIVATED') {
    writeAudit_(ctx.userId, 'CHECKIN_PAPER', 'Checkin', result.checkin.CheckinID, reason, {
      eventId: event.eventId, memberId: memberId, stationId: stationId, checkinTime: result.checkin.CheckinTime,
    });
  }
  return checkinResponse_(result, member);
}

/**
 * Critical section — ต้องเรียกภายใน withScriptLock_ เท่านั้น
 * อ่านจากชีตจริง (ห้ามใช้ cache) → ตรวจ RequestID → ตรวจคู่ Event+Member → เขียน → flush
 * @return {{outcome:'CREATED'|'REACTIVATED'|'REPLAY'|'DUPLICATE', checkin:Object}}
 */
function upsertCheckin_(o) {
  const table = readTable_(SHEET.CHECKINS);
  const c = table.col;

  // สแกนแถวดิบรอบเดียว (ไม่แปลงทุกแถวเป็น object) เพื่อให้ช่วงที่ถือ Lock สั้นที่สุด
  let requestIndex = -1;
  let pairIndex = -1;
  for (let i = 0; i < table.rows.length && (requestIndex < 0 || pairIndex < 0); i++) {
    const r = table.rows[i];
    if (requestIndex < 0 && toText_(r[c.RequestID]) === o.requestId) requestIndex = i;
    if (pairIndex < 0 && toText_(r[c.MemberID]) === o.memberId && toText_(r[c.EventID]) === o.eventId) pairIndex = i;
  }

  const byRequest = requestIndex >= 0 ? rowToObject_(table, requestIndex) : null;
  if (byRequest) {
    if (toText_(byRequest.EventID) !== o.eventId || toText_(byRequest.MemberID) !== o.memberId) {
      appError_('INVALID_INPUT', 'requestId นี้ถูกใช้กับสมาชิกรายอื่นแล้ว');
    }
    if (byRequest.Status !== CHECKIN_STATUS.REGISTERED) {
      appError_('INVALID_INPUT', 'รายการนี้ถูกยกเลิกโดยผู้ดูแลระบบแล้ว กรุณาค้นหาสมาชิกและทำรายการใหม่');
    }
    return { outcome: 'REPLAY', checkin: byRequest };
  }

  const existing = pairIndex >= 0 ? rowToObject_(table, pairIndex) : null;
  if (existing && existing.Status === CHECKIN_STATUS.REGISTERED) {
    return { outcome: 'DUPLICATE', checkin: existing };
  }

  const fields = {
    Status: CHECKIN_STATUS.REGISTERED,
    Source: o.source,
    CheckinTime: o.checkinTime,
    StationID: o.stationId,
    StaffID: o.staffId,
    RequestID: o.requestId,
    UpdatedAt: nowIso_(),
    UpdatedBy: o.staffId,
  };

  let checkin;
  let outcome;
  if (existing) {
    updateObject_(table, existing._row, fields);
    checkin = Object.assign({}, existing, fields);
    outcome = 'REACTIVATED';
  } else {
    checkin = Object.assign({ CheckinID: newId_('C'), EventID: o.eventId, MemberID: o.memberId }, fields);
    appendObject_(table, checkin);
    outcome = 'CREATED';
  }
  SpreadsheetApp.flush();
  return { outcome: outcome, checkin: checkin };
}

function checkinResponse_(result, member) {
  const data = { member: memberView_(member), checkin: checkinView_(result.checkin, stationNames_()) };
  if (result.outcome === 'DUPLICATE') {
    return fail_('ALREADY_REGISTERED',
      'สมาชิกรายนี้ลงทะเบียนแล้วเมื่อ ' + formatThaiTime_(data.checkin.checkinTime) + ' ที่' + (data.checkin.stationName || data.checkin.stationId),
      data);
  }
  data.replayed = result.outcome === 'REPLAY';
  return ok_('REGISTERED', null, data);
}

function requireRequestId_(req) {
  const requestId = toText_(req && req.requestId);
  if (!REQUEST_ID_PATTERN.test(requestId)) appError_('INVALID_INPUT', 'requestId ไม่ถูกต้อง');
  return requestId;
}

/**
 * ตรวจจากรายชื่อใน cache ก่อน (มีเฉพาะสมาชิกที่ Active และถูกล้างทันทีเมื่อ Admin เพิ่ม/แก้/นำเข้า)
 * ไม่พบใน cache ค่อยอ่านชีตเพื่อแยกระหว่าง "ไม่พบ" กับ "ไม่มีสิทธิ์"
 * ใช้ตรวจตัวตนสมาชิกเท่านั้น — การกันซ้ำยังอ่านชีต Checkins จริงภายใน Lock เสมอ
 */
function requireActiveMember_(memberId) {
  const cached = getChunkedCache_(MEMBERS_CACHE_KEY);
  if (cached) {
    for (let i = 0; i < cached.length; i++) {
      const m = cached[i];
      if (m.memberId === memberId) {
        return { MemberID: m.memberId, FullName: m.fullName, Office: m.office, MemberType: m.memberType, Active: true };
      }
    }
  }
  const member = findMemberById_(readTableMemo_(SHEET.MEMBERS), memberId);
  if (!member) appError_('MEMBER_NOT_FOUND');
  if (!toBool_(member.Active)) appError_('MEMBER_INACTIVE', null, { member: memberView_(member) });
  return member;
}

/** Admin ระบุ eventId ได้ (เช่นนำเข้า Paper Check-in หลังปิดงาน) ถ้าไม่ระบุใช้ Open Event */
function resolveAdminEvent_(payload) {
  const eventId = toText_(payload.eventId);
  if (!eventId) {
    const open = findOpenEvent_();
    if (!open) appError_('EVENT_CLOSED');
    return open;
  }
  const table = readTable_(SHEET.EVENTS);
  const e = findObject_(table, function (x) { return toText_(x.EventID) === eventId; });
  if (!e || e.Status === EVENT_STATUS.DRAFT) appError_('INVALID_INPUT', 'ไม่พบงานประชุมนี้ หรือยังไม่เคยเปิดรับลงทะเบียน');
  return { eventId: eventId, eventName: toText_(e.EventName) };
}

function stationNames_() {
  const table = readTableMemo_(SHEET.STATIONS);
  const names = {};
  table.rows.forEach(function (r) { names[toText_(r[table.col.StationID])] = toText_(r[table.col.StationName]); });
  return names;
}

function memberView_(m) {
  const view = publicMember_(m);
  view.active = toBool_(m.Active);
  return view;
}

function checkinView_(c, stations) {
  const stationId = toText_(c.StationID);
  return {
    checkinId: toText_(c.CheckinID),
    eventId: toText_(c.EventID),
    memberId: toText_(c.MemberID),
    status: toText_(c.Status),
    source: toText_(c.Source),
    checkinTime: toText_(c.CheckinTime),
    stationId: stationId,
    stationName: stations[stationId] || '',
    staffId: toText_(c.StaffID),
    requestId: toText_(c.RequestID),
  };
}

/** "2026-10-21T08:15:00+07:00" → "08:15 น." */
function formatThaiTime_(iso) {
  const m = /T(\d{2}):(\d{2})/.exec(iso || '');
  return m ? m[1] + ':' + m[2] + ' น.' : iso;
}
