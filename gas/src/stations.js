/**
 * Stations — stations.list เป็น public เพื่อให้หน้า Login แสดงตัวเลือกจุดลงทะเบียนได้ก่อนเข้าสู่ระบบ
 * ส่งเฉพาะ StationID/StationName ของจุดที่ Active
 */

function stationsList_() {
  const table = readTable_(SHEET.STATIONS);
  const items = findObjects_(table, function (s) { return toText_(s.StationID) && toBool_(s.Active); })
    .map(publicStation_)
    .sort(function (a, b) { return a.stationId.localeCompare(b.stationId); });
  return ok_('OK', null, { items: items });
}
