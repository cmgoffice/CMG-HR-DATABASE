/**
 * สคริปต์เปลี่ยนสถานะ "ค้างลงเวลา" (ช่องว่าง/ไม่มี attendance record) ของวันที่ผ่านมาแล้ว
 * ทั้งหมดในระบบ ให้กลายเป็น "H" (วันหยุดพนักงาน) สำหรับพนักงานที่สถานะ = "ทำงาน"
 *
 * ขอบเขต:
 *  - เฉพาะ attendance document ที่มีอยู่แล้วในระบบ (ไม่สร้างวันใหม่ที่ไม่เคยมีข้อมูล)
 *  - เฉพาะวันที่ก่อนวันนี้ (ไม่แตะวันนี้/อนาคต)
 *  - เฉพาะพนักงานที่ สถานะพนักงาน === "ทำงาน"
 *  - เปลี่ยนเฉพาะช่องที่ "ว่างจริง ๆ" เท่านั้น (ไม่มี record หรือ status ว่าง)
 *    ช่องที่มีสถานะอยู่แล้ว (มา/ไม่มา/ลา/ขาดงาน/H) หรือถูกล็อค (editstatus) จะไม่ถูกแตะต้อง
 *
 * วิธีใช้:
 *   node src/scripts/fillMissingAttendanceWithH.js            → dry run (แสดงผลตรวจสอบ ไม่บันทึก)
 *   node src/scripts/fillMissingAttendanceWithH.js --confirm  → ยืนยันบันทึกจริง
 */

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, updateDoc } = require('firebase/firestore');
require('dotenv').config();

// Firebase config (ใช้จาก .env ถ้ามี ไม่งั้น fallback ไปที่ค่าเดียวกับ src/App.tsx)
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyB4nIgikGx6xMsSWOMfJsKWta1bfPmVTcc",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "cmg-hr-database.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "cmg-hr-database",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "cmg-hr-database.firebasestorage.app",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "625046761441",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:625046761441:web:22493e0b56a984cf5daca0",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function isEmptyEntry(val) {
  if (val === undefined || val === null) return true;
  if (typeof val === 'string') return val === '';
  if (typeof val === 'object') return !val.status;
  return false;
}

async function fillMissingAttendanceWithH() {
  const isConfirm = process.argv.includes('--confirm');

  console.log('🔍 เริ่มตรวจสอบข้อมูล...\n');

  try {
    // 1. โหลดพนักงานที่สถานะ = "ทำงาน"
    console.log('👥 กำลังโหลดข้อมูลพนักงาน...');
    const employeesSnap = await getDocs(collection(db, 'CMG-HR-Database', 'root', 'employee_data'));
    const activeEmployeeIds = new Set(
      employeesSnap.docs
        .filter((d) => d.data()['สถานะพนักงาน'] === 'ทำงาน')
        .map((d) => d.id)
    );
    console.log(`✅ พนักงานที่สถานะทำงาน: ${activeEmployeeIds.size} คน\n`);

    // 2. วันนี้ (เที่ยงคืน) เพื่อกันไม่ให้แตะวันนี้/อนาคต
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 3. โหลด attendance document ทั้งหมดที่มีอยู่แล้วในระบบ
    console.log('📅 กำลังโหลดข้อมูลลงเวลาทั้งหมด...');
    const attendanceSnap = await getDocs(collection(db, 'CMG-HR-Database', 'root', 'attendance'));
    console.log(`✅ พบเอกสารลงเวลา: ${attendanceSnap.docs.length} วัน\n`);

    let totalDaysChecked = 0;
    let totalDaysToUpdate = 0;
    let totalCellsToFill = 0;
    const updates = [];

    attendanceSnap.docs.forEach((docSnap) => {
      const dateStr = docSnap.id; // รูปแบบ YYYY-MM-DD

      const targetDate = new Date(dateStr);
      if (isNaN(targetDate.getTime())) return; // ข้าม doc ที่ id ไม่ใช่รูปแบบวันที่
      targetDate.setHours(0, 0, 0, 0);

      if (targetDate >= today) return; // ข้ามวันนี้และอนาคต

      totalDaysChecked++;

      const data = docSnap.data();
      const records = { ...(data.records || {}) };
      let changedInDay = 0;
      const now = Date.now();

      activeEmployeeIds.forEach((empId) => {
        const existing = records[empId];
        if (!isEmptyEntry(existing)) return; // มีสถานะอยู่แล้ว ไม่แตะ

        const base = existing && typeof existing === 'object' ? existing : {};
        records[empId] = {
          ...base,
          status: 'H',
          recordedAt: now,
        };
        changedInDay++;
      });

      if (changedInDay > 0) {
        totalDaysToUpdate++;
        totalCellsToFill += changedInDay;
        updates.push({
          dateStr,
          ref: doc(db, 'CMG-HR-Database', 'root', 'attendance', dateStr),
          records,
          changedInDay,
        });
        console.log(`  🔧 ${dateStr}: จะเติม H ให้ ${changedInDay} ช่อง (ที่ว่างอยู่)`);
      }
    });

    console.log(`\n📊 สรุปผลการตรวจสอบ:`);
    console.log(`   - วันที่ตรวจสอบ (ก่อนวันนี้): ${totalDaysChecked} วัน`);
    console.log(`   - วันที่ต้องแก้ไข: ${totalDaysToUpdate} วัน`);
    console.log(`   - จำนวนช่องที่จะเติม H: ${totalCellsToFill} ช่อง\n`);

    if (updates.length === 0) {
      console.log('✅ ไม่มีข้อมูลที่ต้องแก้ไข');
      return;
    }

    if (!isConfirm) {
      console.log('ℹ️  นี่คือ dry run เท่านั้น ยังไม่มีการบันทึกข้อมูลจริง');
      console.log('   หากต้องการดำเนินการต่อ ให้รันคำสั่ง: node src/scripts/fillMissingAttendanceWithH.js --confirm');
      return;
    }

    // 4. บันทึกจริง
    console.log('🚀 เริ่มอัพเดทข้อมูล...\n');
    let successCount = 0;
    let errorCount = 0;

    for (const update of updates) {
      try {
        await updateDoc(update.ref, {
          records: update.records,
          lastUpdatedBy: 'system-script:fillMissingAttendanceWithH',
          lastUpdatedAt: Date.now(),
        });
        successCount++;
        console.log(`✅ ${update.dateStr}: อัพเดทสำเร็จ (${update.changedInDay} ช่อง)`);
      } catch (error) {
        errorCount++;
        console.error(`❌ ${update.dateStr}: เกิดข้อผิดพลาด`, error.message);
      }
    }

    console.log(`\n🎉 เสร็จสิ้น!`);
    console.log(`   - สำเร็จ: ${successCount} วัน`);
    console.log(`   - ล้มเหลว: ${errorCount} วัน`);
  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาด:', error);
  }
}

fillMissingAttendanceWithH()
  .then(() => {
    console.log('\n✅ สคริปต์ทำงานเสร็จสิ้น');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ สคริปต์เกิดข้อผิดพลาด:', error);
    process.exit(1);
  });
