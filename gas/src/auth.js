/**
 * Authentication & Session — SPEC.md §5, ADR 0001
 * Session เก็บใน ScriptCache: { userId, stationId } ส่วน Role/Active อ่านจากชีต Users ทุกครั้ง
 */

function authLogin_(payload) {
  const username = toText_(payload.username).toLowerCase();
  const pin = toText_(payload.pin);
  if (!username || !PIN_PATTERN.test(pin)) {
    return fail_('INVALID_INPUT', 'กรุณากรอกชื่อผู้ใช้และ PIN 6 หลัก');
  }

  const users = readTable_(SHEET.USERS);
  const user = findUserByUsername_(users, username);
  if (!user || !toBool_(user.Active)) {
    writeAudit_('', 'LOGIN_FAILED', 'User', username, '', { reason: user ? 'inactive' : 'not_found' });
    return fail_('UNAUTHORIZED', 'ชื่อผู้ใช้หรือ PIN ไม่ถูกต้อง');
  }

  const locked = lockedUntil_(user);
  if (locked) return fail_('PIN_LOCKED', null, { lockedUntil: locked });

  if (!verifyPin_(user, pin)) return registerFailedPin_(users, user);

  let station = null;
  if (user.Role === ROLE.STAFF) {
    const stationId = toText_(payload.stationId);
    if (!stationId) return fail_('INVALID_INPUT', 'กรุณาเลือกจุดลงทะเบียน');
    station = findActiveStation_(stationId);
    if (!station) return fail_('INVALID_INPUT', 'จุดลงทะเบียนนี้ไม่พร้อมใช้งาน');
  }

  updateObject_(users, user._row, { FailedAttempts: 0, LockedUntil: '' });

  const token = newToken_();
  putSession_(token, { userId: user.UserID, stationId: station ? station.StationID : '' });
  writeAudit_(user.UserID, 'LOGIN', 'Station', station ? station.StationID : '', '', {});

  const mustChangePin = toBool_(user.MustChangePin);
  const data = {
    token: token,
    user: publicUser_(user),
    station: station ? publicStation_(station) : null,
    mustChangePin: mustChangePin,
  };
  return mustChangePin ? ok_('MUST_CHANGE_PIN', null, data) : ok_('OK', 'เข้าสู่ระบบสำเร็จ', data);
}

function authChangePin_(payload, ctx) {
  const currentPin = toText_(payload.currentPin);
  const newPin = toText_(payload.newPin);
  if (!PIN_PATTERN.test(currentPin) || !PIN_PATTERN.test(newPin)) {
    return fail_('INVALID_INPUT', 'PIN ต้องเป็นตัวเลข 6 หลัก');
  }

  const users = readTable_(SHEET.USERS);
  const user = findObject_(users, function (u) { return u.UserID === ctx.userId; });
  if (!verifyPin_(user, currentPin)) {
    const res = registerFailedPin_(users, user);
    if (res.code === 'PIN_LOCKED') destroySession_(ctx.token);
    return res.code === 'PIN_LOCKED' ? res : fail_('INVALID_INPUT', 'PIN เดิมไม่ถูกต้อง');
  }
  if (newPin === currentPin) return fail_('INVALID_INPUT', 'PIN ใหม่ต้องไม่ซ้ำกับ PIN เดิม');
  if (isWeakPin_(newPin)) return fail_('INVALID_INPUT', 'PIN นี้เดาง่ายเกินไป กรุณาเลือกใหม่');

  const salt = newSalt_();
  updateObject_(users, user._row, {
    PinSalt: salt,
    PinHash: hashPin_(salt, newPin),
    MustChangePin: false,
    FailedAttempts: 0,
    LockedUntil: '',
  });
  writeAudit_(ctx.userId, 'PIN_CHANGED', 'User', ctx.userId, '', {});
  return ok_('OK', 'เปลี่ยน PIN สำเร็จ');
}

function authLogout_(payload, ctx) {
  destroySession_(ctx.token);
  writeAudit_(ctx.userId, 'LOGOUT', 'User', ctx.userId, '', {});
  return ok_('OK', 'ออกจากระบบแล้ว');
}

function sessionMe_(payload, ctx) {
  return ok_('OK', null, {
    user: { userId: ctx.userId, username: ctx.username, fullName: ctx.fullName, role: ctx.role },
    station: ctx.stationId ? { stationId: ctx.stationId, stationName: ctx.stationName } : null,
    mustChangePin: ctx.mustChangePin,
    openEvent: findOpenEvent_(),
  });
}

/**
 * ตรวจ token แล้วโหลด User จากชีตทุกครั้ง (ห้ามเชื่อ Role/Station จาก Client)
 * ต่ออายุ session แบบ sliding เมื่อผ่าน
 * @return {{token:string, userId:string, username:string, fullName:string, role:string, stationId:string, stationName:string, mustChangePin:boolean}}
 */
function requireSession_(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) appError_('UNAUTHORIZED');
  const session = getSession_(token);
  if (!session) appError_('UNAUTHORIZED', 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');

  const users = readTableMemo_(SHEET.USERS);
  const user = findObject_(users, function (u) { return u.UserID === session.userId; });
  if (!user || !toBool_(user.Active) || ALL_ROLES.indexOf(user.Role) === -1) {
    destroySession_(token);
    appError_('UNAUTHORIZED', 'บัญชีนี้ถูกปิดใช้งาน');
  }

  let station = null;
  if (user.Role === ROLE.STAFF) {
    station = session.stationId ? findActiveStation_(session.stationId) : null;
    if (!station) {
      destroySession_(token);
      appError_('UNAUTHORIZED', 'จุดลงทะเบียนถูกปิดใช้งาน กรุณาเข้าสู่ระบบใหม่');
    }
  }

  putSession_(token, session);
  return {
    token: token,
    userId: user.UserID,
    username: user.Username,
    fullName: user.FullName,
    role: user.Role,
    stationId: station ? station.StationID : '',
    stationName: station ? station.StationName : '',
    mustChangePin: toBool_(user.MustChangePin),
  };
}

/** ใช้ร่วมกับ initializeSheets และหน้าจัดการผู้ใช้ (Phase 4) */
function createUser_(users, opts) {
  const salt = newSalt_();
  const userId = newId_('U');
  appendObject_(users, {
    UserID: userId,
    Username: String(opts.username).toLowerCase(),
    FullName: opts.fullName,
    Role: opts.role,
    DefaultStationID: opts.defaultStationId || '',
    PinHash: hashPin_(salt, opts.pin),
    PinSalt: salt,
    MustChangePin: opts.mustChangePin !== false,
    FailedAttempts: 0,
    LockedUntil: '',
    Active: opts.active !== false,
  });
  return userId;
}

function findUserByUsername_(users, username) {
  const target = String(username).toLowerCase();
  return findObject_(users, function (u) { return toText_(u.Username).toLowerCase() === target; });
}

function findActiveStation_(stationId) {
  const stations = readTableMemo_(SHEET.STATIONS);
  return findObject_(stations, function (s) {
    return toText_(s.StationID) === stationId && toBool_(s.Active);
  });
}

function registerFailedPin_(users, user) {
  const attempts = (Number(user.FailedAttempts) || 0) + 1;
  if (attempts >= PIN_MAX_ATTEMPTS) {
    const until = isoAfterMinutes_(PIN_LOCK_MINUTES);
    updateObject_(users, user._row, { FailedAttempts: 0, LockedUntil: until });
    writeAudit_(user.UserID, 'PIN_LOCKED', 'User', user.UserID, '', { lockedUntil: until });
    return fail_('PIN_LOCKED', null, { lockedUntil: until });
  }
  updateObject_(users, user._row, { FailedAttempts: attempts });
  writeAudit_(user.UserID, 'LOGIN_FAILED', 'User', user.UserID, '', { attempts: attempts });
  return fail_('UNAUTHORIZED', 'ชื่อผู้ใช้หรือ PIN ไม่ถูกต้อง (เหลือ ' + (PIN_MAX_ATTEMPTS - attempts) + ' ครั้งก่อนถูกล็อก)');
}

/** @return {string} เวลาที่ปลดล็อก หรือ '' ถ้าไม่ได้ถูกล็อก */
function lockedUntil_(user) {
  const until = toText_(user.LockedUntil);
  return until && new Date(until).getTime() > Date.now() ? until : '';
}

function verifyPin_(user, pin) {
  if (!user || !user.PinSalt || !user.PinHash) return false;
  return safeEqual_(hashPin_(String(user.PinSalt), pin), String(user.PinHash));
}

function hashPin_(salt, pin) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + pin, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

/** ตัวเลขเหมือนกันหมด หรือเรียงขึ้น/ลงต่อเนื่อง */
function isWeakPin_(pin) {
  if (/^(\d)\1{5}$/.test(pin)) return true;
  return '01234567890'.indexOf(pin) !== -1 || '09876543210'.indexOf(pin) !== -1;
}

function newSalt_() {
  return Utilities.getUuid().replace(/-/g, '');
}

function newToken_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

function getSession_(token) {
  const raw = CacheService.getScriptCache().get(SESSION_CACHE_PREFIX + token);
  return raw ? JSON.parse(raw) : null;
}

function putSession_(token, session) {
  CacheService.getScriptCache().put(SESSION_CACHE_PREFIX + token, JSON.stringify(session), SESSION_TTL_SECONDS);
}

function destroySession_(token) {
  CacheService.getScriptCache().remove(SESSION_CACHE_PREFIX + token);
}

function publicUser_(user) {
  return { userId: user.UserID, username: user.Username, fullName: user.FullName, role: user.Role };
}

function publicStation_(station) {
  return { stationId: station.StationID, stationName: station.StationName };
}
