// รัน gas/src/*.js ใน vm context ที่มี mock ของ Apps Script แล้วรันชุดทดสอบ
// ใช้: npm run test:gas
import { loadGas as loadGasWith } from './load.mjs';

const PROXY_KEY = 'test-proxy-key-0123456789abcdef';

function loadGas() {
  return loadGasWith({ SPREADSHEET_ID: 'mock', BACKUP_SPREADSHEET_ID: 'backup', PROXY_KEY, TEST_MODE: 'true' });
}

// ซ่อน log ของชุดทดสอบใน GAS (พิมพ์ผลซ้ำ) — harness พิมพ์สรุปเอง
const quietConsole = { ...console, log: () => {} };
function loadGasQuiet() {
  const loaded = loadGas();
  loaded.gas.console = quietConsole;
  return loaded;
}

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (err) {
    results.push({ name, ok: false, error: err.message });
  }
}
function assert(cond, message) { if (!cond) throw new Error(message); }

// ---- Harness-only: สิ่งที่ทดสอบใน Apps Script จริงไม่ได้ (สเปรดชีตว่าง, เลื่อนเวลา, doPost) ----
{
  const { gas, spreadsheet, clock } = loadGas();
  const call = (action, payload = {}, token) => gas.handleRequest_({ proxyKey: PROXY_KEY, action, payload, token });

  let bootstrap;
  test('[harness] initializeSheets บนสเปรดชีตว่าง: สร้าง 6 ชีต, Station 01–08, Admin คนแรก', () => {
    bootstrap = gas.initializeSheets();
    assert(bootstrap.createdSheets.length === 6, `สร้าง ${bootstrap.createdSheets.length} ชีต`);
    assert(bootstrap.stationsAdded === 8, 'Station ไม่ครบ 8');
    assert(bootstrap.admin && /^\d{6}$/.test(bootstrap.admin.pin), 'ไม่ได้สร้าง Admin');
    const ids = spreadsheet.getSheetByName('Stations').data.slice(1).map((r) => r[0]);
    assert(JSON.stringify(ids) === JSON.stringify(['01', '02', '03', '04', '05', '06', '07', '08']), `StationID: ${ids}`);
    assert(spreadsheet.getSheetByName('Checkins').getMaxRows() >= 1501, 'Checkins เตรียมแถวไม่พอสำหรับ 1,500 คน');
  });

  test('[harness] Admin คนแรกต้องเปลี่ยน PIN', () => {
    const res = call('auth.login', { username: bootstrap.admin.username, pin: bootstrap.admin.pin });
    assert(res.code === 'MUST_CHANGE_PIN', res.code);
  });

  test('[harness] header ที่ขาดถูกเพิ่มต่อท้าย ไม่สลับคอลัมน์เดิม', () => {
    const sheet = spreadsheet.getSheetByName('Stations');
    sheet.data[0] = ['StationName', 'StationID']; // ผู้ใช้สลับคอลัมน์และลบ Active
    sheet.data.slice(1).forEach((r) => { const [id, name] = r; r[0] = name; r[1] = id; r.length = 2; });
    gas.initializeSheets();
    assert(JSON.stringify(sheet.data[0]) === JSON.stringify(['StationName', 'StationID', 'Active']), `${sheet.data[0]}`);
    const st = gas.readTable_('Stations');
    assert(gas.findObject_(st, (s) => s.StationID === '01').StationName === 'จุดลงทะเบียนที่ 1', 'Header Mapping อ่านผิดคอลัมน์');
  });

  test('[harness] initializeSheets ซ่อมชีตที่มี FALSE ค้างจาก checkbox validation รุ่นก่อน', () => {
    const { gas: g2, spreadsheet: ss2 } = loadGas();
    g2.console = { ...console, log: () => {} };
    // จำลองสภาพ staging: ชีตถูกสร้างแบบเก่า (FALSE ทุกแถวในคอลัมน์ Active) แล้วข้อมูลถูก append ต่อท้าย
    const HEADERS = {
      Stations: ['StationID', 'StationName', 'Active'],
      Users: ['UserID', 'Username', 'FullName', 'Role', 'DefaultStationID', 'PinHash', 'PinSalt', 'MustChangePin', 'FailedAttempts', 'LockedUntil', 'Active'],
    };
    for (const name of ['Stations', 'Users']) {
      const sh = ss2.insertSheet(name);
      const headers = HEADERS[name];
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.insertRowsAfter(1000, 100);
      const ai = headers.indexOf('Active') + 1;
      for (let r = 2; r <= 101; r++) sh.setCell(r, ai, false);
    }
    const staleAdmin = ss2.getSheetByName('Users');
    assert(staleAdmin.getLastRow() === 101, 'จำลองสภาพเดิมไม่ได้');
    g2.initializeSheets();
    const st = g2.readTable_('Stations');
    const ids = g2.findObjects_(st, (s) => !!s.StationID).map((s) => s.StationID);
    assert(ids.length === 8 && ids[0] === '01', `Station: ${ids}`);
    assert(st.sheet.getLastRow() === 9, `Stations lastRow ${st.sheet.getLastRow()} (ควรเป็น 9)`);
    const admin = g2.findObject_(g2.readTable_('Users'), (u) => u.Role === 'ADMIN');
    assert(admin && admin._row === 2, `Admin อยู่แถว ${admin?._row}`);
  });

  test('[harness] session หมดอายุแบบ sliding 2 ชม.', () => {
    const table = gas.readTable_('Users');
    gas.createUser_(table, { username: 'slide', fullName: 'S', role: 'SUPERVISOR', pin: '482916', mustChangePin: false });
    const { token } = call('auth.login', { username: 'slide', pin: '482916' }).data;
    clock.offsetMs += 110 * 60000;
    assert(call('session.me', {}, token).code === 'OK', 'หมดอายุก่อน 2 ชม.');
    clock.offsetMs += 110 * 60000; // รวม 3 ชม. 40 นาทีจาก login แต่ใช้งานต่อเนื่อง
    assert(call('session.me', {}, token).code === 'OK', 'sliding ไม่ต่ออายุ');
    clock.offsetMs += 121 * 60000;
    assert(call('session.me', {}, token).code === 'UNAUTHORIZED', 'ไม่หมดอายุหลังว่าง 2 ชม.');
  });

  test('[harness] doPost: JSON เสีย / ถูกต้อง', () => {
    const bad = JSON.parse(gas.doPost({ postData: { contents: '{oops' } }).getContent());
    assert(bad.code === 'INVALID_INPUT', bad.code);
    const okRes = gas.doPost({ postData: { contents: JSON.stringify({ proxyKey: PROXY_KEY, action: 'auth.login', payload: { username: 'slide', pin: '482916' } }) } });
    assert(okRes.mimeType === 'application/json', 'mimeType ไม่ใช่ JSON');
    assert(JSON.parse(okRes.getContent()).code === 'OK', 'login ผ่าน doPost ไม่สำเร็จ');
  });

  test('[harness] error ภายในไม่ส่ง stack trace ออกไป', () => {
    spreadsheet.sheets.delete('Users');
    const res = call('auth.login', { username: 'slide', pin: '482916' });
    assert(res.code === 'UNKNOWN' && !/Error|at /.test(res.message), JSON.stringify(res));
  });

  test('[harness] formula injection ถูกเก็บเป็นข้อความ', () => {
    assert(gas.sanitizeCell_('=HYPERLINK("x")') === `'=HYPERLINK("x")`, 'ไม่ได้ใส่ \' นำหน้า');
    assert(gas.sanitizeCell_('000123') === "'000123", 'MemberID ไม่ถูกบังคับเป็นข้อความ');
    assert(gas.sanitizeCell_('สมชาย') === 'สมชาย', 'ข้อความทั่วไปถูกแก้');
  });
}

// ---- Harness-only (Phase 2): Lock ไม่ว่าง และรายชื่อสมาชิกขนาดจริง ----
{
  const { gas, globals } = loadGas();
  const call = (action, payload = {}, token, requestId) =>
    gas.handleRequest_({ proxyKey: PROXY_KEY, action, payload, token, requestId });
  gas.initializeSheets();
  gas.appendObject_(gas.readTable_('Events'), { EventID: 'EV1', EventName: 'ประชุมใหญ่ 2569', EventDate: '2026-12-01', Status: 'OPEN', QuorumThreshold: 750 });
  const members = gas.readTable_('Members');
  for (let i = 1; i <= 1500; i++) {
    const id = String(i).padStart(6, '0');
    gas.appendObject_(members, {
      MemberID: id, FullName: `นางสาวทดสอบระบบลงทะเบียน${i} นามสกุลยาวมากเป็นพิเศษ`,
      Office: 'สำนักงานสาธารณสุขจังหวัดมุกดาหาร โรงพยาบาลส่งเสริมสุขภาพตำบล', MemberType: i % 10 ? 'ORDINARY' : 'ASSOCIATE', Active: true,
    });
  }
  gas.createUser_(gas.readTable_('Users'), { username: 'st1', fullName: 'S1', role: 'STAFF', pin: '482916', mustChangePin: false });
  const token = call('auth.login', { username: 'st1', pin: '482916', stationId: '01' }).data.token;

  test('[harness] members.list 1,500 คน (อักษรไทย > 100KB) ผ่าน chunked cache', () => {
    const first = call('members.list', {}, token);
    assert(first.code === 'OK' && first.data.items.length === 1500, `ได้ ${first.data?.items?.length}`);
    assert(first.data.items[0].memberId === '000001', `MemberID: ${first.data.items[0].memberId}`);
    const chunks = globals.CacheService.getScriptCache()._keys().filter((k) => k.startsWith('members:list:') && !k.endsWith(':meta'));
    assert(chunks.length > 1, `ควรแบ่งหลายชิ้น ได้ ${chunks.length}`);
    const second = call('members.list', {}, token);
    assert(JSON.stringify(second.data.items) === JSON.stringify(first.data.items), 'ผลจาก cache ไม่ตรง');
  });

  test('[harness] Lock ไม่ว่าง → BUSY และไม่เขียนแถว', () => {
    const lock = globals.LockService.getScriptLock();
    lock.tryLock(0);
    let res;
    try {
      res = call('checkin.create', { memberId: '000001' }, token, 'busy-0000-0001');
    } finally {
      lock.releaseLock();
    }
    assert(res.code === 'BUSY' && res.success === false, JSON.stringify(res));
    assert(gas.readTable_('Checkins').rows.length === 0, 'มีแถวเกิดขึ้นตอน BUSY');
    const retry = call('checkin.create', { memberId: '000001' }, token, 'busy-0000-0001');
    assert(retry.code === 'REGISTERED', `retry ด้วย requestId เดิมหลัง BUSY: ${retry.code}`);
  });

  test('[harness] Lock ถูกปลดแม้เกิด error ภายใน critical section', () => {
    const sheet = gas.getSheet_('Checkins');
    const original = sheet.appendRow;
    sheet.appendRow = () => { throw new Error('quota'); };
    const res = call('checkin.create', { memberId: '000002' }, token, 'err-0000-0002');
    sheet.appendRow = original;
    assert(res.code === 'UNKNOWN', res.code);
    assert(globals.LockService.getScriptLock().hasLock() === false, 'Lock ค้าง');
    assert(call('checkin.create', { memberId: '000002' }, token, 'err-0000-0002').code === 'REGISTERED', 'retry หลัง error ไม่ผ่าน');
  });
}

// ---- Harness-only (Phase 4): Admin คนสุดท้าย, backup trigger ----
{
  const { gas, openById, triggers } = loadGas();
  const call = (action, payload = {}, token, requestId) =>
    gas.handleRequest_({ proxyKey: PROXY_KEY, action, payload, token, requestId });
  gas.console = { ...console, log: () => {} };
  gas.initializeSheets();
  const users = gas.readTable_('Users');
  const soleAdminId = gas.findObject_(users, (u) => u.Role === 'ADMIN').UserID;
  gas.updateObject_(users, gas.findObject_(users, (u) => u.Role === 'ADMIN')._row, { MustChangePin: false });
  const adminPin = '735204';
  gas.updateObject_(users, gas.findObject_(users, (u) => u.Role === 'ADMIN')._row, {
    PinSalt: 's', PinHash: gas.hashPin_('s', adminPin),
  });
  const token = call('auth.login', { username: 'admin', pin: adminPin }).data.token;

  test('[harness] ปิดหรือลดสิทธิ์ Admin คนสุดท้ายไม่ได้', () => {
    assert(call('admin.users.update', { userId: soleAdminId, active: false }, token).code === 'INVALID_INPUT', 'ปิด Admin คนสุดท้ายได้');
    assert(call('admin.users.update', { userId: soleAdminId, role: 'STAFF' }, token).code === 'INVALID_INPUT', 'ลดสิทธิ์ Admin คนสุดท้ายได้');
    const second = call('admin.users.create', { username: 'admin2', fullName: 'A2', role: 'ADMIN', pin: '592731' }, token);
    assert(second.code === 'OK', second.message);
    assert(call('admin.users.update', { userId: soleAdminId, role: 'SUPERVISOR' }, token).code === 'OK', 'มี Admin อื่นแล้วควรลดสิทธิ์ได้');
  });

  test('[harness] backup trigger: ติดตั้งซ้ำไม่ซ้อน, สำรองเฉพาะตอนเปิดงาน, เก็บ 20 ชุด', () => {
    gas.installBackupTrigger();
    gas.installBackupTrigger();
    assert(triggers.length === 1 && triggers[0].everyMinutes === 15, `triggers: ${triggers.length}`);
    assert(gas.backupCheckins() === '', 'สำรองทั้งที่ไม่มีงานเปิด');
    gas.appendObject_(gas.readTable_('Events'), { EventID: 'EVB', EventName: 'b', EventDate: '2026-12-20', Status: 'OPEN', QuorumThreshold: 1 });
    gas.appendObject_(gas.readTable_('Checkins'), { CheckinID: 'C-1', EventID: 'EVB', MemberID: '000123', Status: 'REGISTERED', Source: 'STATION', CheckinTime: gas.nowIso_(), StationID: '01' });
    const backup = openById('backup');
    backup.insertSheet('Sheet1');
    for (let i = 0; i < 23; i++) gas.backupCheckins();
    const names = backup.getSheets().map((s) => s.getName()).filter((n) => n.startsWith('Checkins_'));
    assert(names.length === 20, `เก็บไว้ ${names.length} ชุด`);
    const sheet = backup.getSheetByName(names[names.length - 1]);
    assert(sheet.data[1][2] === '000123', `ศูนย์นำหน้าหายในชีตสำรอง: ${sheet.data[1][2]}`);
    gas.removeBackupTrigger();
    assert(triggers.length === 0, 'ถอน trigger ไม่หมด');
  });
}

// ---- Harness-only: เตรียม/ล้างข้อมูล load test ----
{
  const { gas } = loadGas();
  gas.console = { ...console, log: () => {} };
  const call = (action, payload = {}, token) => gas.handleRequest_({ proxyKey: PROXY_KEY, action, payload, token });
  test('[harness] setupLoadTest → login ได้ไม่ต้องเปลี่ยน PIN, งานเปิด, สมาชิก 60 คน; teardown ปิดหมด', () => {
    const { pin } = gas.setupLoadTest();
    const again = gas.setupLoadTest(); // รันซ้ำได้ (PIN ใหม่, งานเก่าถูกปิด)
    const staff = call('auth.login', { username: 'zz_load_staff03', pin: again.pin, stationId: '03' });
    assert(staff.code === 'OK', `login: ${staff.code}`);
    assert(call('auth.login', { username: 'zz_load_sup', pin }).code === 'UNAUTHORIZED', 'PIN เก่ายังใช้ได้');
    const list = call('members.list', {}, staff.data.token);
    assert(list.data.items.filter((m) => m.memberId.startsWith('ZL')).length === 120, 'สมาชิกทดสอบไม่ครบ');
    const events = gas.findObjects_(gas.readTable_('Events'), (e) => e.Status === 'OPEN');
    assert(events.length === 1, `Open Event ${events.length} งาน`);
    gas.teardownLoadTest();
    assert(gas.findOpenEvent_() === null, 'ยังมี Open Event');
    assert(call('auth.login', { username: 'zz_load_staff03', pin: again.pin, stationId: '03' }).code === 'UNAUTHORIZED', 'บัญชียังใช้ได้');
  });
}

// ---- ชุดทดสอบเดียวกับที่รันใน Apps Script editor ----
for (const suite of ['runPhase1Tests', 'runPhase2Tests', 'runPhase4Tests']) {
  const { gas } = loadGasQuiet();
  const summary = gas[suite]();
  summary.results.forEach((r) => results.push({ ...r, name: `[${suite}] ${r.name}` }));
}

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : ` — ${r.error}`}`);
}
console.log(`\nรวม: ผ่าน ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
