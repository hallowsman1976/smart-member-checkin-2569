/**
 * งานดูแลระบบที่รันจาก Apps Script editor (ใช้ได้ทั้ง staging และ production)
 *
 * resetUserPin — กู้บัญชีเมื่อ login ไม่ได้ (ลืม PIN / ถูกล็อก / ไม่มี Admin ที่ใช้งานได้)
 *   1. Project Settings → Script Properties → เพิ่ม RESET_PIN_USERNAME = ชื่อผู้ใช้ที่ต้องการรีเซ็ต
 *   2. เปิดไฟล์ maintenance.js แล้วรัน resetUserPin
 *   3. ดู PIN ใหม่ใน Execution log (ผู้ใช้ต้องเปลี่ยน PIN เมื่อ login ครั้งถัดไป)
 * ระบบลบ RESET_PIN_USERNAME ทิ้งหลังรีเซ็ต เพื่อไม่ให้รีเซ็ตซ้ำโดยไม่ตั้งใจ
 * ถ้าไม่ได้ตั้ง RESET_PIN_USERNAME จะแสดงรายชื่อผู้ดูแลระบบให้เลือก
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
