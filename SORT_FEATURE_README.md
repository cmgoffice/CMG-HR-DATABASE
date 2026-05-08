# ฟีเจอร์ Sort Column ในตาราง Employee

## สรุปการเปลี่ยนแปลง

เพิ่มฟีเจอร์การเรียงลำดับข้อมูล (Sort) ให้กับตาราง Employee ทุกประเภท:
- **Employee Indirect**
- **Direct - Team Leader**
- **Direct - Supply DC**
- **Direct - Sub Contractor**
- **Position Labor**
- **โครงการ (Projects)**

## วิธีการใช้งาน

### 1. การเรียงลำดับข้อมูล
- **คลิกที่ Header Column** เพื่อเรียงลำดับข้อมูลในคอลัมน์นั้น
- ระบบจะวนลูปผ่าน 3 สถานะ:
  1. **ไม่เรียง** (ไม่มีไอคอน) → แสดงข้อมูลตามลำดับเดิม
  2. **เรียงจากน้อยไปมาก (Ascending)** → แสดงไอคอน ↑ สีน้ำเงิน
  3. **เรียงจากมากไปน้อย (Descending)** → แสดงไอคอน ↓ สีน้ำเงิน
  4. กลับไปที่ **ไม่เรียง** (วนลูป)

### 2. ไอคอนแสดงสถานะ
- **↕️ (ArrowUpDown)** - แสดงเมื่อ hover บนคอลัมน์ที่ยังไม่ได้เรียง (สีเทา)
- **↑ (ArrowUp)** - แสดงเมื่อเรียงจากน้อยไปมาก (สีน้ำเงิน)
- **↓ (ArrowDown)** - แสดงเมื่อเรียงจากมากไปน้อย (สีน้ำเงิน)

### 3. การเรียงลำดับแบบอัจฉริยะ
ระบบจะตรวจสอบประเภทข้อมูลอัตโนมัติ:

#### ตัวเลข (Numbers)
- เรียงตามค่าตัวเลข
- ตัวอย่าง: 1, 2, 10, 20, 100

#### ข้อความ (Text)
- เรียงตามตัวอักษร (รองรับภาษาไทย)
- ใช้ `localeCompare` พร้อม Thai locale
- รองรับการเรียงแบบ natural sort (เช่น "A1, A2, A10" แทนที่จะเป็น "A1, A10, A2")

#### ค่าว่าง (Null/Undefined)
- ค่าว่างจะถูกเรียงไปอยู่ท้ายสุดเสมอ

## การทำงานร่วมกับฟีเจอร์อื่น

### 1. ค้นหา (Search)
- สามารถใช้ร่วมกับการค้นหาได้
- ระบบจะกรองข้อมูลก่อน แล้วจึงเรียงลำดับ

### 2. ลาก-วาง Column (Drag & Drop)
- ยังคงสามารถลากเพื่อจัดเรียงคอลัมน์ได้ตามเดิม
- ใช้ไอคอน **⋮⋮** (GripVertical) เพื่อลาก
- คลิกที่ชื่อคอลัมน์เพื่อ Sort

### 3. ซ่อน/แสดง Column
- การ Sort จะทำงานเฉพาะคอลัมน์ที่แสดงอยู่
- เมื่อซ่อนคอลัมน์ที่กำลัง Sort อยู่ ระบบจะรีเซ็ตการ Sort

### 4. เปลี่ยน Module
- เมื่อเปลี่ยนไปยัง Module อื่น ระบบจะรีเซ็ตการ Sort อัตโนมัติ

## รายละเอียดทางเทคนิค

### State Management
```typescript
const [sortConfig, setSortConfig] = useState<{ 
  key: string; 
  direction: 'asc' | 'desc' | null 
}>({ 
  key: '', 
  direction: null 
});
```

### ฟังก์ชัน handleSort
```typescript
const handleSort = (columnKey: string) => {
  setSortConfig((prev) => {
    if (prev.key !== columnKey) {
      // คอลัมน์ใหม่ - เริ่มด้วย ascending
      return { key: columnKey, direction: 'asc' };
    }
    
    // คอลัมน์เดิม - วนลูป
    if (prev.direction === null) {
      return { key: columnKey, direction: 'asc' };
    } else if (prev.direction === 'asc') {
      return { key: columnKey, direction: 'desc' };
    } else {
      // desc -> null (ล้างการ sort)
      return { key: '', direction: null };
    }
  });
};
```

### การเรียงลำดับข้อมูล
```typescript
const filteredData = useMemo(() => {
  let data = currentData;
  
  // Filter by search query
  if (searchQuery) {
    data = data.filter((row) =>
      Object.values(row).some((val) =>
        String(val).toLowerCase().includes(searchQuery.toLowerCase())
      )
    );
  }
  
  // Sort data
  if (sortConfig.key && sortConfig.direction) {
    data = [...data].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      
      // Handle null/undefined
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sortConfig.direction === 'asc' ? 1 : -1;
      if (bVal == null) return sortConfig.direction === 'asc' ? -1 : 1;
      
      const aStr = String(aVal);
      const bStr = String(bVal);
      
      // Try to parse as numbers
      const aNum = parseFloat(aStr);
      const bNum = parseFloat(bStr);
      
      // Compare as numbers if both are valid
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
      }
      
      // Compare as strings with Thai locale
      const comparison = aStr.localeCompare(bStr, 'th', { 
        numeric: true, 
        sensitivity: 'base' 
      });
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }
  
  return data;
}, [currentData, searchQuery, sortConfig]);
```

## ตัวอย่างการใช้งาน

### ตัวอย่างที่ 1: เรียงตามรหัสพนักงาน
1. คลิกที่ Header "รหัสพนักงาน"
2. ข้อมูลจะเรียงจาก A → Z (หรือ 1 → 9)
3. คลิกอีกครั้ง → เรียงจาก Z → A (หรือ 9 → 1)
4. คลิกอีกครั้ง → กลับไปแสดงตามลำดับเดิม

### ตัวอย่างที่ 2: เรียงตามชื่อ
1. คลิกที่ Header "ชื่อตัว"
2. ข้อมูลจะเรียงตามตัวอักษรไทย (ก → ฮ)
3. คลิกอีกครั้ง → เรียงย้อนกลับ (ฮ → ก)

### ตัวอย่างที่ 3: เรียงตามตำแหน่ง
1. คลิกที่ Header "ตำแหน่ง"
2. ข้อมูลจะเรียงตามชื่อตำแหน่ง
3. รองรับการเรียงแบบ natural sort

## ข้อดีของฟีเจอร์นี้

✅ **ใช้งานง่าย** - คลิกเดียวเพื่อเรียงลำดับ
✅ **รองรับภาษาไทย** - เรียงตัวอักษรไทยได้ถูกต้อง
✅ **อัจฉริยะ** - แยกแยะตัวเลขและข้อความอัตโนมัติ
✅ **วนลูป** - สามารถกลับไปสถานะเดิมได้
✅ **แสดงสถานะชัดเจน** - มีไอคอนบอกสถานะการเรียง
✅ **ทำงานร่วมกับฟีเจอร์อื่น** - ไม่กระทบกับการค้นหาและการกรอง

## หมายเหตุ

- ฟีเจอร์นี้ใช้งานได้กับทุกตารางในระบบ ยกเว้น:
  - Activity Logs (มีการเรียงตาม timestamp อยู่แล้ว)
  - User Management (มีการจัดการแยกต่างหาก)
  - Attendance (มีโครงสร้างตารางแบบพิเศษ)
  - Manpower Dashboard (เป็น Dashboard ไม่ใช่ตาราง)

- การ Sort จะทำงานบน client-side (ในเบราว์เซอร์) ไม่ส่งคำขอไปยัง Firebase
- ข้อมูลที่แสดงจะถูกเรียงลำดับใหม่ทันทีโดยไม่ต้องรอโหลดข้อมูล
