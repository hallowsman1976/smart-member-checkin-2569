/**
 * งานดูแลระบบที่รันจาก Apps Script editor (ใช้ได้ทั้ง staging และ production)
 *
 * resetUserPin — กู้บัญชีเมื่อ login ไม่ได้ (ลืม PIN / ถูกล็อก / ไม่มี Admin ที่ใช้งานได้)
 *   1. Project Settings → Script Properties → เพิ่ม RESET_PIN_USERNAME = ชื่อผู้ใช้ที่ต้องการรีเซ็ต
 *   2. เปิดไฟล์ maintenance.js แล้วรัน resetUserPin
 *   3. ดู PIN ใหม่ใน Execution log (ผู้ใช้ต้องเปลี่ยน PIN เมื่อ login ครั้งถัดไป)
 * ระบบลบ RESET_PIN_USERNAME ทิ้งหลังรีเซ็ต เพื่อไม่ให้รีเซ็ตซ้ำโดยไม่ตั้งใจ
 * ถ้าไม่ได้ตั้ง RESET_PIN_USERNAME จะแสดงรายชื่อผู้ดูแลระบบให้เลือก
 *
 * removeBlankRows — ลบแถวว่าง (ทุกคอลัมน์ว่าง) ในชีต Checkins และ Users
 *   เปิดไฟล์ maintenance.js แล้วรัน removeBlankRows ดูจำนวนที่ลบใน Execution log
 *   ลบเฉพาะแถวว่างที่คั่นระหว่างข้อมูล แถวว่างท้ายตารางที่ initializeSheets เตรียม format ไว้ยังคงอยู่
 */
function resetUserPin() {
  const props = PropertiesService.getScriptProperties();
  const username = toText_(props.getProperty('RESET_PIN_USERNAME')).toLowerCase();
  const users = readTable_(SHEET.USERS);

  if (!username) {
    const admins = findObjects_(users, function (u) { return u.Role === ROLE.ADMIN; })
      .map(function (u) { return u.Username + (toBool_(u.Active) ? '' : ' (ปิดใช้งาน)'); });
    console.log('ยังไม่ได้ตั้ง Script Property RESET_PIN_USERNAME — ผู้ดูแลระบบที่มี: ' + (admins.join(', ') || '(ไม่มี)'));
    return null;
  }

  const user = findUserByUsername_(users, username);
  if (!user) {
    console.log('ไม่พบผู้ใช้ "' + username + '" — ตรวจชื่อใน RESET_PIN_USERNAME อีกครั้ง');
    return null;
  }

  const pin = randomPin_();
  const salt = newSalt_();
  updateObject_(users, user._row, {
    PinSalt: salt,
    PinHash: hashPin_(salt, pin),
    MustChangePin: true,
    FailedAttempts: 0,
    LockedUntil: '',
    Active: true,
  });
  SpreadsheetApp.flush();
  props.deleteProperty('RESET_PIN_USERNAME');
  writeAudit_('SYSTEM', 'PIN_RESET_EDITOR', 'User', user.UserID, 'รีเซ็ตจาก Apps Script editor', { username: username });

  console.log('รีเซ็ตแล้ว: username=' + username + ' (' + user.Role + ') PIN=' + pin +
    ' — บัญชีถูกปลดล็อกและเปิดใช้งาน ผู้ใช้ต้องเปลี่ยน PIN เมื่อ login ครั้งถัดไป');
  return { username: username, pin: pin };
}

function removeBlankRows() {
  return withScriptLock_(function () {
    const ss = getSpreadsheet_();
    const result = {};
    [SHEET.CHECKINS, SHEET.USERS].forEach(function (name) {
      const sheet = getSheet_(name);
      result[name] = removeBlankRowsIn_(sheet);
      // เติมแถวที่ลบไปกลับท้ายตาราง แล้วให้ ensureSheet_ ตั้ง format/validation ให้แถวใหม่
      if (result[name].removed) sheet.insertRowsAfter(sheet.getMaxRows(), result[name].removed);
      ensureSheet_(ss, name);
    });
    SpreadsheetApp.flush();
    writeAudit_('SYSTEM', 'BLANK_ROWS_REMOVED', 'Sheet', Object.keys(result).join(','), 'ลบแถวว่างจาก Apps Script editor', result);
    console.log('ลบแถวว่างแล้ว: ' + JSON.stringify(result));
    return result;
  });
}

/** ลบแถวว่างระหว่างข้อมูล (ไล่จากล่างขึ้นบนทีละช่วง) แถวท้ายตารางที่เตรียมไว้ไม่ถูกแตะ */
function removeBlankRowsIn_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  let removed = 0;
  if (lastRow > 1) {
    const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    const isBlank = function (row) { return row.every(function (v) { return String(v).trim() === ''; }); };
    for (let i = values.length - 1; i >= 0; i--) {
      if (!isBlank(values[i])) continue;
      let start = i;
      while (start > 0 && isBlank(values[start - 1])) start--;
      sheet.deleteRows(start + 2, i - start + 1);
      removed += i - start + 1;
      i = start;
    }
  }
  return { removed: removed, dataRows: Math.max(sheet.getLastRow() - 1, 0) };
}
