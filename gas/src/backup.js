/**
 * Backup — SPEC.md §10
 * trigger ทุก 15 นาที: ถ้ามี Open Event ให้คัดลอกชีต Checkins ไปยัง BACKUP_SPREADSHEET_ID เก็บ 20 ชุดล่าสุด
 * ติดตั้ง/ถอน trigger จาก Apps Script editor: installBackupTrigger() / removeBackupTrigger()
 */

const BACKUP_INTERVAL_MINUTES = 15;
const BACKUP_KEEP = 20;
const BACKUP_PREFIX = 'Checkins_';

/** เรียกจาก time-driven trigger */
function backupCheckins() {
  if (!findOpenEvent_()) return '';
  const name = snapshotCheckins_(BACKUP_PREFIX + Utilities.formatDate(new Date(), TIMEZONE, 'yyyyMMdd_HHmm'));
  pruneBackups_();
  return name;
}

function installBackupTrigger() {
  removeBackupTrigger();
  ScriptApp.newTrigger('backupCheckins').timeBased().everyMinutes(BACKUP_INTERVAL_MINUTES).create();
  console.log('ติดตั้ง backup trigger ทุก ' + BACKUP_INTERVAL_MINUTES + ' นาทีแล้ว');
}

function removeBackupTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'backupCheckins'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
}

/** คัดลอกค่าในชีต Checkins ทั้งหมดไปเป็นชีตใหม่ในสเปรดชีตสำรอง @return ชื่อชีตที่สร้าง */
function snapshotCheckins_(sheetName) {
  const backupId = getProp_('BACKUP_SPREADSHEET_ID');
  if (!backupId) throw new Error('Script Property BACKUP_SPREADSHEET_ID is not set');
  const source = getSheet_(SHEET.CHECKINS);
  const values = source.getRange(1, 1, Math.max(source.getLastRow(), 1), Math.max(source.getLastColumn(), 1)).getValues();

  const backup = SpreadsheetApp.openById(backupId);
  let name = sheetName;
  for (let n = 2; backup.getSheetByName(name); n++) name = sheetName + '_' + n;
  const sheet = backup.insertSheet(name);
  if (sheet.getMaxRows() < values.length) sheet.insertRowsAfter(sheet.getMaxRows(), values.length - sheet.getMaxRows());
  sheet.getRange(1, 1, values.length, values[0].length).setNumberFormat('@');
  sheet.getRange(1, 1, values.length, values[0].length).setValues(values.map(function (r) { return r.map(sanitizeCell_); }));
  return name;
}

/** ลบชีตสำรองอัตโนมัติที่เก่ากว่า 20 ชุดล่าสุด (ไม่แตะชีต FINAL_) */
function pruneBackups_() {
  const backup = SpreadsheetApp.openById(getProp_('BACKUP_SPREADSHEET_ID'));
  const sheets = backup.getSheets()
    .filter(function (s) { return s.getName().indexOf(BACKUP_PREFIX) === 0; })
    .sort(function (a, b) { return a.getName().localeCompare(b.getName()); });
  sheets.slice(0, Math.max(sheets.length - BACKUP_KEEP, 0)).forEach(function (s) { backup.deleteSheet(s); });
}
