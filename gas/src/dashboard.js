/**
 * Dashboard / Display — SPEC.md §8
 * ตัวเลขนับจากชีต Checkins จริง (ไม่ใช่ event ฝั่ง client) แล้ว cache ไว้ 5 วินาทีต่อ Event
 * Quorum นับเฉพาะ Ordinary Member ที่ REGISTERED เทียบกับ QuorumThreshold ของ Event
 */

const SUMMARY_CACHE_SECONDS = 5;
const RECENT_LIMIT = 10;

/** payload: { eventId? } ค่าเริ่มต้นคือ Open Event */
function dashboardSummary_(payload) {
  const summary = getSummary_(toText_(payload.eventId));
  return ok_('OK', null, summary);
}

/** สำหรับจอฉายในห้องประชุม — ไม่มีชื่อ Member */
function displaySummary_(payload) {
  const s = getSummary_(toText_(payload.eventId));
  return ok_('OK', null, {
    event: s.event,
    totals: s.totals,
    quorum: s.quorum,
    byStation: s.byStation,
    generatedAt: s.generatedAt,
  });
}

function getSummary_(eventId) {
  const event = eventId ? findEventById_(eventId) : findOpenEvent_();
  if (eventId && !event) appError_('INVALID_INPUT', 'ไม่พบงานประชุมนี้');
  const key = 'summary:' + (event ? event.eventId : '-');
  const cache = CacheService.getScriptCache();
  const cached = cache.get(key);
  if (cached) return JSON.parse(cached);
  const summary = computeSummary_(event);
  cache.put(key, JSON.stringify(summary), SUMMARY_CACHE_SECONDS);
  return summary;
}

function computeSummary_(event) {
  const members = readTable_(SHEET.MEMBERS);
  const mc = members.col;
  const memberById = {};
  let totalActive = 0;
  let ordinaryActive = 0;
  const byType = {};
  const byOffice = {};
  members.rows.forEach(function (r) {
    const id = toText_(r[mc.MemberID]);
    if (!id) return;
    memberById[id] = r;
    if (!toBool_(r[mc.Active])) return;
    totalActive++;
    const type = toText_(r[mc.MemberType]);
    const office = toText_(r[mc.Office]) || '(ไม่ระบุ)';
    if (type === MEMBER_TYPE.ORDINARY) ordinaryActive++;
    byType[type] = byType[type] || { memberType: type, total: 0, registered: 0 };
    byType[type].total++;
    byOffice[office] = byOffice[office] || { office: office, total: 0, registered: 0 };
    byOffice[office].total++;
  });

  const stations = readTable_(SHEET.STATIONS);
  const byStation = {};
  stations.rows.forEach(function (r) {
    const id = toText_(r[stations.col.StationID]);
    if (id) byStation[id] = { stationId: id, stationName: toText_(r[stations.col.StationName]), registered: 0 };
  });

  let registered = 0;
  let ordinaryRegistered = 0;
  let cancelled = 0;
  let paper = 0;
  const recent = [];

  if (event) {
    const checkins = readTable_(SHEET.CHECKINS);
    const cc = checkins.col;
    checkins.rows.forEach(function (r) {
      if (toText_(r[cc.EventID]) !== event.eventId) return;
      const status = toText_(r[cc.Status]);
      if (status === CHECKIN_STATUS.CANCELLED) { cancelled++; return; }
      if (status !== CHECKIN_STATUS.REGISTERED) return;
      registered++;
      const memberId = toText_(r[cc.MemberID]);
      const m = memberById[memberId];
      const type = m ? toText_(m[mc.MemberType]) : '';
      const office = m ? toText_(m[mc.Office]) || '(ไม่ระบุ)' : '(ไม่ระบุ)';
      if (type === MEMBER_TYPE.ORDINARY) ordinaryRegistered++;
      if (byType[type]) byType[type].registered++;
      if (byOffice[office]) byOffice[office].registered++;
      const stationId = toText_(r[cc.StationID]);
      if (!byStation[stationId]) byStation[stationId] = { stationId: stationId, stationName: '', registered: 0 };
      byStation[stationId].registered++;
      if (toText_(r[cc.Source]) === CHECKIN_SOURCE.PAPER) paper++;
      recent.push({
        memberId: memberId,
        fullName: m ? toText_(m[mc.FullName]) : '',
        office: office,
        stationId: stationId,
        checkinTime: toText_(r[cc.CheckinTime]),
        source: toText_(r[cc.Source]),
      });
    });
  }

  recent.sort(function (a, b) { return b.checkinTime.localeCompare(a.checkinTime); });
  const threshold = event ? event.quorumThreshold : 0;

  return {
    event: event,
    totals: {
      members: totalActive,
      registered: registered,
      notRegistered: Math.max(totalActive - registered, 0),
      percent: totalActive ? Math.round((registered / totalActive) * 1000) / 10 : 0,
      cancelled: cancelled,
      paper: paper,
    },
    quorum: {
      threshold: threshold,
      ordinaryMembers: ordinaryActive,
      ordinaryRegistered: ordinaryRegistered,
      reached: threshold > 0 && ordinaryRegistered >= threshold,
      remaining: Math.max(threshold - ordinaryRegistered, 0),
    },
    byStation: Object.keys(byStation).sort().map(function (k) { return byStation[k]; }),
    byMemberType: Object.keys(byType).sort().map(function (k) { return byType[k]; }),
    byOffice: Object.keys(byOffice).map(function (k) { return byOffice[k]; })
      .sort(function (a, b) { return b.total - a.total || a.office.localeCompare(b.office); }),
    recent: recent.slice(0, RECENT_LIMIT),
    generatedAt: nowIso_(),
  };
}

/** @return {{eventId, eventName, eventDate, status, quorumThreshold}|null} */
function findEventById_(eventId) {
  const table = readTable_(SHEET.EVENTS);
  const e = findObject_(table, function (x) { return toText_(x.EventID) === eventId; });
  return e ? eventView_(e) : null;
}

function eventView_(e) {
  return {
    eventId: toText_(e.EventID),
    eventName: toText_(e.EventName),
    eventDate: toText_(e.EventDate),
    status: toText_(e.Status),
    quorumThreshold: Number(e.QuorumThreshold) || 0,
    openedAt: toText_(e.OpenedAt),
    closedAt: toText_(e.ClosedAt),
  };
}

function invalidateSummaryCache_(eventId) {
  CacheService.getScriptCache().remove('summary:' + eventId);
}
