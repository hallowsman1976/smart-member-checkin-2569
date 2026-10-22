/**
 * ชุดทดสอบ Phase 4 (Dashboard, Admin, Reports, Backup) — รันบนสเปรดชีต staging ที่ตั้ง TEST_MODE=true
 * ห้ามรันขณะมี Open Event จริง; การนำเข้าสมาชิกจะเขียนตาราง Members ใหม่ทั้งตาราง (ค่าเดิม)
 */

function runPhase4Tests() {
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

  const PIN = '482916';
  const uname = function (role) { return 'zz_test_' + role + '_' + tag; };
  const users = readTable_(SHEET.USERS);
  createUser_(users, { username: uname('staff'), fullName: 'ทดสอบ Staff', role: ROLE.STAFF, pin: PIN, mustChangePin: false });
  createUser_(users, { username: uname('sup'), fullName: 'ทดสอบ Supervisor', role: ROLE.SUPERVISOR, pin: PIN, mustChangePin: false });
  createUser_(users, { username: uname('admin'), fullName: 'ทดสอบ Admin', role: ROLE.ADMIN, pin: PIN, mustChangePin: false });
  const login = function (role, stationId) {
    return expectCode(call('auth.login', { username: uname(role), pin: PIN, stationId: stationId }), 'OK').data.token;
  };
  const staff = login('staff', '01');
  const sup = login('sup');
  const admin = login('admin');
  const rid = function () { return Utilities.getUuid(); };

  const digits = tag.replace(/[^0-9]/g, '8');
  const ids = { o1: '09' + digits + '1', o2: '09' + digits + '2', a1: '09' + digits + '3', imp: '09' + digits + '4' };

  // ---- Events ----
  let eventId = '';
  test('สร้างงาน (DRAFT) แล้วเปิด; เปิดซ้อนไม่ได้', function () {
    expectCode(call('admin.events.upsert', { eventName: 'zz_test x', eventDate: '21/12/2569', quorumThreshold: 2 }, admin), 'INVALID_INPUT');
    expectCode(call('admin.events.upsert', { eventName: 'zz_test x', eventDate: '2026-12-20', quorumThreshold: -1 }, admin), 'INVALID_INPUT');
    const res = expectCode(call('admin.events.upsert', { eventName: 'zz_test ประชุม ' + tag, eventDate: '2026-12-20', quorumThreshold: 2 }, admin), 'OK');
    eventId = res.data.eventId;
    const other = expectCode(call('admin.events.upsert', { eventName: 'zz_test อื่น ' + tag, eventDate: '2026-12-21', quorumThreshold: 1 }, admin), 'OK');
    const list = expectCode(call('events.list', {}, sup), 'OK');
    const ev = list.data.items.filter(function (e) { return e.eventId === eventId; })[0];
    assert(ev && ev.status === EVENT_STATUS.DRAFT, 'สถานะเริ่มต้นไม่ใช่ DRAFT');

    // นำเข้าสมาชิกทดสอบก่อนเปิดงาน
    expectCode(call('admin.members.importBatch', { rows: [
      { memberId: ids.o1, fullName: 'zz_test นายหนึ่ง   สามัญ', office: 'สสจ.', memberType: 'ORDINARY' },
      { memberId: ids.o2, fullName: 'zz_test นางสอง สามัญ', office: 'สสจ.', memberType: 'ORDINARY' },
      { memberId: ids.a1, fullName: 'zz_test นายสาม สมทบ', office: 'รพ.', memberType: 'ASSOCIATE' },
    ] }, admin), 'OK');

    expectCode(call('admin.events.open', { eventId: eventId }, admin), 'OK');
    expectCode(call('admin.events.open', { eventId: other.data.eventId }, admin), 'INVALID_INPUT');
    expectCode(call('admin.events.open', { eventId: eventId }, admin), 'INVALID_INPUT');
    assert(findOpenEvent_().eventId === eventId, 'Open Event ไม่ใช่งานที่เปิด');
  });

  // ---- Import ----
  test('นำเข้าไฟล์ขณะงานเปิดอยู่ไม่ได้', function () {
    expectCode(call('admin.members.importBatch', { rows: [{ memberId: ids.imp, fullName: 'x', memberType: 'ORDINARY' }] }, admin), 'INVALID_INPUT');
  });

  // ---- Dashboard ----
  test('Dashboard นับจากชีตจริง; Quorum นับเฉพาะสามัญ; Display ไม่มีชื่อ', function () {
    expectCode(call('checkin.create', { memberId: ids.o1 }, staff, rid()), 'REGISTERED');
    expectCode(call('checkin.create', { memberId: ids.a1 }, staff, rid()), 'REGISTERED');
    invalidateSummaryCache_(eventId);
    const res = expectCode(call('dashboard.summary', {}, sup), 'OK');
    const registeredRows = findObjects_(readTable_(SHEET.CHECKINS), function (c) {
      return toText_(c.EventID) === eventId && c.Status === CHECKIN_STATUS.REGISTERED;
    }).length;
    assert(res.data.totals.registered === registeredRows && registeredRows === 2, 'ยอดลงทะเบียนไม่ตรงกับชีต: ' + res.data.totals.registered);
    assert(res.data.quorum.ordinaryRegistered === 1 && res.data.quorum.threshold === 2, 'Quorum ผิด: ' + JSON.stringify(res.data.quorum));
    assert(res.data.quorum.reached === false && res.data.quorum.remaining === 1, 'สถานะครบองค์ประชุมผิด');
    const st = res.data.byStation.filter(function (s) { return s.stationId === '01'; })[0];
    assert(st && st.registered === 2, 'ยอดราย Station ผิด');
    assert(res.data.recent[0].fullName.indexOf('zz_test') === 0, 'รายการล่าสุดไม่มีชื่อ');

    expectCode(call('checkin.create', { memberId: ids.o2 }, staff, rid()), 'REGISTERED');
    invalidateSummaryCache_(eventId);
    const after = expectCode(call('dashboard.summary', {}, sup), 'OK');
    assert(after.data.quorum.reached === true, 'ควรครบองค์ประชุมแล้ว');

    const display = expectCode(call('display.summary', {}, sup), 'OK');
    assert(JSON.stringify(display.data).indexOf('zz_test น') === -1, 'Display มีชื่อสมาชิก');
    assert(display.data.totals.registered === 3, 'Display ยอดผิด');
  });

  test('สิทธิ์: Staff ดู Dashboard ไม่ได้, Supervisor ใช้เมนู Admin ไม่ได้', function () {
    expectCode(call('dashboard.summary', {}, staff), 'FORBIDDEN');
    expectCode(call('display.summary', {}, staff), 'FORBIDDEN');
    expectCode(call('reports.export', {}, staff), 'FORBIDDEN');
    expectCode(call('admin.members.list', {}, sup), 'FORBIDDEN');
    expectCode(call('admin.users.list', {}, sup), 'FORBIDDEN');
    expectCode(call('admin.events.close', { eventId: eventId }, sup), 'FORBIDDEN');
  });

  // ---- Members ----
  test('แก้ไขสมาชิกต้องมีเหตุผล; ปิดสิทธิ์แล้วหายจาก members.list', function () {
    expectCode(call('admin.members.update', { memberId: ids.a1, active: false }, admin), 'INVALID_INPUT');
    expectCode(call('admin.members.update', { memberId: 'ZZ-NOPE', active: false, reason: 'x' }, admin), 'MEMBER_NOT_FOUND');
    expectCode(call('admin.members.update', { memberId: ids.a1, memberType: 'VIP', reason: 'x' }, admin), 'INVALID_INPUT');
    expectCode(call('admin.members.update', { memberId: ids.a1, active: false, office: 'รพ.ใหม่', reason: 'ลาออก' }, admin), 'OK');
    const list = expectCode(call('members.list', {}, staff), 'OK');
    assert(!list.data.items.some(function (m) { return m.memberId === ids.a1; }), 'ยังเห็นสมาชิกที่ปิดสิทธิ์');
    const all = expectCode(call('admin.members.list', {}, admin), 'OK');
    const a1 = all.data.items.filter(function (m) { return m.memberId === ids.a1; })[0];
    assert(a1 && a1.active === false && a1.office === 'รพ.ใหม่', 'admin.members.list ไม่สะท้อนการแก้ไข');
    expectCode(call('checkin.status', { memberId: ids.a1 }, staff), 'OK');
    expectCode(call('checkin.create', { memberId: ids.a1 }, staff, rid()), 'MEMBER_INACTIVE');
  });

  // ---- Reports ----
  test('reports.export: หนึ่งแถวต่อสมาชิก รวมผู้ที่ยังไม่ลงทะเบียน', function () {
    expectCode(call('admin.checkins.cancel', { memberId: ids.o2, reason: 'ทดสอบ' }, admin), 'OK');
    const res = expectCode(call('reports.export', {}, sup), 'OK');
    const byId = {};
    res.data.rows.forEach(function (r) { byId[r.memberId] = r; });
    assert(byId[ids.o1].status === 'REGISTERED' && byId[ids.o1].checkinTime && byId[ids.o1].stationId === '01', 'แถว REGISTERED ผิด');
    assert(byId[ids.o2].status === 'CANCELLED' && !byId[ids.o2].checkinTime, 'แถว CANCELLED ผิด');
    assert(byId[ids.a1] && byId[ids.a1].status === 'REGISTERED', 'สมาชิกที่ปิดสิทธิ์แต่ลงทะเบียนแล้วต้องอยู่ในรายงาน');
    const activeCount = findObjects_(readTable_(SHEET.MEMBERS), function (m) { return toText_(m.MemberID) && toBool_(m.Active); }).length;
    const notReg = res.data.rows.filter(function (r) { return r.status === 'NOT_REGISTERED'; }).length;
    assert(notReg > 0 || activeCount <= 3, 'ไม่มีแถว NOT_REGISTERED');
    assert(res.data.rows.length === activeCount + 1, 'จำนวนแถวไม่ตรง: ' + res.data.rows.length + ' vs ' + (activeCount + 1));
  });

  // ---- Users ----
  test('ผู้ใช้: สร้าง/PIN อ่อน/ชื่อซ้ำ/รีเซ็ต PIN/ปลดล็อก/เปลี่ยนบทบาท', function () {
    const u = uname('new');
    expectCode(call('admin.users.create', { username: u, fullName: 'ใหม่', role: 'STAFF', pin: '111111' }, admin), 'INVALID_INPUT');
    expectCode(call('admin.users.create', { username: 'A B', fullName: 'ใหม่', role: 'STAFF', pin: '592731' }, admin), 'INVALID_INPUT');
    const created = expectCode(call('admin.users.create', { username: u, fullName: 'ใหม่', role: 'STAFF', pin: '592731' }, admin), 'OK');
    expectCode(call('admin.users.create', { username: u, fullName: 'ซ้ำ', role: 'STAFF', pin: '592731' }, admin), 'INVALID_INPUT');
    expectCode(call('auth.login', { username: u, pin: '592731', stationId: '01' }), 'MUST_CHANGE_PIN');

    for (let i = 0; i < 5; i++) call('auth.login', { username: u, pin: '000999', stationId: '01' });
    const listed = expectCode(call('admin.users.list', {}, admin), 'OK').data.items.filter(function (x) { return x.username === u; })[0];
    assert(listed.lockedUntil, 'ไม่แสดงสถานะถูกล็อก');
    assert(!('pinHash' in listed) && !('pinSalt' in listed) && JSON.stringify(listed).indexOf('PinHash') === -1, 'ส่ง PIN hash ออกไป');
    expectCode(call('admin.users.update', { userId: created.data.userId, unlock: true }, admin), 'OK');
    expectCode(call('auth.login', { username: u, pin: '592731', stationId: '01' }), 'MUST_CHANGE_PIN');

    expectCode(call('admin.users.update', { userId: created.data.userId, resetPin: '123456' }, admin), 'INVALID_INPUT');
    expectCode(call('admin.users.update', { userId: created.data.userId, resetPin: '730159' }, admin), 'OK');
    expectCode(call('auth.login', { username: u, pin: '592731', stationId: '01' }), 'UNAUTHORIZED');
    expectCode(call('auth.login', { username: u, pin: '730159', stationId: '01' }), 'MUST_CHANGE_PIN');

    expectCode(call('admin.users.update', { userId: created.data.userId, role: 'GOD' }, admin), 'INVALID_INPUT');
    expectCode(call('admin.users.update', { userId: created.data.userId, role: 'SUPERVISOR', fullName: 'เลื่อนตำแหน่ง' }, admin), 'OK');
    expectCode(call('admin.users.update', { userId: created.data.userId }, admin), 'INVALID_INPUT');
  });

  // ---- Stations ----
  test('จุดลงทะเบียน: เพิ่ม/ปิด แล้วหายจาก stations.list', function () {
    const sid = 'Z' + tag.slice(0, 5);
    expectCode(call('admin.stations.upsert', { stationId: 'bad id', stationName: 'x' }, admin), 'INVALID_INPUT');
    expectCode(call('admin.stations.upsert', { stationId: sid, stationName: 'zz_test จุดเสริม' }, admin), 'OK');
    assert(expectCode(call('stations.list', {}), 'OK').data.items.some(function (s) { return s.stationId === sid; }), 'ไม่เห็นจุดใหม่');
    expectCode(call('admin.stations.upsert', { stationId: sid, stationName: 'zz_test จุดเสริม', active: false }, admin), 'OK');
    assert(!expectCode(call('stations.list', {}), 'OK').data.items.some(function (s) { return s.stationId === sid; }), 'ยังเห็นจุดที่ปิด');
  });

  // ---- Close ----
  test('ปิดงาน → CLOSED, ลงทะเบียนไม่ได้, เปิดใหม่ต้องมีเหตุผล', function () {
    const res = expectCode(call('admin.events.close', { eventId: eventId }, admin), 'OK');
    assert(findOpenEvent_() === null, 'ยังมี Open Event');
    if (getProp_('BACKUP_SPREADSHEET_ID')) assert(res.data.backupSheet, 'ไม่ได้สำรองผลสุดท้าย');
    expectCode(call('checkin.create', { memberId: ids.o2 }, staff, rid()), 'EVENT_CLOSED');
    expectCode(call('admin.events.open', { eventId: eventId }, admin), 'INVALID_INPUT');
    expectCode(call('admin.events.open', { eventId: eventId, reason: 'ทดสอบเปิดใหม่' }, admin), 'OK');
    expectCode(call('admin.events.close', { eventId: eventId }, admin), 'OK');
  });

  test('นำเข้าไฟล์: เพิ่ม/ปรับปรุง, ศูนย์นำหน้าไม่หาย, ตรวจข้อมูลผิด', function () {
    expectCode(call('admin.members.importBatch', { rows: [] }, admin), 'INVALID_INPUT');
    const dup = expectCode(call('admin.members.importBatch', { rows: [
      { memberId: ids.imp, fullName: 'zz_test ก', memberType: 'ORDINARY' },
      { memberId: ids.imp, fullName: 'zz_test ข', memberType: 'ORDINARY' },
      { memberId: '', fullName: '', memberType: 'X' },
    ] }, admin), 'INVALID_INPUT');
    assert(dup.data.errors.length >= 3, 'ไม่ได้รายงานข้อผิดพลาดครบ');
    const big = [];
    for (let i = 0; i < 501; i++) big.push({ memberId: 'X' + i, fullName: 'x', memberType: 'ORDINARY' });
    expectCode(call('admin.members.importBatch', { rows: big }, admin), 'INVALID_INPUT');

    const before = findObjects_(readTable_(SHEET.MEMBERS), function (m) { return !!toText_(m.MemberID); }).length;
    const res = expectCode(call('admin.members.importBatch', { fileName: 'test.xlsx', rows: [
      { memberId: ids.imp, fullName: 'zz_test นำเข้า ใหม่', office: '=HYPERLINK("x")', memberType: 'ORDINARY' },
      { memberId: ids.o1, fullName: 'zz_test นายหนึ่ง แก้ชื่อ', office: 'สสจ.', memberType: 'ORDINARY' },
    ] }, admin), 'OK');
    assert(res.data.inserted === 1 && res.data.updated === 1, JSON.stringify(res.data));
    const table = readTable_(SHEET.MEMBERS);
    assert(findObjects_(table, function (m) { return !!toText_(m.MemberID); }).length === before + 1, 'จำนวนสมาชิกผิด');
    const imp = findMemberById_(table, ids.imp);
    assert(imp && toText_(imp.MemberID) === ids.imp, 'ศูนย์นำหน้าหาย');
    assert(toText_(imp.Office) === '=HYPERLINK("x")', 'formula ถูกตีความ: ' + imp.Office);
    assert(toText_(findMemberById_(table, ids.o1).FullName) === 'zz_test นายหนึ่ง แก้ชื่อ', 'ไม่ได้ปรับปรุงสมาชิกเดิม');
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
