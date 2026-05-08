# แก้ไขการตรวจสอบข้อมูลซ้ำใน Import CSV

## ปัญหาเดิม

เมื่อ Import ข้อมูลพนักงาน ระบบเช็คว่ามี **Document ID** อยู่แล้วหรือไม่ แต่ไม่ได้เช็คจาก**รหัสพนักงาน**ที่อยู่ในข้อมูล

ผลลัพธ์:
- ถ้าพนักงานมีสถานะ "ลาออก" หรือ "เลิกจ้าง" แล้ว Import ใหม่ด้วยรหัสพนักงานเดิม
- ระบบจะสร้างข้อมูลใหม่ได้ เพราะ Document ID อาจต่างกัน
- ทำให้มีรหัสพนักงานซ้ำในระบบ ❌

## การแก้ไข

เปลี่ยนการตรวจสอบสำหรับ **Employee Modules** ให้เช็คจาก**รหัสพนักงาน**แทน Document ID

### โค้ดใหม่

```typescript
// สำหรับ Employee modules: เช็คจากรหัสพนักงานในข้อมูลที่มีอยู่แล้ว
const isEmployeeModule = activeModule.startsWith("emp_") || activeModule === "employee_data";

if (isEmployeeModule && primaryKeyField === "รหัสพนักงาน") {
  // เช็คว่ามีรหัสพนักงานนี้อยู่ในระบบแล้วหรือไม่
  const alreadyExists = currentData.some((item) => {
    const existingId = String(item["รหัสพนักงาน"] || "").trim();
    const newId = String(rawId).trim();
    return existingId === newId;
  });
  
  if (alreadyExists) {
    skipCount++;
    skippedIds.push(rawId);
  } else {
    await setDoc(doc(db, "CMG-HR-Database", "root", subcollectionName, docId), docData);
    successCount++;
  }
} else {
  // สำหรับ module อื่นๆ: เช็คจาก document ID ตามเดิม
  const docRef = doc(db, "CMG-HR-Database", "root", subcollectionName, docId);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    skipCount++;
    skippedIds.push(rawId);
  } else {
    await setDoc(docRef, docData);
    successCount++;
  }
}
```

## การทำงานหลังแก้ไข

### สำหรับ Employee Modules
- **Employee Indirect** (`emp_indirect`)
- **Direct - Team Leader** (`emp_direct_leader`)
- **Direct - Supply DC** (`emp_direct_supply`)
- **Direct - Sub Contractor** (`emp_direct_sub`)

**วิธีการตรวจสอบ:**
1. เช็คจาก**รหัสพนักงาน**ในข้อมูลที่มีอยู่แล้ว (`currentData`)
2. ถ้ามีรหัสพนักงานซ้ำ → ข้ามการ Import
3. ถ้าไม่ซ้ำ → Import ข้อมูลใหม่

**ตัวอย่าง:**
```
ข้อมูลในระบบ:
- รหัสพนักงาน: 570001, สถานะ: "ลาออก"

Import ใหม่:
- รหัสพนักงาน: 570001, สถานะ: "ทำงาน"

ผลลัพธ์: ❌ ข้าม (มีรหัสพนักงาน 570001 อยู่แล้ว)
```

### สำหรับ Module อื่นๆ
- **โครงการ** (`projects`)
- **Position Labor** (`position_labor`)
- **Client List** (`client_list`)
- **Contractors** (`contractors`)

**วิธีการตรวจสอบ:**
- เช็คจาก **Document ID** ตามเดิม
- ใช้ `getDoc()` เพื่อตรวจสอบว่ามี document อยู่แล้วหรือไม่

### กรณีพิเศษ: Sub Contractor
- ใช้ **ชื่อตัว + ชื่อสกุล** เป็น unique key
- ไม่ใช้รหัสพนักงาน

## ข้อดีของการแก้ไข

✅ **ป้องกันรหัสพนักงานซ้ำ** - ไม่สามารถ Import รหัสพนักงานที่มีอยู่แล้วได้
✅ **เช็คจากข้อมูลจริง** - เช็คจาก `currentData` ที่โหลดมาจาก Firestore
✅ **รองรับทุกสถานะ** - ไม่ว่าพนักงานจะมีสถานะอะไร (ทำงาน, ลาออก, เลิกจ้าง) ก็เช็คได้
✅ **ไม่กระทบ Module อื่น** - Module อื่นๆ ยังคงใช้วิธีเดิม

## ตัวอย่างการใช้งาน

### กรณีที่ 1: Import รหัสพนักงานใหม่
```
ข้อมูลในระบบ: ไม่มี
Import: รหัสพนักงาน 690273

ผลลัพธ์: ✅ นำเข้าสำเร็จ
```

### กรณีที่ 2: Import รหัสพนักงานซ้ำ (สถานะทำงาน)
```
ข้อมูลในระบบ: รหัสพนักงาน 570001, สถานะ "ทำงาน"
Import: รหัสพนักงาน 570001

ผลลัพธ์: ❌ ข้าม (มีอยู่แล้ว)
```

### กรณีที่ 3: Import รหัสพนักงานซ้ำ (สถานะลาออก)
```
ข้อมูลในระบบ: รหัสพนักงาน 570001, สถานะ "ลาออก"
Import: รหัสพนักงาน 570001

ผลลัพธ์: ❌ ข้าม (มีอยู่แล้ว)
```

### กรณีที่ 4: Import หลายรายการ
```
Import 4 รายการ:
- 570001 (มีอยู่แล้ว)
- 570002 (มีอยู่แล้ว)
- 690273 (ใหม่)
- 690275 (ใหม่)

ผลลัพธ์:
✅ นำเข้าสำเร็จ: 2 รายการ (690273, 690275)
❌ ข้าม (มีอยู่แล้ว): 2 รายการ (570001, 570002)
```

## ข้อควรระวัง

⚠️ **การอัปเดตข้อมูลพนักงานที่มีอยู่แล้ว**

ถ้าต้องการอัปเดตข้อมูลพนักงานที่มีอยู่แล้ว มี 2 วิธี:

### วิธีที่ 1: แก้ไขในระบบ
1. ค้นหารหัสพนักงานในตาราง
2. คลิกปุ่ม "แก้ไข" (ไอคอนดินสอ)
3. แก้ไขข้อมูลและบันทึก

### วิธีที่ 2: ลบแล้ว Import ใหม่
1. ลบข้อมูลพนักงานเดิมออกจากระบบ
2. Import ข้อมูลใหม่

## Performance

- **ไม่ต้องเรียก Firestore** สำหรับการเช็คข้อมูลซ้ำ (Employee modules)
- ใช้ข้อมูลที่โหลดมาแล้วใน `currentData`
- ลด Read Operations จาก Firestore
- Import เร็วขึ้น ⚡

## สรุป

การแก้ไขนี้ทำให้ระบบ Import CSV สำหรับพนักงานมีความแม่นยำมากขึ้น โดย:
- ✅ เช็คจาก**รหัสพนักงาน**แทน Document ID
- ✅ ป้องกันรหัสพนักงานซ้ำในระบบ
- ✅ รองรับทุกสถานะพนักงาน
- ✅ ไม่กระทบการทำงานของ Module อื่นๆ
