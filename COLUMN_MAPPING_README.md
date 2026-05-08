# ระบบ Column Mapping สำหรับ Import CSV

## สรุปฟีเจอร์

เพิ่มระบบ **Column Mapping** ที่ให้ผู้ใช้เลือกว่าคอลัมน์ใน CSV ตรงกับ field ไหนในระบบก่อนทำการ Import

## ปัญหาเดิม

- ระบบ Import แบบเดิมจะ auto-map คอลัมน์ตามชื่อที่ตรงกันเท่านั้น
- ถ้าชื่อคอลัมน์ใน CSV ไม่ตรงกับ field ในระบบ จะไม่สามารถ Import ได้
- ไม่สามารถเลือกว่าคอลัมน์ไหนควรไปที่ field ไหน
- ข้อมูลอาจถูก Import ผิด field

## การแก้ไข

### 1. สร้าง Column Mapping Modal
- แสดงตารางจับคู่คอลัมน์
- Auto-map คอลัมน์ที่ชื่อตรงกันหรือคล้ายกัน
- ให้ผู้ใช้เลือก mapping เอง
- แสดงสถิติและ validation

### 2. แยกกระบวนการ Import
**ขั้นตอนที่ 1: อ่านไฟล์ CSV**
- อ่าน headers และ data rows
- เก็บไว้ใน state
- แสดง Column Mapping Modal

**ขั้นตอนที่ 2: ผู้ใช้เลือก Mapping**
- เลือกว่าคอลัมน์ใน CSV ตรงกับ field ไหน
- ระบบ validate ว่า required fields ครบหรือไม่
- ตรวจสอบว่ามีคอลัมน์ซ้ำหรือไม่

**ขั้นตอนที่ 3: Import ข้อมูล**
- ใช้ mapping ที่ผู้ใช้เลือก
- Map ข้อมูลจาก CSV ไปยัง field ที่ถูกต้อง
- เช็คข้อมูลซ้ำจาก**รหัสพนักงาน**
- Import เข้า Firestore

## การใช้งาน

### 1. เลือกไฟล์ CSV
คลิกปุ่ม "Import" และเลือกไฟล์ CSV

### 2. Column Mapping Modal จะเปิดขึ้น
แสดง:
- **Field ในระบบ** (ซ้าย) - field ที่มีในระบบ
- **คอลัมน์ใน CSV** (ขวา) - dropdown ให้เลือกคอลัมน์จาก CSV

### 3. ระบบ Auto-Map
ระบบจะพยายาม auto-map คอลัมน์ที่:
- ชื่อตรงกันทุกประการ
- ชื่อคล้ายกัน (partial match)

### 4. ปรับแต่ง Mapping
- เลือก dropdown เพื่อเปลี่ยน mapping
- ถ้าไม่ต้องการ import field ใด ให้เลือก "-- ไม่เลือก --"

### 5. ตรวจสอบสถานะ
- **จับคู่แล้ว**: จำนวนคอลัมน์ที่จับคู่แล้ว
- **จำเป็น**: จำนวน required fields ที่จับคู่แล้ว
- ✅ **พร้อม Import**: แสดงเมื่อ required fields ครบทุกตัว

### 6. ยืนยันและ Import
คลิก "ยืนยันและ Import" เพื่อเริ่ม Import ข้อมูล

## ตัวอย่างการใช้งาน

### กรณีที่ 1: CSV มีชื่อคอลัมน์ตรงกับระบบ
```
CSV Headers: รหัสพนักงาน, ชื่อตัว, ชื่อสกุล, ตำแหน่ง
System Fields: รหัสพนักงาน, ชื่อตัว, ชื่อสกุล, ตำแหน่ง

Auto-mapping: ✅ ทุกคอลัมน์ถูก map อัตโนมัติ
```

### กรณีที่ 2: CSV มีชื่อคอลัมน์ต่างจากระบบ
```
CSV Headers: Employee ID, First Name, Last Name, Position
System Fields: รหัสพนักงาน, ชื่อตัว, ชื่อสกุล, ตำแหน่ง

Manual mapping required:
- Employee ID → รหัสพนักงาน
- First Name → ชื่อตัว
- Last Name → ชื่อสกุล
- Position → ตำแหน่ง
```

### กรณีที่ 3: CSV มีคอลัมน์เพิ่มเติม
```
CSV Headers: รหัสพนักงาน, ชื่อตัว, ชื่อสกุล, อายุ, ที่อยู่
System Fields: รหัสพนักงาน, ชื่อตัว, ชื่อสกุล, ตำแหน่ง

Mapping:
- รหัสพนักงาน → รหัสพนักงาน ✅
- ชื่อตัว → ชื่อตัว ✅
- ชื่อสกุล → ชื่อสกุล ✅
- อายุ → -- ไม่เลือก -- (ข้าม)
- ที่อยู่ → -- ไม่เลือก -- (ข้าม)
```

## คุณสมบัติ

### ✅ Auto-Mapping
- ตรวจสอบชื่อที่ตรงกันทุกประการ
- ตรวจสอบชื่อที่คล้ายกัน (partial match)
- รองรับทั้งภาษาไทยและอังกฤษ

### ✅ Validation
- ตรวจสอบ required fields
- ตรวจสอบคอลัมน์ซ้ำ
- แสดง error message ที่ชัดเจน

### ✅ Visual Feedback
- แสดงสถิติการจับคู่
- ไอคอน → แสดงการเชื่อมโยง
- สี badge แยกประเภท field
- แสดงสถานะ "พร้อม Import"

### ✅ User-Friendly
- Dropdown ง่ายต่อการใช้งาน
- แสดง field type และ required status
- สามารถยกเลิกได้ตลอดเวลา

## ข้อดี

✅ **ยืดหยุ่น** - รองรับ CSV ที่มีชื่อคอลัมน์ต่างกัน
✅ **ป้องกันข้อผิดพลาด** - ตรวจสอบ mapping ก่อน Import
✅ **ใช้งานง่าย** - UI ที่เข้าใจง่าย
✅ **Auto-mapping** - ลดเวลาในการ map คอลัมน์
✅ **Validation** - ตรวจสอบความถูกต้องก่อน Import
✅ **แก้ไขปัญหารหัสพนักงานซ้ำ** - เช็คจากรหัสพนักงานจริง ไม่ใช่ Document ID

## การทำงานร่วมกับฟีเจอร์อื่น

### 1. ตรวจสอบข้อมูลซ้ำ
- สำหรับ Employee modules: เช็คจาก**รหัสพนักงาน**
- สำหรับ Sub Contractor: เช็คจาก**ชื่อตัว + ชื่อสกุล**
- สำหรับ module อื่นๆ: เช็คจาก Document ID

### 2. Activity Logs
- บันทึก log เมื่อ Import สำเร็จ
- แสดงจำนวนรายการที่ Import และข้าม

### 3. Skip Rows
- ยังคงใช้งานได้ตามเดิม
- ข้ามแถวแรกตามจำนวนที่กำหนด

## Technical Details

### State Management
```typescript
const [isColumnMappingOpen, setIsColumnMappingOpen] = useState(false);
const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
const [csvRows, setCsvRows] = useState<string[][]>([]);
const [pendingFile, setPendingFile] = useState<File | null>(null);
```

### Column Mapping Format
```typescript
{
  "รหัสพนักงาน": "Employee ID",
  "ชื่อตัว": "First Name",
  "ชื่อสกุล": "Last Name",
  "ตำแหน่ง": "Position"
}
```

### Reverse Mapping (for Import)
```typescript
{
  "Employee ID": "รหัสพนักงาน",
  "First Name": "ชื่อตัว",
  "Last Name": "ชื่อสกุล",
  "Position": "ตำแหน่ง"
}
```

## สรุป

ระบบ Column Mapping ช่วยให้การ Import CSV มีความยืดหยุ่นและแม่นยำมากขึ้น โดย:
- ✅ รองรับ CSV ที่มีชื่อคอลัมน์ต่างกัน
- ✅ ให้ผู้ใช้ควบคุมการ mapping เอง
- ✅ ป้องกันข้อผิดพลาดจากการ map ผิด field
- ✅ เช็คข้อมูลซ้ำจากรหัสพนักงานจริง
- ✅ แสดง validation และ error ที่ชัดเจน
