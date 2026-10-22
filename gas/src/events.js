/**
 * Event — มี Open Event ได้ไม่เกินหนึ่งงาน และ server เป็นผู้หาเสมอ (ห้ามรับ EventID จาก Client)
 */

/** @return {{eventId:string, eventName:string, eventDate:string, quorumThreshold:number}|null} */
function findOpenEvent_() {
  const table = readTableMemo_(SHEET.EVENTS);
  const open = findObjects_(table, function (e) { return e.Status === EVENT_STATUS.OPEN; });
  if (open.length === 0) return null;
  if (open.length > 1) console.warn('พบ Event สถานะ OPEN มากกว่า 1 งาน: ' + open.map(function (e) { return e.EventID; }).join(','));
  const e = open[0];
  return {
    eventId: toText_(e.EventID),
    eventName: toText_(e.EventName),
    eventDate: toText_(e.EventDate),
    quorumThreshold: Number(e.QuorumThreshold) || 0,
  };
}
