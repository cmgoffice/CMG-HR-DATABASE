const XLSX = require('xlsx');
const path = require('path');

function preview(file) {
  const wb = XLSX.readFile(file);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  console.log(`\n=== ${file} ===`);
  console.log('หัวตาราง:', JSON.stringify(rows[0]));
  console.log(`จำนวนแถวข้อมูล: ${rows.length - 1}`);

  const filledCol = rows[0].length; // last column expected to be the new value column at index length-... let's detect
  // detect the value column by name in header (last column that's not one of known 5)
  const header = rows[0];
  let valueColIdx = header.findIndex((h) => String(h).trim() === 'เพศ' || String(h).trim() === 'สัญชาติ');
  if (valueColIdx === -1) valueColIdx = header.length - 1;

  let filled = 0;
  let empty = 0;
  const sample = [];
  rows.slice(1).forEach((r) => {
    const v = String(r[valueColIdx] ?? '').trim();
    if (v) {
      filled++;
      if (sample.length < 10) sample.push([r[0], r[1], v]);
    } else {
      empty++;
    }
  });
  console.log(`คอลัมน์ที่ใช้ตรวจ: "${header[valueColIdx]}" (index ${valueColIdx})`);
  console.log(`กรอกแล้ว: ${filled} | ยังว่าง: ${empty}`);
  console.log('ตัวอย่าง 10 แถวแรกที่กรอก:');
  sample.forEach((s) => console.log(' ', JSON.stringify(s)));

  // ค่าที่ใช้ทั้งหมด (unique)
  const uniqueValues = {};
  rows.slice(1).forEach((r) => {
    const v = String(r[valueColIdx] ?? '').trim();
    if (v) uniqueValues[v] = (uniqueValues[v] || 0) + 1;
  });
  console.log('ค่าที่พบทั้งหมด:', JSON.stringify(uniqueValues));
}

preview('C:\\Users\\sorra\\Downloads\\missing_gender.xlsx');
preview('C:\\Users\\sorra\\Downloads\\missing_nationality.xlsx');
