/**
 * Sheet access — อ่าน/เขียนแบบ batch และอ้างคอลัมน์ด้วยชื่อ header เสมอ
 */

let spreadsheet_ = null;

/**
 * memo ของตารางภายในคำขอเดียว (handleRequest_ เปิด/ปิด) เพื่อไม่อ่านชีตเดิมซ้ำ
 * readTable_ อ่านชีตจริงเสมอแล้วเก็บผลล่าสุดไว้ใน memo ส่วน readTableMemo_ ใช้ผลใน memo ถ้ามี
 * ส่วนที่ต้องการข้อมูลสดภายใน Lock (เช่นกันซ้ำ) ต้องใช้ readTable_ เท่านั้น
 */
let tableMemo_ = null;

function beginRequestMemo_() {
  tableMemo_ = {};
}

function endRequestMemo_() {
  tableMemo_ = null;
}

function readTableMemo_(name) {
  return (tableMemo_ && tableMemo_[name]) || readTable_(name);
}

function getProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function getSpreadsheet_() {
  if (!spreadsheet_) {
    const id = getProp_('SPREADSHEET_ID');
    if (!id) throw new Error('Script Property SPREADSHEET_ID is not set');
    spreadsheet_ = SpreadsheetApp.openById(id);
  }
  return spreadsheet_;
}

function getSheet_(name) {
  const sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) throw new Error('Sheet not found: ' + name + ' (run initializeSheets)');
  return sheet;
}

/**
 * อ่านทั้งชีตครั้งเดียว
 * @return {{name:string, sheet:GoogleAppsScript.Spreadsheet.Sheet, headers:string[], col:Object<string,number>, rows:any[][]}}
 */
function readTable_(name) {
  const sheet = getSheet_(name);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) throw new Error('Sheet has no header: ' + name);
  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = values[0].map(function (h) { return String(h).trim(); });
  const col = {};
  headers.forEach(function (h, i) { if (h) col[h] = i; });
  SCHEMA[name].headers.forEach(function (h) {
    if (!(h in col)) throw new Error('Missing column ' + h + ' in ' + name + ' (run initializeSheets)');
  });
  const table = { name: name, sheet: sheet, headers: headers, col: col, rows: values.slice(1) };
  if (tableMemo_) tableMemo_[name] = table;
  return table;
}

/** อ่านเฉพาะ header สำหรับงานที่ append อย่างเดียว (rows ว่าง จึงใช้ค้นหาไม่ได้) */
function readHeaderOnly_(name) {
  const sheet = getSheet_(name);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim(); });
  const col = {};
  headers.forEach(function (h, i) { if (h) col[h] = i; });
  return { name: name, sheet: sheet, headers: headers, col: col, rows: [] };
}

/** แปลงแถวเป็น object; _row คือเลขแถวจริงในชีต (1-based) */
function rowToObject_(table, index) {
  const row = table.rows[index];
  const obj = { _row: index + 2 };
  table.headers.forEach(function (h, i) { if (h) obj[h] = row[i]; });
  return obj;
}

function findObjects_(table, predicate) {
  const out = [];
  for (let i = 0; i < table.rows.length; i++) {
    const obj = rowToObject_(table, i);
    if (predicate(obj)) out.push(obj);
  }
  return out;
}

function findObject_(table, predicate) {
  for (let i = 0; i < table.rows.length; i++) {
    const obj = rowToObject_(table, i);
    if (predicate(obj)) return obj;
  }
  return null;
}

function objectToRow_(table, obj) {
  return table.headers.map(function (h) {
    return h && obj[h] !== undefined && obj[h] !== null ? sanitizeCell_(obj[h]) : '';
  });
}

/** เพิ่มแถวใหม่ด้วย appendRow (atomic ต่อการเขียนพร้อมกัน) */
function appendObject_(table, obj) {
  const row = objectToRow_(table, obj);
  table.sheet.appendRow(row);
  table.rows.push(row.map(unsanitizeCell_));
}

/** แก้แถวเดิมทั้งแถวในการเขียนครั้งเดียว */
function updateObject_(table, rowNumber, patch) {
  const index = rowNumber - 2;
  const current = rowToObject_(table, index);
  Object.keys(patch).forEach(function (k) { current[k] = patch[k]; });
  const row = objectToRow_(table, current);
  table.sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
  table.rows[index] = row.map(unsanitizeCell_);
}

/**
 * ป้องกัน formula injection และรักษาข้อความที่ขึ้นต้นด้วยตัวเลข (เช่น MemberID "000123", เวลา ISO)
 * โดยใส่ ' นำหน้า ซึ่ง Sheets จะเก็บเป็นข้อความและไม่แสดง '
 */
function sanitizeCell_(value) {
  if (typeof value !== 'string') return value;
  if (/^[=+\-@\t\r\d]/.test(value)) return "'" + value;
  return value;
}

function unsanitizeCell_(value) {
  return typeof value === 'string' && value.charAt(0) === "'" ? value.slice(1) : value;
}

function toBool_(value) {
  return value === true || String(value).toUpperCase() === 'TRUE';
}

function toText_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function nowIso_() {
  return Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function isoAfterMinutes_(minutes) {
  return Utilities.formatDate(new Date(Date.now() + minutes * 60000), TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function newId_(prefix) {
  return prefix + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 12).toUpperCase();
}
