# หนึ่งแถว Checkins ต่อคู่ EventID+MemberID ตลอดไป

Cancellation และ Re-check-in เปลี่ยน `Status` ของแถวเดิม (`REGISTERED` ↔ `CANCELLED`) แทนการเพิ่มแถวใหม่ ส่วนประวัติการเปลี่ยนแปลงเก็บไว้ใน AuditLogs วิธีนี้ทำให้การตรวจซ้ำภายใน Lock เหลือแค่การค้นหาคู่ Event+Member หนึ่งครั้ง และยอดบน Dashboard นับจากแถวที่ `Status = REGISTERED` ได้โดยตรง แลกกับการที่ประวัติไม่ได้อยู่ในชีต Checkins แต่อยู่ใน AuditLogs
