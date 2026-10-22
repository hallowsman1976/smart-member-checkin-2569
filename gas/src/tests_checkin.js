/**
 * ชุดทดสอบ Phase 2 (Check-in backend) — รันบนสเปรดชีต staging ที่ตั้ง TEST_MODE=true
 * สร้าง Event "zz_test …" ที่ OPEN ระหว่างทดสอบ แล้วปิดเมื่อจบ จึงห้ามรันขณะมี Open Event จริง
 */

function runPhase2Tests() {
  const kit = newTestKit_();
  const test = kit.test;
  const call = kit.call;
  const expectCode = kit.expectCode;
  const assert = kit.assert;
  const tag = kit.tag;

  initializeSheets();
  const open = findOpenEvent_();
  if (open && open.eventName.indexOf('zz_test') !== 0) {
    throw new Error('มี Open Event จริงอยู่ (' + open.eventName + ') ห้ามรันชุดทดสอบนี้');
  }
  closeTestEvents_();

  // ---- เตรียมข้อมูล ----
  const PIN = '482916';
  const uname = function (role) { return 'zz_test_' + role + '_' + tag; };
  const users = readTable_(SHEET.USERS);
  ['staff1', 'staff2'].forEach(function (r) {
    createUser_(users, { username: uname(r), fullName: 'ทดสอบ ' + r, role: ROLE.STAFF, pin: PIN, mustChangePin: false });
  });
  createUser_(users, { username: uname('sup'), fullName: 'ทดสอบ Supervisor', role: ROLE.SUPERVISOR, pin: PIN, mustChangePin: false });
  createUser_(users, { username: uname('admin'), fullName: 'ทดสอบ Admin', role: ROLE.ADMIN, pin: PIN, mustChangePin: false });

  const eventId = 'ZTE-' + tag;
  appendObject_(readTable_(SHEET.EVENTS), {
    EventID: eventId, EventName: 'zz_test ประชุม ' + tag, EventDate: '2026-12-01',
    Status: EVENT_STATUS.OPEN, QuorumThreshold: 10, OpenedAt: nowIso_(), ClosedAt: '',
  });

  const digits = tag.replace(/[^0-9]/g, '7');
  const M = {
    a: '00' + digits + '1',
    b: '00' + digits + '2',
    inactive: '00' + digits + '3',
    paper: '00' + digits + '4',
    walkIn: '00' + digits + '5',
  };
  const memberTable = readTable_(SHEET.MEMBERS);
  [['a', 'นายสมชาย ใจดี'], ['b', 'นางสมหญิง รักงาน'], ['inactive', 'นายพ้น สภาพ'], ['paper', 'นางสาวกระดาษ จดไว้']]
    .forEach(function (x) {
      appendObject_(memberTable, {
        MemberID: M[x[0]], FullName: 'zz_test ' + x[1], Office: 'สสจ.มุกดาหาร',
        MemberType: MEMBER_TYPE.ORDINARY, Active: x[0] !== 'inactive', UpdatedAt: nowIso_(), UpdatedBy: 'TEST',
      });
    });
  invalidateMembersCache_();

  const login = function (role, stationId) {
    return expectCode(call('auth.login', { username: uname(role), pin: PIN, stationId: stationId }), 'OK').data.token;
  };
  const staff1 = login('staff1', '01');
  const staff2 = login('staff2', '02');
  const sup = login('sup');
  const admin = login('admin');
  const rid = function () { return Utilities.getUuid(); };
  const rowsFor = function (memberId) {
    return findObjects_(readTable_(SHEET.CHECKINS), function (c) {
      return toText_(c.EventID) === eventId && toText_(c.MemberID) === memberId;
    });
  };

  // ---- members.list ----
  test('members.list: เฉพาะ Active, 4 ฟิลด์, MemberID มีศูนย์นำหน้า', function () {
    const res = expectCode(call('members.list', {}, staff1), 'OK');
    const a = res.data.items.filter(function (m) { return m.memberId === M.a; })[0];
    assert(a, 'ไม่พบสมาชิก ' + M.a);
    assert(JSON.stringify(Object.keys(a).sort()) === JSON.stringify(['fullName', 'memberId', 'memberType', 'office']), 'ฟิลด์เกิน: ' + Object.keys(a));
    assert(!res.data.items.some(function (m) { return m.memberId === M.inactive; }), 'ส่งสมาชิกที่ไม่ Active ไปด้วย');
    const again = expectCode(call('members.list', {}, staff2), 'OK');
    assert(again.data.items.length === res.data.items.length, 'ผลจาก cache ไม่ตรงกับครั้งแรก');
  });

  // ---- checkin.create ----
  let firstRequest = '';
  let firstTime = '';
  test('ลงทะเบียนใหม่ → REGISTERED และมี 1 แถว', function () {
    firstRequest = rid();
    const res = expectCode(call('checkin.create', { memberId: M.a }, staff1, firstRequest), 'REGISTERED');
    assert(res.success === true, 'success ต้องเป็น true');
    assert(res.data.checkin.stationId === '01' && res.data.checkin.source === CHECKIN_SOURCE.STATION, 'Station/Source ผิด');
    assert(res.data.member.memberId === M.a, 'memberId ในผลลัพธ์ผิด');
    firstTime = res.data.checkin.checkinTime;
    assert(rowsFor(M.a).length === 1, 'จำนวนแถวไม่ใช่ 1');
  });

  test('RequestID เดิมซ้ำ 3 ครั้ง → REGISTERED ผลเดิม และยังมี 1 แถว', function () {
    for (let i = 0; i < 3; i++) {
      const res = expectCode(call('checkin.create', { memberId: M.a }, staff1, firstRequest), 'REGISTERED');
      assert(res.data.replayed === true, 'ควรระบุว่าเป็นผลเดิม');
      assert(res.data.checkin.checkinTime === firstTime, 'เวลาเปลี่ยน');
    }
    assert(rowsFor(M.a).length === 1, 'มีแถวใหม่เกิดขึ้น');
  });

  test('อีก Station ลงทะเบียนสมาชิกเดิมด้วย RequestID ใหม่ → ALREADY_REGISTERED พร้อมเวลา/Station แรก', function () {
    const res = expectCode(call('checkin.create', { memberId: M.a }, staff2, rid()), 'ALREADY_REGISTERED');
    assert(res.success === false, 'success ต้องเป็น false');
    assert(res.data.checkin.stationId === '01' && res.data.checkin.checkinTime === firstTime, 'ไม่ได้คืนข้อมูลครั้งแรก');
    assert(rowsFor(M.a).length === 1, 'มีแถวใหม่เกิดขึ้น');
  });

  test('RequestID เดิมแต่สมาชิกต่างคน → INVALID_INPUT ไม่เขียนอะไร', function () {
    expectCode(call('checkin.create', { memberId: M.b }, staff1, firstRequest), 'INVALID_INPUT');
    assert(rowsFor(M.b).length === 0, 'มีแถวของ M.b เกิดขึ้น');
  });

  test('สมาชิกไม่ Active / ไม่มี / requestId ผิด / ไม่ได้เลือกสมาชิก', function () {
    expectCode(call('checkin.create', { memberId: M.inactive }, staff1, rid()), 'MEMBER_INACTIVE');
    expectCode(call('checkin.create', { memberId: 'ZZ-NOPE-' + tag }, staff1, rid()), 'MEMBER_NOT_FOUND');
    expectCode(call('checkin.create', { memberId: M.b }, staff1, 'short'), 'INVALID_INPUT');
    expectCode(call('checkin.create', { memberId: M.b }, staff1), 'INVALID_INPUT');
    expectCode(call('checkin.create', {}, staff1, rid()), 'INVALID_INPUT');
    assert(rowsFor(M.inactive).length === 0 && rowsFor(M.b).length === 0, 'มีแถวเกิดขึ้นจากคำขอที่ไม่ผ่าน');
  });

  test('ไม่มี Open Event → EVENT_CLOSED', function () {
    setTestEventStatus_(eventId, EVENT_STATUS.CLOSED);
    try {
      expectCode(call('checkin.create', { memberId: M.b }, staff1, rid()), 'EVENT_CLOSED');
    } finally {
      setTestEventStatus_(eventId, EVENT_STATUS.OPEN);
    }
    assert(rowsFor(M.b).length === 0, 'มีแถวเกิดขึ้นตอนงานปิด');
  });

  test('client ส่ง eventId/stationId มาเองไม่มีผล', function () {
    const res = expectCode(call('checkin.create', { memberId: M.b, eventId: 'FAKE', stationId: '08' }, staff2, rid()), 'REGISTERED');
    assert(res.data.checkin.eventId === eventId && res.data.checkin.stationId === '02', 'ใช้ค่าจาก client');
  });

  test('สิทธิ์: Supervisor/Admin ลงทะเบียนไม่ได้, Staff ยกเลิก/นำเข้ากระดาษ/เพิ่มสมาชิกไม่ได้', function () {
    expectCode(call('checkin.create', { memberId: M.b }, sup, rid()), 'FORBIDDEN');
    expectCode(call('checkin.create', { memberId: M.b }, admin, rid()), 'FORBIDDEN');
    expectCode(call('admin.checkins.cancel', { memberId: M.a, reason: 'x' }, staff1), 'FORBIDDEN');
    expectCode(call('admin.checkins.paper', { memberId: M.paper }, sup, rid()), 'FORBIDDEN');
    expectCode(call('admin.members.add', { memberId: M.walkIn }, staff1), 'FORBIDDEN');
  });

  // ---- checkin.status ----
  test('checkin.status ด้วย requestId และ memberId', function () {
    const byReq = expectCode(call('checkin.status', { requestId: firstRequest }, staff1), 'OK');
    assert(byReq.data.found && byReq.data.checkin.memberId === M.a, 'ค้นด้วย requestId ไม่เจอ');
    const unknown = expectCode(call('checkin.status', { requestId: rid() }, staff1), 'OK');
    assert(unknown.data.found === false, 'requestId ที่ไม่เคยส่งต้องไม่เจอ');
    const byMember = expectCode(call('checkin.status', { memberId: M.a }, staff2), 'OK');
    assert(byMember.data.found && byMember.data.checkin.status === CHECKIN_STATUS.REGISTERED, 'สถานะผิด');
    const notYet = expectCode(call('checkin.status', { memberId: M.paper }, staff2), 'OK');
    assert(notYet.data.found === false && notYet.data.member.memberId === M.paper, 'สมาชิกที่ยังไม่ลงทะเบียน');
    expectCode(call('checkin.status', {}, staff2), 'INVALID_INPUT');
  });

  // ---- Cancellation / Re-check-in ----
  test('ยกเลิกต้องมีเหตุผล; ยกเลิกแล้ว RequestID เดิมใช้ลงทะเบียนซ้ำไม่ได้', function () {
    expectCode(call('admin.checkins.cancel', { memberId: M.a }, admin), 'INVALID_INPUT');
    expectCode(call('admin.checkins.cancel', { memberId: M.a, reason: 'กดผิดคน' }, admin), 'OK');
    expectCode(call('admin.checkins.cancel', { memberId: M.a, reason: 'ซ้ำ' }, admin), 'INVALID_INPUT');
    assert(rowsFor(M.a)[0].Status === CHECKIN_STATUS.CANCELLED, 'สถานะไม่ใช่ CANCELLED');
    expectCode(call('checkin.create', { memberId: M.a }, staff1, firstRequest), 'INVALID_INPUT');
    assert(rowsFor(M.a)[0].Status === CHECKIN_STATUS.CANCELLED, 'retry เก่าทำให้กลับมาลงทะเบียน');
  });

  test('Re-check-in หลังยกเลิก → REGISTERED ในแถวเดิม', function () {
    const before = rowsFor(M.a)[0];
    const res = expectCode(call('checkin.create', { memberId: M.a }, staff2, rid()), 'REGISTERED');
    const rows = rowsFor(M.a);
    assert(rows.length === 1, 'จำนวนแถวไม่ใช่ 1');
    assert(rows[0].CheckinID === before.CheckinID && rows[0]._row === before._row, 'ไม่ได้ใช้แถวเดิม');
    assert(rows[0].Status === CHECKIN_STATUS.REGISTERED && toText_(rows[0].StationID) === '02', 'แถวไม่ได้อัปเดต');
    assert(res.data.replayed === false, 'ไม่ควรเป็นผลเดิม');
  });

  // ---- Paper Check-in ----
  test('Paper Check-in: เวลาตามกระดาษ, Source=PAPER, กันซ้ำด้วยกฎเดียวกัน', function () {
    const paperRequest = rid();
    const paperTime = minutesAgoIso_(45);
    const payload = { memberId: M.paper, checkinTime: paperTime, stationId: '03', reason: 'เน็ตล่ม 08:00–08:30' };
    expectCode(call('admin.checkins.paper', { memberId: M.paper, checkinTime: '2999-01-01T00:00:00+07:00', stationId: '03', reason: 'x' }, admin, rid()), 'INVALID_INPUT');
    expectCode(call('admin.checkins.paper', { memberId: M.paper, checkinTime: 'เมื่อเช้า', stationId: '03', reason: 'x' }, admin, rid()), 'INVALID_INPUT');
    expectCode(call('admin.checkins.paper', { memberId: M.paper, checkinTime: payload.checkinTime, stationId: 'NOPE', reason: 'x' }, admin, rid()), 'INVALID_INPUT');
    expectCode(call('admin.checkins.paper', { memberId: M.paper, checkinTime: payload.checkinTime, stationId: '03' }, admin, rid()), 'INVALID_INPUT');
    const res = expectCode(call('admin.checkins.paper', payload, admin, paperRequest), 'REGISTERED');
    assert(res.data.checkin.source === CHECKIN_SOURCE.PAPER, 'Source ไม่ใช่ PAPER');
    assert(res.data.checkin.checkinTime === paperTime, 'เวลาไม่ตรงกับกระดาษ: ' + res.data.checkin.checkinTime);
    expectCode(call('admin.checkins.paper', payload, admin, paperRequest), 'REGISTERED');
    expectCode(call('admin.checkins.paper', payload, admin, rid()), 'ALREADY_REGISTERED');
    expectCode(call('checkin.create', { memberId: M.paper }, staff1, rid()), 'ALREADY_REGISTERED');
    assert(rowsFor(M.paper).length === 1, 'จำนวนแถวไม่ใช่ 1');
  });

  test('Paper Check-in หลังปิดงานโดยระบุ eventId', function () {
    expectCode(call('admin.checkins.cancel', { memberId: M.paper, reason: 'ทดสอบนำเข้าหลังปิดงาน' }, admin), 'OK');
    setTestEventStatus_(eventId, EVENT_STATUS.CLOSED);
    try {
      const payload = { memberId: M.paper, checkinTime: minutesAgoIso_(40), stationId: '03', reason: 'กระดาษ' };
      expectCode(call('admin.checkins.paper', payload, admin, rid()), 'EVENT_CLOSED');
      payload.eventId = eventId;
      expectCode(call('admin.checkins.paper', payload, admin, rid()), 'REGISTERED');
    } finally {
      setTestEventStatus_(eventId, EVENT_STATUS.OPEN);
    }
    assert(rowsFor(M.paper).length === 1, 'จำนวนแถวไม่ใช่ 1');
  });

  // ---- Walk-in ----
  test('เพิ่ม Walk-in Member ระหว่างงาน → เห็นใน members.list ทันที แล้วลงทะเบียนได้', function () {
    const payload = { memberId: M.walkIn, fullName: '  zz_test นายมา   ทีหลัง ', office: 'รพ.สต.', memberType: MEMBER_TYPE.ORDINARY, reason: 'สมัครหลังปิดรายชื่อ' };
    expectCode(call('admin.members.add', { memberId: M.walkIn, fullName: 'x', memberType: MEMBER_TYPE.ORDINARY }, admin), 'INVALID_INPUT');
    expectCode(call('admin.members.add', { memberId: M.walkIn, fullName: 'x', memberType: 'VIP', reason: 'x' }, admin), 'INVALID_INPUT');
    const res = expectCode(call('admin.members.add', payload, admin), 'OK');
    assert(res.data.member.fullName === 'zz_test นายมา ทีหลัง', 'ไม่ได้ตัดช่องว่างเกิน: ' + res.data.member.fullName);
    expectCode(call('admin.members.add', payload, admin), 'INVALID_INPUT');
    const list = expectCode(call('members.list', {}, staff1), 'OK');
    assert(list.data.items.some(function (m) { return m.memberId === M.walkIn; }), 'ไม่เห็นสมาชิกใหม่ใน members.list');
    expectCode(call('checkin.create', { memberId: M.walkIn }, staff1, rid()), 'REGISTERED');
  });

  // ---- History ----
  test('checkin.history: Staff เห็นเฉพาะ Station ตัวเอง, Supervisor เห็นทั้งหมด', function () {
    const s1 = expectCode(call('checkin.history', { stationId: '02' }, staff1), 'OK');
    assert(s1.data.items.length > 0 && s1.data.items.every(function (i) { return i.stationId === '01'; }), 'Staff เห็น Station อื่น');
    assert(s1.data.items.every(function (i) { return i.eventId === eventId; }), 'Staff เห็น Event อื่น');
    assert(s1.data.items[0].fullName, 'ไม่มีชื่อสมาชิกในประวัติ');
    const all = expectCode(call('checkin.history', {}, sup), 'OK');
    const stations = {};
    all.data.items.forEach(function (i) { stations[i.stationId] = true; });
    assert(stations['01'] && stations['02'] && stations['03'], 'Supervisor ไม่เห็นทุก Station');
    const only3 = expectCode(call('checkin.history', { stationId: '03' }, sup), 'OK');
    assert(only3.data.items.every(function (i) { return i.stationId === '03'; }), 'กรอง Station ไม่ทำงาน');
  });

  // ---- Invariant + Audit ----
  test('ทุกคู่ Event+Member มีไม่เกิน 1 แถว', function () {
    const seen = {};
    findObjects_(readTable_(SHEET.CHECKINS), function (c) { return toText_(c.EventID) === eventId; }).forEach(function (c) {
      const key = toText_(c.MemberID);
      assert(!seen[key], 'พบแถวซ้ำของ ' + key);
      seen[key] = true;
    });
  });

  test('Audit Log มีครบ: CHECKIN, RECHECKIN, CHECKIN_CANCELLED (พร้อมเหตุผล), CHECKIN_PAPER, MEMBER_ADDED', function () {
    const table = readTable_(SHEET.AUDIT);
    const logs = findObjects_(table, function (l) { return toText_(l.Details).indexOf(eventId) !== -1 || toText_(l.EntityID) === M.walkIn; });
    const actions = logs.map(function (l) { return l.Action; });
    ['CHECKIN', 'RECHECKIN', 'CHECKIN_CANCELLED', 'CHECKIN_PAPER', 'MEMBER_ADDED'].forEach(function (a) {
      assert(actions.indexOf(a) !== -1, 'ไม่มี ' + a);
    });
    const cancel = logs.filter(function (l) { return l.Action === 'CHECKIN_CANCELLED'; })[0];
    assert(cancel.Reason === 'กดผิดคน', 'ไม่ได้บันทึกเหตุผลการยกเลิก');
  });

  // ---- ล้างข้อมูลทดสอบ ----
  closeTestEvents_();
  const mt = readTable_(SHEET.MEMBERS);
  findObjects_(mt, function (m) { return toText_(m.FullName).indexOf('zz_test') === 0 && toBool_(m.Active); })
    .forEach(function (m) { updateObject_(mt, m._row, { Active: false }); });
  invalidateMembersCache_();
  deactivateTestUsers_();

  return kit.report();
}

function minutesAgoIso_(minutes) {
  return isoAfterMinutes_(-minutes);
}

function setTestEventStatus_(eventId, status) {
  const table = readTable_(SHEET.EVENTS);
  const e = findObject_(table, function (x) { return toText_(x.EventID) === eventId; });
  updateObject_(table, e._row, { Status: status });
}

function closeTestEvents_() {
  const table = readTable_(SHEET.EVENTS);
  findObjects_(table, function (e) { return e.Status === EVENT_STATUS.OPEN && toText_(e.EventName).indexOf('zz_test') === 0; })
    .forEach(function (e) { updateObject_(table, e._row, { Status: EVENT_STATUS.CLOSED, ClosedAt: nowIso_() }); });
}
