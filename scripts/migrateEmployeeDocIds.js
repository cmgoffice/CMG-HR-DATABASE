/**
 * เปลี่ยน doc ID ใน employee_data ให้เป็น "รหัสพนักงาน" (เช่นเอกสารที่ ID เป็นชื่อ AUNG_HTET_KTAW_- -> SC0282)
 *
 * ค่าเริ่มต้น = DRY RUN (อ่านอย่างเดียว ไม่เขียนอะไร):
 *   node scripts/migrateEmployeeDocIds.js
 * รันจริง (สร้าง backup ทั้ง collection อัตโนมัติก่อน แล้วค่อยย้าย):
 *   node scripts/migrateEmployeeDocIds.js --execute
 * ข้ามการเช็คการอ้างอิงใน collection อื่น (ไม่แนะนำ):  --allow-orphans
 *
 * กฎ:
 *  - ไม่มีรหัสพนักงาน             -> ข้าม (รายงาน)
 *  - ID ปลายทางมีเอกสารอื่นอยู่แล้ว -> ข้าม (รายงาน ไม่เขียนทับ)
 *  - หลายเอกสารได้ ID ปลายทางเดียวกัน -> ข้ามทั้งหมด (รายงาน)
 *  - ย้ายแบบ: เขียนใหม่ -> อ่านกลับมาเทียบ -> ลบอันเก่า (ถ้าเทียบไม่ตรงจะไม่ลบ)
 * Restore: node scripts/restoreFirestoreBackup.js <backup.json> --execute --prune
 */
const fs = require('fs');
const path = require('path');
const { collection, doc, getDocs, setDoc, getDoc, deleteDoc } = require('firebase/firestore');
const { db, serialize } = require('./firestoreBackupUtil');

const EXECUTE = process.argv.includes('--execute');
const ALLOW_ORPHANS = process.argv.includes('--allow-orphans');
const COLLECTION = 'employee_data';
// collection ที่อาจอ้างอิงรหัส/ID พนักงาน (key หรือ value) — เช็คก่อนย้ายเพื่อกัน record กำพร้า
const REFERENCE_COLLECTIONS = ['overtime', 'attendance', 'evaluation_assignments', 'evaluation_scores', 'recruitment_pending_employees'];

// เหมือนที่ App ใช้ sanitize doc ID
const toDocId = (code) => String(code).trim().replace(/[\/\.\#\$\{\}]/g, '_');
const label = (d) => `[${d.data['ชื่อตัว'] || ''} ${d.data['ชื่อสกุล'] || ''} | ${d.data.employee_type || ''}]`;

async function main() {
  console.log(EXECUTE ? '⚠️  โหมดรันจริง (--execute)\n' : '🔍 DRY RUN — ไม่มีการเขียนข้อมูล\n');
  const snap = await getDocs(collection(db, 'CMG-HR-Database', 'root', COLLECTION));
  const docs = snap.docs.map((d) => ({ id: d.id, ref: d.ref, data: d.data() }));
  console.log(`พบเอกสารใน ${COLLECTION}: ${docs.length}`);

  const existingIds = new Set(docs.map((d) => d.id));
  const noCode = [];
  const candidates = [];
  for (const d of docs) {
    const code = String(d.data['รหัสพนักงาน'] == null ? '' : d.data['รหัสพนักงาน']).trim();
    if (!code) { noCode.push(d); continue; }
    const target = toDocId(code);
    if (target !== d.id) candidates.push({ ...d, code, target });
  }

  const byTarget = {};
  candidates.forEach((c) => { (byTarget[c.target] = byTarget[c.target] || []).push(c); });
  const toMove = [];
  const conflicts = [];
  for (const c of candidates) {
    if (existingIds.has(c.target)) conflicts.push({ ...c, reason: `ID ปลายทาง "${c.target}" มีเอกสารอื่นอยู่แล้ว` });
    else if (byTarget[c.target].length > 1) conflicts.push({ ...c, reason: `มี ${byTarget[c.target].length} เอกสารจะได้ ID "${c.target}" เหมือนกัน` });
    else toMove.push(c);
  }

  console.log(`ID ตรงกับรหัสพนักงานอยู่แล้ว: ${docs.length - candidates.length - noCode.length}`);
  console.log(`ต้องเปลี่ยน ID (ย้ายได้): ${toMove.length}`);
  console.log(`ชนกัน/ข้าม: ${conflicts.length}`);
  console.log(`ไม่มีรหัสพนักงาน/ข้าม: ${noCode.length}\n`);

  toMove.forEach((c) => console.log(`  ✔ ${c.id}  ->  ${c.target}   ${label(c)}`));
  if (conflicts.length) {
    console.log('\n⚠️ ชนกัน (จะไม่ถูกย้าย):');
    conflicts.forEach((c) => console.log(`  ✖ ${c.id} -> ${c.target}: ${c.reason}   ${label(c)}`));
  }
  if (noCode.length) {
    console.log('\n⚠️ ไม่มีรหัสพนักงาน (จะไม่ถูกย้าย ต้องกรอกรหัสเอง):');
    noCode.forEach((d) => console.log(`  ? ${d.id}   ${label(d)}`));
  }

  // เช็คการอ้างอิง ID เดิมใน collection อื่น
  let orphanRisk = 0;
  if (toMove.length) {
    console.log('\n🔎 ตรวจการอ้างอิง ID เดิมใน collection อื่น...');
    const oldIds = toMove.map((c) => JSON.stringify(c.id));
    for (const name of REFERENCE_COLLECTIONS) {
      let s;
      try { s = await getDocs(collection(db, 'CMG-HR-Database', 'root', name)); } catch (e) { console.log(`  - ${name}: อ่านไม่ได้ (${e.message})`); continue; }
      let hits = 0;
      s.docs.forEach((d) => {
        const text = JSON.stringify(serialize(d.data()));
        if (oldIds.some((id) => text.includes(id))) hits++;
      });
      console.log(`  - ${name}: ${s.size} เอกสาร, พบการอ้างอิง ID เดิม ${hits} เอกสาร`);
      orphanRisk += hits;
    }
  }

  if (!EXECUTE) {
    console.log('\n✅ Dry run เสร็จ ยังไม่ได้แก้อะไร — ตรวจรายการแล้วรันจริงด้วย: node scripts/migrateEmployeeDocIds.js --execute');
    return;
  }
  if (!toMove.length) { console.log('\nไม่มีอะไรต้องย้าย'); return; }
  if (orphanRisk > 0 && !ALLOW_ORPHANS) {
    console.log(`\n⛔ หยุด: มีเอกสารอื่นอ้างอิง ID เดิม ${orphanRisk} เอกสาร ย้ายแล้วจะกำพร้า (ถ้ายืนยันว่าไม่เป็นไร ใส่ --allow-orphans)`);
    process.exitCode = 1;
    return;
  }

  // 1) Backup ทั้ง collection ก่อน
  const dir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(dir, `${COLLECTION}_${stamp}.json`);
  fs.writeFileSync(backupFile, JSON.stringify({
    collection: COLLECTION,
    createdAt: new Date().toISOString(),
    count: docs.length,
    docs: docs.map((d) => ({ id: d.id, data: serialize(d.data) })),
  }, null, 2));
  const check = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
  if (check.docs.length !== docs.length) throw new Error('Backup ไม่ครบ หยุดการทำงาน');
  console.log(`\n💾 Backup แล้ว: ${backupFile} (${check.docs.length} เอกสาร)`);

  // 2) ย้าย: เขียนใหม่ -> verify -> ลบเก่า
  const log = [];
  let ok = 0;
  let failed = 0;
  for (const c of toMove) {
    try {
      const newRef = doc(db, 'CMG-HR-Database', 'root', COLLECTION, c.target);
      await setDoc(newRef, c.data);
      const back = await getDoc(newRef);
      if (!back.exists() || JSON.stringify(serialize(back.data())) !== JSON.stringify(serialize(c.data))) {
        throw new Error('เอกสารใหม่ไม่ตรงกับต้นฉบับ (ไม่ลบอันเก่า)');
      }
      await deleteDoc(c.ref);
      log.push({ from: c.id, to: c.target });
      ok++;
      console.log(`  ✅ ${c.id} -> ${c.target}`);
    } catch (e) {
      failed++;
      console.log(`  ❌ ${c.id} -> ${c.target}: ${e.message}`);
    }
  }
  const logFile = path.join(dir, `${COLLECTION}_migration-log_${stamp}.json`);
  fs.writeFileSync(logFile, JSON.stringify(log, null, 2));
  console.log(`\n🎉 สำเร็จ ${ok}, ล้มเหลว ${failed}\nlog: ${logFile}\nRestore: node scripts/restoreFirestoreBackup.js "${backupFile}" --execute --prune`);
}

main().then(() => process.exit(process.exitCode || 0)).catch((e) => { console.error('❌ Error:', e); process.exit(1); });
