/**
 * ชุดทดสอบ Phase 1 — รันได้ทั้งใน Apps Script editor (สเปรดชีต staging) และ Node harness (tests/gas-harness)
 * ต้องตั้ง Script Property TEST_MODE=true เพื่อกันการรันบนสเปรดชีตจริง
 * ผู้ใช้/Station ที่ใช้ทดสอบขึ้นต้นด้วย zz_test_ และถูกปิดใช้งานเมื่อจบ
 */

function runPhase1Tests() {
  if (getProp_('TEST_MODE') !== 'true') {
    throw new Error('ตั้ง Script Property TEST_MODE=true และใช้ SPREADSHEET_ID ของ staging ก่อนรันชุดทดสอบ');
  }

  const results = [];
  const test = function (name, fn) {
    try {
      fn();
      results.push({ name: name, ok: true });
    } catch (err) {
      results.push({ name: name, ok: false, error: err.message });
    }
  };
  const proxyKey = getProp_('PROXY_KEY');
  const call = function (action, payload, token) {
    return handleRequest_({ proxyKey: proxyKey, action: action, payload: payload || {}, token: token });
  };
  const expectCode = function (res, code) {
    if (res.code !== code) throw new Error('คาดว่าได้ ' + code + ' แต่ได้ ' + res.code + ' (' + res.message + ')');
    return res;
  };
  const assert = function (cond, message) { if (!cond) throw new Error(message); };

  const tag = Utilities.getUuid().replace(/-/g, '').slice(0, 6);
  const PIN = { staff: '482916', supervisor: '593027', admin: '735204', fresh: '264815', freshNew: '615283' };
  const name = function (role) { return 'zz_test_' + role + '_' + tag; };
  const stationOff = 'ZT' + tag;

  test('initializeSheets รันซ้ำแล้ว header และข้อมูลเดิมไม่เสียหาย', function () {
    initializeSheets();
    const before = headerSnapshot_();
    const memberId = '000' + tag.replace(/\D/g, '1');
    appendObject_(readTable_(SHEET.MEMBERS), {
      MemberID: memberId, FullName: 'zz_test สมาชิก', Office: 'ทดสอบ',
      MemberType: MEMBER_TYPE.ORDINARY, Active: true, UpdatedAt: nowIso_(), UpdatedBy: 'TEST',
    });
    const result = initializeSheets();
    assert(JSON.stringify(headerSnapshot_()) === JSON.stringify(before), 'header เปลี่ยนหลังรันครั้งที่ 2');
    assert(result.createdSheets.length === 0, 'รันครั้งที่ 2 ไม่ควรสร้างชีตใหม่');
    assert(result.admin === null, 'รันครั้งที่ 2 ไม่ควรสร้าง Admin ใหม่');
    const found = findObject_(readTable_(SHEET.MEMBERS), function (m) { return m.MemberID === memberId; });
    assert(found, 'ข้อมูลสมาชิกหายหลังรันครั้งที่ 2');
    assert(String(found.MemberID) === memberId, 'ศูนย์นำหน้า MemberID หาย: ' + found.MemberID);
    assert(readTable_(SHEET.STATIONS).rows.length >= DEFAULT_STATION_COUNT, 'Station 01–08 ไม่ครบ');
  });

  const users = readTable_(SHEET.USERS);
  createUser_(users, { username: name('staff'), fullName: 'ทดสอบ Staff', role: ROLE.STAFF, pin: PIN.staff, mustChangePin: false });
  createUser_(users, { username: name('sup'), fullName: 'ทดสอบ Supervisor', role: ROLE.SUPERVISOR, pin: PIN.supervisor, mustChangePin: false });
  createUser_(users, { username: name('admin'), fullName: 'ทดสอบ Admin', role: ROLE.ADMIN, pin: PIN.admin, mustChangePin: false });
  createUser_(users, { username: name('fresh'), fullName: 'ทดสอบ PIN แรก', role: ROLE.ADMIN, pin: PIN.fresh, mustChangePin: true });
  createUser_(users, { username: name('lock'), fullName: 'ทดสอบล็อก', role: ROLE.STAFF, pin: PIN.staff, mustChangePin: false });
  createUser_(users, { username: name('off'), fullName: 'ทดสอบปิดบัญชี', role: ROLE.STAFF, pin: PIN.staff, mustChangePin: false });
  appendObject_(readTable_(SHEET.STATIONS), { StationID: stationOff, StationName: 'zz_test ปิด', Active: false });
  const stationTemp = 'ZU' + tag;
  appendObject_(readTable_(SHEET.STATIONS), { StationID: stationTemp, StationName: 'zz_test ชั่วคราว', Active: true });

  const login = function (role, pin, stationId) {
    return call('auth.login', { username: name(role), pin: pin, stationId: stationId });
  };

  test('proxyKey ผิด → UNAUTHORIZED', function () {
    expectCode(handleRequest_({ proxyKey: 'wrong', action: 'auth.login', payload: {} }), 'UNAUTHORIZED');
    expectCode(handleRequest_({ action: 'auth.login', payload: {} }), 'UNAUTHORIZED');
  });

  test('stations.list ไม่ต้อง login และส่งเฉพาะจุดที่ Active', function () {
    const res = expectCode(call('stations.list', {}), 'OK');
    assert(res.data.items.some(function (s) { return s.stationId === '01'; }), 'ไม่มี Station 01');
    assert(!res.data.items.some(function (s) { return s.stationId === stationOff; }), 'ส่ง Station ที่ปิดอยู่');
    assert(JSON.stringify(Object.keys(res.data.items[0]).sort()) === JSON.stringify(['stationId', 'stationName']), 'ฟิลด์เกิน');
  });

  test('action ที่ไม่รู้จัก → INVALID_INPUT', function () {
    expectCode(call('nope.nope', {}), 'INVALID_INPUT');
  });

  test('login: PIN ผิด / ชื่อไม่มี / รูปแบบผิด', function () {
    expectCode(login('staff', '000001', '01'), 'UNAUTHORIZED');
    expectCode(call('auth.login', { username: 'zz_no_such_user', pin: '482916', stationId: '01' }), 'UNAUTHORIZED');
    expectCode(login('staff', '12ab', '01'), 'INVALID_INPUT');
  });

  test('login Staff: ต้องเลือก Station ที่ Active', function () {
    expectCode(login('staff', PIN.staff, ''), 'INVALID_INPUT');
    expectCode(login('staff', PIN.staff, stationOff), 'INVALID_INPUT');
    expectCode(login('staff', PIN.staff, 'NOPE'), 'INVALID_INPUT');
  });

  let staffToken = '';
  test('login Staff ถูกต้อง → OK และ session.me ได้ Role/Station จาก server', function () {
    const res = expectCode(login('staff', PIN.staff, '01'), 'OK');
    staffToken = res.data.token;
    assert(/^[a-f0-9]{64}$/.test(staffToken), 'token รูปแบบผิด');
    const me = expectCode(call('session.me', {}, staffToken), 'OK');
    assert(me.data.user.role === ROLE.STAFF, 'role ผิด');
    assert(me.data.station.stationId === '01', 'station ผิด');
  });

  test('Role ผิด → FORBIDDEN (Staff/Supervisor เรียก audit.list)', function () {
    expectCode(call('audit.list', {}, staffToken), 'FORBIDDEN');
    const sup = expectCode(login('sup', PIN.supervisor), 'OK');
    expectCode(call('audit.list', {}, sup.data.token), 'FORBIDDEN');
    const admin = expectCode(login('admin', PIN.admin), 'OK');
    const list = expectCode(call('audit.list', { limit: 5 }, admin.data.token), 'OK');
    assert(list.data.items.length === 5, 'audit.list limit ไม่ทำงาน');
  });

  test('ไม่ได้ส่ง payload role/station มาทับค่าจาก server', function () {
    const res = handleRequest_({ proxyKey: proxyKey, action: 'session.me', token: staffToken, payload: { role: 'ADMIN', stationId: '08' } });
    expectCode(res, 'OK');
    assert(res.data.user.role === ROLE.STAFF && res.data.station.stationId === '01', 'ค่าจาก client ทับค่าจาก server');
  });

  test('token ไม่มี / ปลอม / หมดอายุ → UNAUTHORIZED', function () {
    expectCode(call('session.me', {}), 'UNAUTHORIZED');
    expectCode(call('session.me', {}, 'abc'), 'UNAUTHORIZED');
    expectCode(call('session.me', {}, new Array(65).join('a')), 'UNAUTHORIZED');
    const res = expectCode(login('staff', PIN.staff, '02'), 'OK');
    destroySession_(res.data.token); // จำลอง cache หมดอายุ
    expectCode(call('session.me', {}, res.data.token), 'UNAUTHORIZED');
  });

  test('logout แล้ว token ใช้ไม่ได้', function () {
    const res = expectCode(login('staff', PIN.staff, '03'), 'OK');
    expectCode(call('auth.logout', {}, res.data.token), 'OK');
    expectCode(call('session.me', {}, res.data.token), 'UNAUTHORIZED');
  });

  test('PIN ผิด 5 ครั้ง → PIN_LOCKED และ PIN ถูกก็เข้าไม่ได้จนกว่าจะปลดล็อก', function () {
    for (let i = 1; i <= 4; i++) expectCode(login('lock', '999990', '01'), 'UNAUTHORIZED');
    const locked = expectCode(login('lock', '999990', '01'), 'PIN_LOCKED');
    assert(locked.data && locked.data.lockedUntil, 'ไม่มีเวลาปลดล็อก');
    expectCode(login('lock', PIN.staff, '01'), 'PIN_LOCKED');
    const table = readTable_(SHEET.USERS);
    const user = findUserByUsername_(table, name('lock'));
    updateObject_(table, user._row, { LockedUntil: '2000-01-01T00:00:00+07:00' }); // จำลองครบ 15 นาที
    expectCode(login('lock', PIN.staff, '01'), 'OK');
  });

  test('ผู้ใช้ใหม่ถูกบังคับเปลี่ยน PIN ก่อนใช้งาน', function () {
    const res = expectCode(login('fresh', PIN.fresh), 'MUST_CHANGE_PIN');
    const token = res.data.token;
    expectCode(call('audit.list', {}, token), 'MUST_CHANGE_PIN');
    expectCode(call('session.me', {}, token), 'OK');
    expectCode(call('auth.changePin', { currentPin: PIN.fresh, newPin: '123456' }, token), 'INVALID_INPUT');
    expectCode(call('auth.changePin', { currentPin: PIN.fresh, newPin: '111111' }, token), 'INVALID_INPUT');
    expectCode(call('auth.changePin', { currentPin: PIN.fresh, newPin: PIN.fresh }, token), 'INVALID_INPUT');
    expectCode(call('auth.changePin', { currentPin: '000999', newPin: PIN.freshNew }, token), 'INVALID_INPUT');
    expectCode(call('auth.changePin', { currentPin: PIN.fresh, newPin: PIN.freshNew }, token), 'OK');
    expectCode(call('audit.list', {}, token), 'OK');
    expectCode(login('fresh', PIN.fresh), 'UNAUTHORIZED');
    expectCode(login('fresh', PIN.freshNew), 'OK');
  });

  test('ปิดบัญชีระหว่างที่ session ยังอยู่ → UNAUTHORIZED ทันที', function () {
    const res = expectCode(login('off', PIN.staff, '01'), 'OK');
    const table = readTable_(SHEET.USERS);
    updateObject_(table, findUserByUsername_(table, name('off'))._row, { Active: false });
    expectCode(call('session.me', {}, res.data.token), 'UNAUTHORIZED');
    expectCode(login('off', PIN.staff, '01'), 'UNAUTHORIZED');
  });

  test('ปิด Station ระหว่างที่ Staff ยัง login อยู่ → UNAUTHORIZED', function () {
    const res = expectCode(login('staff', PIN.staff, stationTemp), 'OK');
    const table = readTable_(SHEET.STATIONS);
    const st = findObject_(table, function (s) { return s.StationID === stationTemp; });
    updateObject_(table, st._row, { Active: false });
    expectCode(call('session.me', {}, res.data.token), 'UNAUTHORIZED');
  });

  test('Audit Log ไม่มี PIN, PinHash หรือ token', function () {
    const table = readTable_(SHEET.AUDIT);
    const secrets = Object.keys(PIN).map(function (k) { return PIN[k]; }).concat([staffToken]);
    const leaked = table.rows.filter(function (row) {
      const text = row.join('|');
      return secrets.some(function (s) { return s && text.indexOf(s) !== -1; });
    });
    assert(leaked.length === 0, 'พบข้อมูลลับใน AuditLogs ' + leaked.length + ' แถว');
    const actions = table.rows.map(function (r) { return r[table.col.Action]; });
    ['LOGIN', 'LOGIN_FAILED', 'PIN_LOCKED', 'PIN_CHANGED', 'LOGOUT'].forEach(function (a) {
      assert(actions.indexOf(a) !== -1, 'ไม่มี Audit action ' + a);
    });
  });

  deactivateTestUsers_();

  const failed = results.filter(function (r) { return !r.ok; });
  results.forEach(function (r) {
    console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : ' — ' + r.error));
  });
  console.log('สรุป: ผ่าน ' + (results.length - failed.length) + '/' + results.length);
  return { passed: results.length - failed.length, failed: failed.length, results: results };
}

/** รันทุกชุดทดสอบตามลำดับ — ใช้บน staging เท่านั้น (TEST_MODE=true) ใช้เวลาหลายนาที */
function runAllTests() {
  const out = {};
  [['runPhase1Tests', runPhase1Tests], ['runPhase2Tests', runPhase2Tests], ['runPhase4Tests', runPhase4Tests]].forEach(function (s) {
    console.log('=== ' + s[0] + ' ===');
    const r = s[1]();
    out[s[0]] = r.passed + '/' + (r.passed + r.failed);
  });
  console.log('สรุปทั้งหมด: ' + JSON.stringify(out));
  return out;
}

/** เครื่องมือทดสอบที่ใช้ร่วมกันระหว่างชุดทดสอบแต่ละ phase */
function newTestKit_() {
  if (getProp_('TEST_MODE') !== 'true') {
    throw new Error('ตั้ง Script Property TEST_MODE=true และใช้ SPREADSHEET_ID ของ staging ก่อนรันชุดทดสอบ');
  }
  const proxyKey = getProp_('PROXY_KEY');
  const results = [];
  const kit = {
    tag: Utilities.getUuid().replace(/-/g, '').slice(0, 6),
    results: results,
    test: function (name, fn) {
      try {
        fn();
        results.push({ name: name, ok: true });
      } catch (err) {
        results.push({ name: name, ok: false, error: err.message });
      }
    },
    call: function (action, payload, token, requestId) {
      return handleRequest_({ proxyKey: proxyKey, action: action, payload: payload || {}, token: token, requestId: requestId });
    },
    expectCode: function (res, code) {
      if (res.code !== code) throw new Error('คาดว่าได้ ' + code + ' แต่ได้ ' + res.code + ' (' + res.message + ')');
      return res;
    },
    assert: function (cond, message) { if (!cond) throw new Error(message); },
    report: function () {
      const failed = results.filter(function (r) { return !r.ok; });
      results.forEach(function (r) {
        console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : ' — ' + r.error));
      });
      console.log('สรุป: ผ่าน ' + (results.length - failed.length) + '/' + results.length);
      return { passed: results.length - failed.length, failed: failed.length, results: results };
    },
  };
  return kit;
}

/** ปิดบัญชีผู้ใช้ที่ขึ้นต้นด้วย zz_test_ */
function deactivateTestUsers_() {
  const table = readTable_(SHEET.USERS);
  findObjects_(table, function (u) { return toText_(u.Username).indexOf('zz_test_') === 0 && toBool_(u.Active); })
    .forEach(function (u) { updateObject_(table, u._row, { Active: false }); });
}

function headerSnapshot_() {
  const ss = getSpreadsheet_();
  const out = {};
  Object.keys(SCHEMA).forEach(function (name) {
    const sheet = ss.getSheetByName(name);
    out[name] = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  });
  return out;
}
