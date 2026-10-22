/**
 * Audit Log — ห้ามใส่ PIN, PinHash, token หรือข้อมูลบัตรใน details
 */

function writeAudit_(userId, action, entityType, entityId, reason, details) {
  const table = readHeaderOnly_(SHEET.AUDIT);
  appendObject_(table, {
    LogID: newId_('L'),
    Timestamp: nowIso_(),
    UserID: userId || '',
    Action: action,
    EntityType: entityType || '',
    EntityID: entityId || '',
    Reason: reason || '',
    Details: details ? JSON.stringify(details) : '',
  });
}

/** payload: { limit?: 1–200 (default 50), offset?: number } เรียงจากล่าสุด */
function auditList_(payload) {
  const limit = Math.min(Math.max(parseInt(payload.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(payload.offset, 10) || 0, 0);
  const table = readTable_(SHEET.AUDIT);
  const items = [];
  for (let i = table.rows.length - 1 - offset; i >= 0 && items.length < limit; i--) {
    const o = rowToObject_(table, i);
    items.push({
      logId: o.LogID,
      timestamp: o.Timestamp,
      userId: o.UserID,
      action: o.Action,
      entityType: o.EntityType,
      entityId: o.EntityID,
      reason: o.Reason,
      details: o.Details,
    });
  }
  return ok_('OK', null, { items: items, total: table.rows.length });
}
