/**
 * ค่าคงที่ของระบบ — ไฟล์นี้มีแต่ค่าคงที่ ห้ามเรียก service ของ Apps Script ที่ top level
 * ดูนิยามคอลัมน์ใน SPEC.md §3
 */

const TIMEZONE = 'Asia/Bangkok';

const SHEET = Object.freeze({
  MEMBERS: 'Members',
  CHECKINS: 'Checkins',
  USERS: 'Users',
  STATIONS: 'Stations',
  EVENTS: 'Events',
  AUDIT: 'AuditLogs',
});

const ROLE = Object.freeze({ ADMIN: 'ADMIN', SUPERVISOR: 'SUPERVISOR', STAFF: 'STAFF' });
const ALL_ROLES = Object.freeze([ROLE.ADMIN, ROLE.SUPERVISOR, ROLE.STAFF]);

const MEMBER_TYPE = Object.freeze({ ORDINARY: 'ORDINARY', ASSOCIATE: 'ASSOCIATE' });
const CHECKIN_STATUS = Object.freeze({ REGISTERED: 'REGISTERED', CANCELLED: 'CANCELLED' });
const CHECKIN_SOURCE = Object.freeze({ STATION: 'STATION', PAPER: 'PAPER' });
const EVENT_STATUS = Object.freeze({ DRAFT: 'DRAFT', OPEN: 'OPEN', CLOSED: 'CLOSED' });

/**
 * headers: ลำดับคอลัมน์ตอนสร้างชีตใหม่ (ระบบอ่านด้วยชื่อ header ไม่ใช่ลำดับ)
 * enums / checkboxes / numbers: ใช้ตั้ง data validation และ format; คอลัมน์อื่นเป็น Plain text
 * minRows: จำนวนแถวที่เตรียม format ไว้ล่วงหน้า
 */
const SCHEMA = Object.freeze({
  Members: {
    headers: ['MemberID', 'FullName', 'Office', 'MemberType', 'Active', 'UpdatedAt', 'UpdatedBy'],
    enums: { MemberType: [MEMBER_TYPE.ORDINARY, MEMBER_TYPE.ASSOCIATE] },
    checkboxes: ['Active'],
    numbers: [],
    minRows: 3000,
  },
  Checkins: {
    headers: ['CheckinID', 'EventID', 'MemberID', 'Status', 'Source', 'CheckinTime', 'StationID', 'StaffID', 'RequestID', 'UpdatedAt', 'UpdatedBy'],
    enums: {
      Status: [CHECKIN_STATUS.REGISTERED, CHECKIN_STATUS.CANCELLED],
      Source: [CHECKIN_SOURCE.STATION, CHECKIN_SOURCE.PAPER],
    },
    checkboxes: [],
    numbers: [],
    minRows: 3000,
  },
  Users: {
    headers: ['UserID', 'Username', 'FullName', 'Role', 'DefaultStationID', 'PinHash', 'PinSalt', 'MustChangePin', 'FailedAttempts', 'LockedUntil', 'Active'],
    enums: { Role: [ROLE.ADMIN, ROLE.SUPERVISOR, ROLE.STAFF] },
    checkboxes: ['MustChangePin', 'Active'],
    numbers: ['FailedAttempts'],
    minRows: 200,
  },
  Stations: {
    headers: ['StationID', 'StationName', 'Active'],
    enums: {},
    checkboxes: ['Active'],
    numbers: [],
    minRows: 100,
  },
  Events: {
    headers: ['EventID', 'EventName', 'EventDate', 'Status', 'QuorumThreshold', 'OpenedAt', 'ClosedAt'],
    enums: { Status: [EVENT_STATUS.DRAFT, EVENT_STATUS.OPEN, EVENT_STATUS.CLOSED] },
    checkboxes: [],
    numbers: ['QuorumThreshold'],
    minRows: 100,
  },
  AuditLogs: {
    headers: ['LogID', 'Timestamp', 'UserID', 'Action', 'EntityType', 'EntityID', 'Reason', 'Details'],
    enums: {},
    checkboxes: [],
    numbers: [],
    minRows: 20000,
  },
});

const SESSION_TTL_SECONDS = 2 * 60 * 60;
const SESSION_CACHE_PREFIX = 'sess:';
const PIN_PATTERN = /^\d{6}$/;
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCK_MINUTES = 15;
const DEFAULT_STATION_COUNT = 8;
