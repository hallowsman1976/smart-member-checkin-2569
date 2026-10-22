# ใช้ Username + PIN ของแอปเอง ไม่ใช้ Google Account

ระบบต้องไม่ขึ้นกับว่าเจ้าหน้าที่มีบัญชี Google ใน Workspace เดียวกันหรือไม่ เพราะถ้าเป็นบัญชีส่วนตัวและ deploy แบบ "Execute as: Me" ฟังก์ชัน `Session.getActiveUser()` จะไม่คืนอีเมลของผู้ใช้ ส่วน "Execute as user accessing" ก็ต้องแชร์สิทธิ์แก้ไขชีตให้ Staff ซึ่งขัดกับข้อกำหนดว่าห้ามแก้ชีตโดยตรง จึงใช้ PIN ที่เก็บเป็น salted hash ในชีต Users และใช้ session token ที่ server ออกให้ (เก็บใน CacheService อายุไม่เกิน 6 ชม.) เป็นตัวระบุ User, Role และ Station ในทุกคำสั่ง
