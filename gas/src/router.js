/**
 * Entry point ของ Web App — Cloudflare Pages Function เรียกผ่าน POST เท่านั้น (ADR 0004)
 * body: { proxyKey, action, token?, requestId?, payload? }
 */

function doPost(e) {
  let req = null;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '');
  } catch (err) {
    return jsonOutput_(fail_('INVALID_INPUT', 'รูปแบบคำขอไม่ถูกต้อง'));
  }
  const started = Date.now();
  const res = handleRequest_(req);
  res.ms = Date.now() - started; // เวลาประมวลผลฝั่ง Apps Script ใช้แยกปัญหาความช้าออกจาก redirect ของ Google
  return jsonOutput_(res);
}

function doGet() {
  return jsonOutput_(fail_('INVALID_INPUT', 'รองรับเฉพาะ POST'));
}

/**
 * roles: Role ที่เรียกได้; public: ไม่ต้องมี session
 * allowMustChangePin: เรียกได้แม้ยังไม่ได้เปลี่ยน PIN ครั้งแรก
 */
function getRoutes_() {
  return {
    'auth.login': { public: true, handler: authLogin_ },
    'stations.list': { public: true, handler: stationsList_ },
    'auth.changePin': { roles: ALL_ROLES, allowMustChangePin: true, handler: authChangePin_ },
    'auth.logout': { roles: ALL_ROLES, allowMustChangePin: true, handler: authLogout_ },
    'session.me': { roles: ALL_ROLES, allowMustChangePin: true, handler: sessionMe_ },
    'members.list': { roles: ALL_ROLES, handler: membersList_ },
    'checkin.status': { roles: ALL_ROLES, handler: checkinStatus_ },
    'checkin.create': { roles: [ROLE.STAFF], handler: checkinCreate_ },
    'checkin.history': { roles: ALL_ROLES, handler: checkinHistory_ },
    'dashboard.summary': { roles: [ROLE.ADMIN, ROLE.SUPERVISOR], handler: dashboardSummary_ },
    'display.summary': { roles: [ROLE.ADMIN, ROLE.SUPERVISOR], handler: displaySummary_ },
    'reports.export': { roles: [ROLE.ADMIN, ROLE.SUPERVISOR], handler: reportsExport_ },
    'events.list': { roles: [ROLE.ADMIN, ROLE.SUPERVISOR], handler: adminEventsList_ },
    'admin.members.list': { roles: [ROLE.ADMIN], handler: adminMembersList_ },
    'admin.members.add': { roles: [ROLE.ADMIN], handler: adminMembersAdd_ },
    'admin.members.update': { roles: [ROLE.ADMIN], handler: adminMembersUpdate_ },
    'admin.members.importBatch': { roles: [ROLE.ADMIN], handler: adminMembersImportBatch_ },
    'admin.users.list': { roles: [ROLE.ADMIN], handler: adminUsersList_ },
    'admin.users.create': { roles: [ROLE.ADMIN], handler: adminUsersCreate_ },
    'admin.users.update': { roles: [ROLE.ADMIN], handler: adminUsersUpdate_ },
    'admin.stations.list': { roles: [ROLE.ADMIN], handler: adminStationsList_ },
    'admin.stations.upsert': { roles: [ROLE.ADMIN], handler: adminStationsUpsert_ },
    'admin.events.upsert': { roles: [ROLE.ADMIN], handler: adminEventsUpsert_ },
    'admin.events.open': { roles: [ROLE.ADMIN], handler: adminEventsOpen_ },
    'admin.events.close': { roles: [ROLE.ADMIN], handler: adminEventsClose_ },
    'admin.checkins.cancel': { roles: [ROLE.ADMIN], handler: adminCheckinsCancel_ },
    'admin.checkins.paper': { roles: [ROLE.ADMIN], handler: adminCheckinsPaper_ },
    'audit.list': { roles: [ROLE.ADMIN], handler: auditList_ },
  };
}

function handleRequest_(req) {
  beginRequestMemo_();
  try {
    if (!req || typeof req !== 'object') return fail_('INVALID_INPUT', 'รูปแบบคำขอไม่ถูกต้อง');
    if (!isValidProxyKey_(req.proxyKey)) return fail_('UNAUTHORIZED');

    const route = getRoutes_()[req.action];
    if (!route) return fail_('INVALID_INPUT', 'ไม่รู้จักคำสั่งนี้');

    const payload = req.payload && typeof req.payload === 'object' ? req.payload : {};
    if (route.public) return route.handler(payload, null, req);

    const ctx = requireSession_(req.token);
    if (route.roles.indexOf(ctx.role) === -1) return fail_('FORBIDDEN');
    if (ctx.mustChangePin && !route.allowMustChangePin) return fail_('MUST_CHANGE_PIN');
    return route.handler(payload, ctx, req);
  } catch (err) {
    if (err && err.appCode) return fail_(err.appCode, err.message, err.appData);
    console.error('Unhandled error in ' + (req && req.action) + ': ' + (err && err.stack));
    return fail_('UNKNOWN');
  } finally {
    endRequestMemo_();
  }
}

function isValidProxyKey_(value) {
  const expected = getProp_('PROXY_KEY');
  if (!expected || typeof value !== 'string') return false;
  return safeEqual_(value, expected);
}

/** เทียบ string แบบใช้เวลาเท่ากัน ไม่ขึ้นกับตำแหน่งที่ต่าง */
function safeEqual_(a, b) {
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
