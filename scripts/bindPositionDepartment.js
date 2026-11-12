/**
 * ปรับแผนกและชื่อตำแหน่งของพนักงานให้ตรงแผนที่ตำแหน่งหลัก
 * อ่านอย่างเดียวเป็นค่าเริ่มต้น เขียนเมื่อใส่ --write
 *
 * node scripts/bindPositionDepartment.js
 * node scripts/bindPositionDepartment.js --write
 */
const { getDocs, collection, doc, getDoc, writeBatch, updateDoc, addDoc, deleteDoc } = require("firebase/firestore");
const { db } = require("./firestoreBackupUtil");

const run = async () => {
  const { POSITION_DEPARTMENT, POSITION_RENAMES, canonicalPositionName, departmentForPosition } = await import(
    "../src/config/positionDepartment.ts"
  );
  const shouldWrite = process.argv.includes("--write");

  const employeeSnap = await getDocs(collection(db, "CMG-HR-Database", "root", "employee_data"));
  const positionSnap = await getDocs(collection(db, "CMG-HR-Database", "root", "position_labor"));
  const schemaRef = doc(db, "CMG-HR-Database", "root", "module_schemas", "position_labor");
  const schemaSnap = await getDoc(schemaRef);

  const employeeUpdates = [];
  const renameCounts = {};
  const departmentCounts = {};

  employeeSnap.forEach((docSnap) => {
    const data = docSnap.data();
    const projects = Array.isArray(data["สถานะโครงการ"])
      ? data["สถานะโครงการ"]
      : [data["สถานะโครงการ"], data["โครงการ"]].filter(Boolean);
    const currentPosition = String(data["ตำแหน่ง"] || "").trim();
    const currentDepartment = String(data["แผนก"] || "").trim();
    const nextPosition = canonicalPositionName(currentPosition, projects) || currentPosition;
    const lockedDepartment = departmentForPosition(nextPosition, projects);
    let nextDepartment = currentDepartment;
    if (lockedDepartment) nextDepartment = lockedDepartment;
    else if (currentDepartment === "HR") nextDepartment = "Human resource";

    const patch = {};
    if (nextPosition !== currentPosition) patch["ตำแหน่ง"] = nextPosition;
    if (nextDepartment !== currentDepartment) patch["แผนก"] = nextDepartment;
    if (Object.keys(patch).length === 0) return;

    if (patch["ตำแหน่ง"]) {
      const key = `${currentPosition} -> ${nextPosition}`;
      renameCounts[key] = (renameCounts[key] || 0) + 1;
    }
    if (patch["แผนก"]) {
      const key = `${nextPosition || "(ว่าง)"} : ${currentDepartment || "(ว่าง)"} -> ${nextDepartment}`;
      departmentCounts[key] = (departmentCounts[key] || 0) + 1;
    }
    employeeUpdates.push({ id: docSnap.id, patch });
  });

  const positionsByName = new Map();
  positionSnap.docs.forEach((docSnap) => {
    const data = docSnap.data();
    const name = String(data.position || docSnap.id || "").trim();
    if (name) positionsByName.set(name, { id: docSnap.id, data });
  });

  const positionWrites = [];
  const renamedAway = new Set();

  const renameMaster = (from, to) => {
    const source = positionsByName.get(from);
    if (!source || renamedAway.has(from)) return;
    const department = POSITION_DEPARTMENT[to] || "";
    if (positionsByName.has(to)) {
      positionWrites.push({ op: "delete", id: source.id, label: `ลบตัวเลือกซ้ำ ${from}` });
    } else {
      positionWrites.push({
        op: "update",
        id: source.id,
        patch: { position: to, ...(department ? { department } : {}) },
        label: `เปลี่ยนชื่อตำแหน่ง ${from} -> ${to}`,
      });
      positionsByName.set(to, { id: source.id, data: { ...source.data, position: to, department } });
    }
    renamedAway.add(from);
    positionsByName.delete(from);
  };

  Object.entries(POSITION_RENAMES).forEach(([from, to]) => renameMaster(from, to));
  renameMaster("Interpreter", "Admin - ล่ามจีน");

  ["ล่ามพม่า", "พนักงานขับรถ", "Admin - ล่ามจีน", "Survey Assistant"].forEach((name) => {
    if (positionsByName.has(name)) return;
    positionWrites.push({
      op: "add",
      data: { position: name, department: POSITION_DEPARTMENT[name] || "", labor_cost_baht: "" },
      label: `เพิ่มตำแหน่ง ${name}`,
    });
    positionsByName.set(name, { id: "", data: { position: name } });
  });

  positionsByName.forEach((entry, name) => {
    const department = POSITION_DEPARTMENT[name];
    if (!department || !entry.id) return;
    if (String(entry.data.department || "").trim() === department) return;
    const alreadyRenamed = positionWrites.some((item) => item.op === "update" && item.id === entry.id && item.patch.department === department);
    if (alreadyRenamed) return;
    positionWrites.push({
      op: "update",
      id: entry.id,
      patch: { department },
      label: `ตั้งแผนก ${name} -> ${department}`,
    });
  });

  let schemaPatch = null;
  if (schemaSnap.exists()) {
    const fields = Array.isArray(schemaSnap.data().fields) ? [...schemaSnap.data().fields] : [];
    if (!fields.some((field) => field.id === "department")) {
      const positionIndex = fields.findIndex((field) => field.id === "position");
      const field = { id: "department", label: "แผนกหลัก", type: "text" };
      if (positionIndex >= 0) fields.splice(positionIndex + 1, 0, field);
      else fields.push(field);
      schemaPatch = fields;
    }
  }

  console.log(shouldWrite ? "WRITE" : "DRY RUN");
  console.log(`พนักงานที่จะปรับ ${employeeUpdates.length} คน`);
  console.log("--- เปลี่ยนชื่อตำแหน่ง ---");
  Object.entries(renameCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([key, count]) => console.log(`${count}\t${key}`));
  console.log("--- เปลี่ยนแผนก ---");
  Object.entries(departmentCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([key, count]) => console.log(`${count}\t${key}`));
  console.log("--- position_labor ---");
  positionWrites.forEach((item) => console.log(item.label));
  console.log(schemaPatch ? "schema position_labor จะเพิ่มฟิลด์ แผนกหลัก" : "schema position_labor มีฟิลด์แผนกหลักแล้ว หรือยังไม่มีเอกสาร schema");

  if (!shouldWrite) {
    console.log("ยังไม่เขียนข้อมูล ใส่ --write เพื่อบันทึก");
    process.exit(0);
  }

  const commitChunks = async (operations) => {
    const chunkSize = 400;
    for (let index = 0; index < operations.length; index += chunkSize) {
      const batch = writeBatch(db);
      operations.slice(index, index + chunkSize).forEach((operation) => operation(batch));
      await batch.commit();
    }
  };

  await commitChunks(
    employeeUpdates.map((item) => (batch) => {
      batch.update(doc(db, "CMG-HR-Database", "root", "employee_data", item.id), item.patch);
    })
  );

  for (const item of positionWrites) {
    if (item.op === "update") {
      await updateDoc(doc(db, "CMG-HR-Database", "root", "position_labor", item.id), item.patch);
    } else if (item.op === "delete") {
      await deleteDoc(doc(db, "CMG-HR-Database", "root", "position_labor", item.id));
    } else if (item.op === "add") {
      await addDoc(collection(db, "CMG-HR-Database", "root", "position_labor"), item.data);
    }
  }

  if (schemaPatch) {
    await updateDoc(schemaRef, { fields: schemaPatch });
  }

  console.log("บันทึกแล้ว");
  process.exit(0);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
