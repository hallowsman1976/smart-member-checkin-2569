/**
 * Response contract — SPEC.md §4
 * { success, code, message, data? }
 */

const DEFAULT_MESSAGES = Object.freeze({
  OK: 'สำเร็จ',
  REGISTERED: 'ลงทะเบียนสำเร็จ',
  ALREADY_REGISTERED: 'สมาชิกรายนี้ลงทะเบียนแล้ว',
  MEMBER_NOT_FOUND: 'ไม่พบข้อมูลสมาชิก กรุณาติดต่อผู้ดูแลระบบ',
  MEMBER_INACTIVE: 'สมาชิกรายนี้ไม่มีสิทธิ์ลงทะเบียน',
  EVENT_CLOSED: 'ขณะนี้ไม่มีงานประชุมที่เปิดรับลงทะเบียน',
  UNAUTHORIZED: 'กรุณาเข้าสู่ระบบใหม่',
  FORBIDDEN: 'คุณไม่มีสิทธิ์ใช้งานส่วนนี้',
  MUST_CHANGE_PIN: 'กรุณาเปลี่ยน PIN ก่อนใช้งาน',
  PIN_LOCKED: 'บัญชีถูกล็อกชั่วคราวเนื่องจากกรอก PIN ผิดหลายครั้ง',
  INVALID_INPUT: 'ข้อมูลไม่ถูกต้อง',
  BUSY: 'ระบบกำลังทำงานหนัก กรุณากดลองใหม่อีกครั้ง',
  UNKNOWN: 'ไม่ทราบผลการทำรายการ กรุณาตรวจสอบสถานะก่อนลองใหม่',
});

function ok_(code, message, data) {
  const res = { success: true, code: code, message: message || DEFAULT_MESSAGES[code] || '' };
  if (data !== undefined) res.data = data;
  return res;
}

function fail_(code, message, data) {
  const res = { success: false, code: code, message: message || DEFAULT_MESSAGES[code] || '' };
  if (data !== undefined) res.data = data;
  return res;
}

/** โยน error ที่ router แปลงเป็น fail_ ได้ตรง ๆ */
function appError_(code, message, data) {
  const err = new Error(message || DEFAULT_MESSAGES[code] || code);
  err.appCode = code;
  err.appData = data;
  throw err;
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
