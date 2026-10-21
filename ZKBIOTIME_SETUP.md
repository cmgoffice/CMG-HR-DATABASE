# ZKBioTime ผ่าน Cloud Functions

ระบบใช้ Cloud Functions Gen 2 เป็น backend ตัวกลางสำหรับเรียก ZKBioTime แบบ read-only
หน้าเว็บจะไม่เห็น username, password หรือ JWT อีกต่อไป:

1. หน้าเว็บส่ง Firebase ID token ให้ `/api/zkteco/attendance` หรือ `/api/zkteco/sync`
2. Cloud Function ตรวจผู้ใช้และ role
3. Cloud Function ขอ JWT จาก ZKBioTime แล้วเรียก `/iclock/api/transactions/`
4. ผลตรวจเวลาออกถูกเก็บใน `overtime/{YYYY-MM-DD}.records.{employeeId}.scan`

## ตั้งค่า

เก็บค่าไว้ที่ root `.env` ของโปรเจกต์เท่านั้น:

```ini
ZK_API_BASE_URL=http://cmgserver.reyeeddns.com
ZK_API_USERNAME=...
ZK_API_PASSWORD=...
ZK_API_AUTH_SCHEME=JWT
```

ก่อน deploy ระบบจะคัดลอกเฉพาะค่า ZK ไปเป็น `functions/.env` อัตโนมัติ ไฟล์นี้ถูก ignore ใน Git
และไม่ถูกสร้างเป็นไฟล์ใน `public` อีกแล้ว

ติดตั้ง dependency และ deploy:

```powershell
cd "C:\Users\Administrator\Pictures\Git repository\CMG-HR-DATABASE-1"
npm install --prefix functions
npm run build
firebase deploy --only functions,hosting
```

การ deploy Functions Gen 2 ต้องใช้โปรเจกต์ Firebase ที่เปิด billing/Blaze plan แล้ว ควรตั้ง budget alert ใน Google Cloud ไว้ด้วย

## ทดสอบจากหน้าเว็บ

หน้า Attendance ใช้ปุ่มทดสอบรหัสพนักงานและวันที่ ระบบเรียก backend endpoint เดิมของเว็บ จึงไม่ต้องเปิด CORS ที่ ZKBioTime และไม่มีปัญหา mixed content จาก browser

หน้า OT มีปุ่มตั้งเวลาอยู่หน้าปุ่มรูปภาพ การตั้งค่าแยกตามโครงการ เช่น `09:00` หมายถึงหลังเวลานี้ให้ดึงข้อมูลของวันก่อนหน้า

- Cloud Scheduler เรียก `syncZktecoOt` ทุก 5 นาที
- จะดึงครั้งแรกเป็นเมื่อวาน และครั้งถัดไปต่อจาก `lastDate`
- ปิดหน้าเว็บแล้วระบบยังทำงานต่อได้
- ปุ่ม “ดึงข้อมูลเมื่อวานตอนนี้” เรียก backend ทันทีสำหรับการทดสอบ
- การกดปุ่มจากหน้า OT จะส่งรหัสเอกสารของแถวที่กำลังแสดงอยู่ให้ backend โดยตรง แล้ว backend ใช้ฟิลด์ `รหัสพนักงาน` ของแถวนั้นค้นหาใน ZKBioTime ไม่ตรวจ `สถานะโครงการ` ซ้ำ
- เมื่อกดบันทึกการตั้งเวลา ระบบจะเก็บชุดแถวที่หน้า OT แสดงไว้กับโครงการนั้น เพื่อให้รอบอัตโนมัติใช้ชุดพนักงานเดียวกัน
- งานตรวจเลือก `punch_state=1` ที่อยู่ตั้งแต่เวลาเริ่มงานของวันนั้นถึงก่อนเวลาเริ่มงานวันถัดไป
- ใช้โครงการที่เลือกในหน้า OT เป็นตัวระบุสำหรับพนักงานที่อยู่หลายโครงการ จึงดึงได้แม้รายการ OT เดิมยังไม่มี `project`; หากรายการ OT ของวันนั้นถูกผูกกับโครงการอื่นอยู่แล้ว ระบบจะไม่เขียนทับ

## ผลต่อการแสดงผล OT

ระบบเพิ่มเฉพาะ field `scan` ในรายการ OT เดิม ไม่แก้ `hours`, `type`, `recordedAt` หรือสูตรคำนวณเดิม:

- OT มีเวลาออกถึงเวลาที่คาดหมาย: ช่องเขียวและแสดงเวลาเล็กด้านบน
- OT มีเวลาออกก่อนเวลาที่คาดหมาย: แสดงเวลาแดงและ Warning
- มี OT แต่ไม่พบเวลาออก: แสดง Warning
- ไม่มี OT แต่ออกช้ากว่าเวลาเริ่ม OT อย่างน้อย 1 ชั่วโมง: แสดงเวลาแดงและ Warning

กรณีดึงไม่สำเร็จจะไม่ล้าง `scan` เดิม และ job จะไม่เลื่อน `lastDate` เพื่อให้ Cloud Scheduler ลองใหม่ในรอบถัดไป
