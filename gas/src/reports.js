/**
 * Reports — ส่งข้อมูลดิบให้ client สร้างไฟล์ CSV/XLSX (client เป็นผู้ป้องกัน formula injection ตอนเขียนไฟล์)
 * payload: { eventId? } ค่าเริ่มต้นคือ Open Event
 * หนึ่งแถวต่อ Member ที่ Active รวมผู้ที่ยังไม่ลงทะเบียน + Member ที่ไม่ Active แต่มี Check-in
 */
function reportsExport_(payload, ctx) {
  const eventId = toText_(payload.eventId);
  const event = eventId ? findEventById_(eventId) : findOpenEvent_();
  if (!event) return fail_('INVALID_INPUT', 'กรุณาเลือกงานประชุม');

  const checkins = readTable_(SHEET.CHECKINS);
  const byMember = {};
  findObjects_(checkins, function (c) { return toText_(c.EventID) === event.eventId; }).forEach(function (c) {
    byMember[toText_(c.MemberID)] = c;
  });
  const stations = stationNames_();
  const members = readTable_(SHEET.MEMBERS);

  const rows = [];
  findObjects_(members, function (m) { return !!toText_(m.MemberID); }).forEach(function (m) {
    const id = toText_(m.MemberID);
    const c = byMember[id];
    if (!toBool_(m.Active) && !c) return;
    const status = c ? toText_(c.Status) : 'NOT_REGISTERED';
    rows.push({
      memberId: id,
      fullName: toText_(m.FullName),
      office: toText_(m.Office),
      memberType: toText_(m.MemberType),
      status: status,
      checkinTime: c && status === CHECKIN_STATUS.REGISTERED ? toText_(c.CheckinTime) : '',
      stationId: c ? toText_(c.StationID) : '',
      stationName: c ? stations[toText_(c.StationID)] || '' : '',
      source: c ? toText_(c.Source) : '',
    });
  });

  writeAudit_(ctx.userId, 'REPORT_EXPORTED', 'Event', event.eventId, '', { rows: rows.length });
  return ok_('OK', null, { event: event, rows: rows, generatedAt: nowIso_() });
}
