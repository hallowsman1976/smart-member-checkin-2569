/**
 * ตั้งค่าสเปรดชีต — รันจาก Apps Script editor
 * idempotent: รันซ้ำได้ ไม่ลบหรือเรียงคอลัมน์/ข้อมูลเดิมใหม่ เพิ่มเฉพาะสิ่งที่ขาด
 */

function initializeSheets() {
  const ss = getSpreadsheet_();
  const created = [];
  Object.keys(SCHEMA).forEach(function (name) {
    if (ensureSheet_(ss, name)) created.push(name);
  });
  const stationsAdded = seedStations_();
  const admin = ensureAdmin_();
  const proxyKeyCreated = ensureProxyKey_();
  SpreadsheetApp.flush();

  writeAudit_('SYSTEM', 'INIT_SHEETS', 'Spreadsheet', '', '', {
    createdSheets: created,
    stationsAdded: stationsAdded,
    adminCreated: !!admin,
  });

  if (admin) {
    console.log('สร้าง Admin คนแรก: username=' + admin.username + ' PIN=' + admin.pin +
      ' (ระบบจะบังคับให้เปลี่ยน PIN เมื่อเข้าสู่ระบบครั้งแรก)');
  }
  if (proxyKeyCreated) {
    console.log('สร้าง PROXY_KEY=' + getProp_('PROXY_KEY') + ' (ตั้งค่านี้เป็น secret PROXY_KEY ใน Cloudflare Pages)');
  }
  console.log('initializeSheets เสร็จ: สร้างชีตใหม่ ' + created.length + ' ชีต, เพิ่ม Station ' + stationsAdded + ' จุด');
  return { createdSheets: created, stationsAdded: stationsAdded, admin: admin };
}

/** แสดง PROXY_KEY (สร้างให้ถ้ายังไม่มี) เพื่อนำไปตั้งใน Cloudflare */
function generateProxyKey() {
  ensureProxyKey_();
  const key = getProp_('PROXY_KEY');
  console.log('PROXY_KEY=' + key + ' (ตั้งค่านี้เป็น secret PROXY_KEY ใน Cloudflare Pages)');
  return key;
}

/** @return {boolean} true ถ้าสร้าง PROXY_KEY ใหม่ */
function ensureProxyKey_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('PROXY_KEY')) return false;
  props.setProperty('PROXY_KEY', (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''));
  return true;
}

/** @return {boolean} true ถ้าสร้างชีตใหม่ */
function ensureSheet_(ss, name) {
  const spec = SCHEMA[name];
  let sheet = ss.getSheetByName(name);
  const isNew = !sheet;
  if (isNew) sheet = ss.insertSheet(name);

  const lastCol = sheet.getLastColumn();
  let headers = lastCol > 0
    ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); })
    : [];
  if (headers.every(function (h) { return !h; })) headers = [];

  const missing = spec.headers.filter(function (h) { return headers.indexOf(h) === -1; });
  if (missing.length) {
    sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
    headers = headers.concat(missing);
  }
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.setFrozenRows(1);

  if (sheet.getMaxRows() < spec.minRows + 1) {
    sheet.insertRowsAfter(sheet.getMaxRows(), spec.minRows + 1 - sheet.getMaxRows());
  }
  const dataRows = sheet.getMaxRows() - 1;

  headers.forEach(function (h, i) {
    if (!h) return;
    const range = sheet.getRange(2, i + 1, dataRows, 1);
    if (spec.checkboxes.indexOf(h) !== -1) {
      // ไม่ใช้ checkbox validation: Sheets จะใส่ FALSE ให้เซลล์ว่างทุกแถว ทำให้ getLastRow/appendRow ผิด
      range.clearDataValidations();
      clearPrefilledFalse_(sheet, headers.indexOf(spec.headers[0]), i);
    } else if (spec.numbers.indexOf(h) !== -1) {
      range.setNumberFormat('0');
    } else {
      range.setNumberFormat('@');
      if (spec.enums[h]) {
        range.setDataValidation(SpreadsheetApp.newDataValidation()
          .requireValueInList(spec.enums[h], true)
          .setAllowInvalid(false)
          .build());
      }
    }
  });
  return isNew;
}

/**
 * ล้างค่า FALSE ในแถวที่ไม่มี ID ซึ่ง checkbox validation รุ่นก่อนใส่ไว้ (ซ่อมสเปรดชีตที่สร้างไปแล้ว)
 * แถวที่มีข้อมูลจริงไม่ถูกแตะ
 */
function clearPrefilledFalse_(sheet, keyIndex, colIndex) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2 || keyIndex < 0) return;
  const keys = sheet.getRange(2, keyIndex + 1, lastRow - 1, 1).getValues();
  const range = sheet.getRange(2, colIndex + 1, lastRow - 1, 1);
  const values = range.getValues();
  let changed = false;
  values.forEach(function (v, i) {
    if (toText_(keys[i][0]) === '' && v[0] === false) {
      v[0] = '';
      changed = true;
    }
  });
  if (changed) range.setValues(values);
}

/** เพิ่ม Station 01–08 เมื่อชีต Stations ยังไม่มีจุดใด */
function seedStations_() {
  const table = readTable_(SHEET.STATIONS);
  if (findObject_(table, function (s) { return !!toText_(s.StationID); })) return 0;
  for (let i = 1; i <= DEFAULT_STATION_COUNT; i++) {
    const id = ('0' + i).slice(-2);
    appendObject_(table, { StationID: id, StationName: 'จุดลงทะเบียนที่ ' + i, Active: true });
  }
  return DEFAULT_STATION_COUNT;
}

/**
 * สร้าง Admin คนแรกด้วย PIN สุ่ม ถ้ายังไม่มี Admin ที่ Active
 * @return {{username:string, pin:string}|null}
 */
function ensureAdmin_() {
  const table = readTable_(SHEET.USERS);
  const hasAdmin = findObject_(table, function (u) {
    return u.Role === ROLE.ADMIN && toBool_(u.Active);
  });
  if (hasAdmin) return null;

  let username = 'admin';
  let n = 1;
  while (findUserByUsername_(table, username)) username = 'admin' + (n++);

  const pin = randomPin_();
  createUser_(table, {
    username: username,
    fullName: 'ผู้ดูแลระบบ',
    role: ROLE.ADMIN,
    pin: pin,
    mustChangePin: true,
  });
  writeAudit_('SYSTEM', 'ADMIN_BOOTSTRAP', 'User', username, '', {});
  return { username: username, pin: pin };
}

/** PIN สุ่ม 6 หลักที่ไม่ใช่ PIN ที่เดาง่าย */
function randomPin_() {
  let pin = '';
  do {
    const hex = Utilities.getUuid().replace(/-/g, '');
    pin = '';
    for (let i = 0; pin.length < 6 && i < hex.length; i += 2) {
      pin += String(parseInt(hex.substr(i, 2), 16) % 10);
    }
  } while (isWeakPin_(pin));
  return pin;
}
