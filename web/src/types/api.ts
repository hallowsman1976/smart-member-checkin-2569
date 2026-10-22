/**
 * API contract — ต้องตรงกับ gas/src (router.js, response.js) และ SPEC.md §4
 */

export type ResponseCode =
  | 'OK'
  | 'REGISTERED'
  | 'ALREADY_REGISTERED'
  | 'MEMBER_NOT_FOUND'
  | 'MEMBER_INACTIVE'
  | 'EVENT_CLOSED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'MUST_CHANGE_PIN'
  | 'PIN_LOCKED'
  | 'INVALID_INPUT'
  | 'BUSY'
  | 'UNKNOWN'

export interface ApiResponse<T = unknown> {
  success: boolean
  code: ResponseCode
  message: string
  data?: T
}

export type Role = 'ADMIN' | 'SUPERVISOR' | 'STAFF'
export type MemberType = 'ORDINARY' | 'ASSOCIATE'
export type CheckinStatus = 'REGISTERED' | 'CANCELLED'
export type CheckinSource = 'STATION' | 'PAPER'

export interface User {
  userId: string
  username: string
  fullName: string
  role: Role
}

export interface Station {
  stationId: string
  stationName: string
}

export interface OpenEvent {
  eventId: string
  eventName: string
  eventDate: string
  quorumThreshold: number
}

export interface Member {
  memberId: string
  fullName: string
  office: string
  memberType: MemberType
}

export interface MemberDetail extends Member {
  active: boolean
}

export interface Checkin {
  checkinId: string
  eventId: string
  memberId: string
  status: CheckinStatus
  source: CheckinSource
  checkinTime: string
  stationId: string
  stationName: string
  staffId: string
  requestId: string
}

export interface LoginData {
  token: string
  user: User
  station: Station | null
  mustChangePin: boolean
}

export interface SessionData {
  user: User
  station: Station | null
  mustChangePin: boolean
  openEvent: OpenEvent | null
}

export interface CheckinResultData {
  member: MemberDetail
  checkin: Checkin
  replayed?: boolean
}

export interface CheckinStatusData {
  found: boolean
  openEvent?: OpenEvent | null
  member: MemberDetail | null
  checkin: Checkin | null
}

export type EventStatus = 'DRAFT' | 'OPEN' | 'CLOSED'

export interface EventInfo {
  eventId: string
  eventName: string
  eventDate: string
  status: EventStatus
  quorumThreshold: number
  openedAt: string
  closedAt: string
}

export interface Summary {
  event: (OpenEvent & Partial<EventInfo>) | null
  totals: { members: number; registered: number; notRegistered: number; percent: number; cancelled: number; paper: number }
  quorum: { threshold: number; ordinaryMembers: number; ordinaryRegistered: number; reached: boolean; remaining: number }
  byStation: { stationId: string; stationName: string; registered: number }[]
  byMemberType: { memberType: MemberType; total: number; registered: number }[]
  byOffice: { office: string; total: number; registered: number }[]
  recent: { memberId: string; fullName: string; office: string; stationId: string; checkinTime: string; source: CheckinSource }[]
  generatedAt: string
}

export type DisplaySummary = Pick<Summary, 'event' | 'totals' | 'quorum' | 'byStation' | 'generatedAt'>

export interface HistoryItem extends Checkin {
  fullName: string
  office: string
  memberType: MemberType | ''
}

export interface AdminUser {
  userId: string
  username: string
  fullName: string
  role: Role
  defaultStationId: string
  mustChangePin: boolean
  lockedUntil: string
  active: boolean
}

export interface AdminStation extends Station {
  active: boolean
}

export interface AuditItem {
  logId: string
  timestamp: string
  userId: string
  action: string
  entityType: string
  entityId: string
  reason: string
  details: string
}

export interface ReportRow {
  memberId: string
  fullName: string
  office: string
  memberType: MemberType
  status: CheckinStatus | 'NOT_REGISTERED'
  checkinTime: string
  stationId: string
  stationName: string
  source: CheckinSource | ''
}

export interface ImportRow {
  memberId: string
  fullName: string
  office: string
  memberType: MemberType
  active?: boolean
}

type NoPayload = Record<string, never>

/** action → payload / data */
export interface ApiActions {
  'stations.list': { payload: Record<string, never>; data: { items: Station[] } }
  'auth.login': { payload: { username: string; pin: string; stationId?: string }; data: LoginData }
  'auth.changePin': { payload: { currentPin: string; newPin: string }; data: undefined }
  'auth.logout': { payload: Record<string, never>; data: undefined }
  'session.me': { payload: Record<string, never>; data: SessionData }
  'members.list': { payload: Record<string, never>; data: { items: Member[]; loadedAt: string } }
  'checkin.status': { payload: { memberId: string } | { requestId: string }; data: CheckinStatusData }
  'checkin.create': { payload: { memberId: string }; data: CheckinResultData }
  'checkin.history': {
    payload: { limit?: number; offset?: number; stationId?: string; eventId?: string }
    data: { items: HistoryItem[]; total: number; eventId: string; stationId: string }
  }
  'dashboard.summary': { payload: { eventId?: string }; data: Summary }
  'display.summary': { payload: { eventId?: string }; data: DisplaySummary }
  'reports.export': { payload: { eventId?: string }; data: { event: OpenEvent; rows: ReportRow[]; generatedAt: string } }
  'events.list': { payload: NoPayload; data: { items: EventInfo[] } }
  'audit.list': { payload: { limit?: number; offset?: number }; data: { items: AuditItem[]; total: number } }
  'admin.members.list': { payload: NoPayload; data: { items: MemberDetail[] } }
  'admin.members.add': {
    payload: { memberId: string; fullName: string; office: string; memberType: MemberType; reason: string }
    data: { member: Member }
  }
  'admin.members.update': {
    payload: { memberId: string; fullName?: string; office?: string; memberType?: MemberType; active?: boolean; reason: string }
    data: undefined
  }
  'admin.members.importBatch': {
    payload: { rows: ImportRow[]; batchIndex?: number; fileName?: string }
    data: { inserted: number; updated: number; errors?: { row: number; message: string }[] }
  }
  'admin.users.list': { payload: NoPayload; data: { items: AdminUser[] } }
  'admin.users.create': {
    payload: { username: string; fullName: string; role: Role; defaultStationId?: string; pin: string }
    data: { userId: string }
  }
  'admin.users.update': {
    payload: { userId: string; fullName?: string; role?: Role; defaultStationId?: string; active?: boolean; resetPin?: string; unlock?: boolean }
    data: undefined
  }
  'admin.stations.list': { payload: NoPayload; data: { items: AdminStation[] } }
  'admin.stations.upsert': { payload: { stationId: string; stationName: string; active: boolean }; data: undefined }
  'admin.events.upsert': {
    payload: { eventId?: string; eventName: string; eventDate: string; quorumThreshold: number }
    data: { eventId: string }
  }
  'admin.events.open': { payload: { eventId: string; reason?: string }; data: undefined }
  'admin.events.close': { payload: { eventId: string }; data: { backupSheet: string } }
  'admin.checkins.cancel': { payload: { memberId: string; reason: string; eventId?: string }; data: undefined }
  'admin.checkins.paper': {
    payload: { memberId: string; checkinTime: string; stationId: string; reason: string; eventId?: string }
    data: CheckinResultData
  }
}

export type ActionName = keyof ApiActions
