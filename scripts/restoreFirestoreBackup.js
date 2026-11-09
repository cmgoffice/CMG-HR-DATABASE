/**
 * Restore collection จากไฟล์ backup ที่สร้างโดย migrateEmployeeDocIds.js
 * DRY RUN เป็นค่าเริ่มต้น:  node scripts/restoreFirestoreBackup.js backups/xxx.json
 * รันจริง:                  node scripts/restoreFirestoreBackup.js backups/xxx.json --execute
 * ลบเอกสารที่ไม่อยู่ใน backup ด้วย (เช่นเอกสาร ID ใหม่ที่ migrate สร้าง) เพื่อคืนสภาพเดิมเต็มรูปแบบ:  --prune
 */
const fs = require('fs');
const { collection, doc, getDocs, setDoc, deleteDoc } = require('firebase/firestore');
const { db, deserialize } = require('./firestoreBackupUtil');

const file = process.argv[2];
const EXECUTE = process.argv.includes('--execute');
const PRUNE = process.argv.includes('--prune');
if (!file || file.startsWith('--')) {
  console.error('ระบุไฟล์ backup: node scripts/restoreFirestoreBackup.js <backup.json> [--execute] [--prune]');
  process.exit(1);
}

async function main() {
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  const name = backup.collection;
  const inBackup = new Set(backup.docs.map((d) => d.id));
  const snap = await getDocs(collection(db, 'CMG-HR-Database', 'root', name));
  const extra = snap.docs.filter((d) => !inBackup.has(d.id));
  console.log(`${EXECUTE ? '⚠️  รันจริง' : '🔍 DRY RUN'}: restore ${name} จาก ${file}`);
  console.log(`เอกสารใน backup: ${backup.docs.length} | ปัจจุบัน: ${snap.size} | ไม่อยู่ใน backup: ${extra.length}${PRUNE ? ' (จะถูกลบ)' : ' (ไม่ลบ ใส่ --prune ถ้าต้องการ)'}`);
  if (!EXECUTE) { console.log('ยังไม่ได้เขียนอะไร เพิ่ม --execute เพื่อ restore จริง'); return; }
  let n = 0;
  for (const d of backup.docs) {
    await setDoc(doc(db, 'CMG-HR-Database', 'root', name, d.id), deserialize(d.data));
    n++;
  }
  console.log(`✅ เขียนคืน ${n} เอกสาร`);
  if (PRUNE) {
    for (const d of extra) { await deleteDoc(d.ref); console.log(`  🗑  ลบ ${d.id}`); }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('❌ Error:', e); process.exit(1); });
