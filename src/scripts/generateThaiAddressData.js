const fs = require('fs');
const path = require('path');

const data = require(path.join(__dirname, '..', 'data', 'thai_address_raw.json'));

const provinces = [];
const districts = [];
const subDistricts = [];

data.forEach((p) => {
  const provinceName = p.prefix ? p.prefix.th + p.name.th : p.name.th;
  provinces.push({ id: p.id, name: provinceName });
  (p.districts || []).forEach((d) => {
    const districtName = d.prefix ? d.prefix.th + d.name.th : d.name.th;
    districts.push({ id: d.id, name: districtName, provinceId: p.id });
    (d.sub_districts || []).forEach((s) => {
      const subName = s.prefix ? s.prefix.th + s.name.th : s.name.th;
      subDistricts.push({ id: s.id, name: subName, districtId: d.id, zip: s.zip_code });
    });
  });
});

console.log('provinces:', provinces.length, 'districts:', districts.length, 'subDistricts:', subDistricts.length);

const header = [
  '/**',
  ' * ข้อมูลเขตการปกครองไทย (จังหวัด/อำเภอ/ตำบล/รหัสไปรษณีย์)',
  ' * ที่มา: https://github.com/kongvut/thai-province-data (ดึงเมื่อ ' + new Date().toISOString().slice(0, 10) + ')',
  ' * ใช้สำหรับ cascading dropdown ในฟอร์มที่อยู่พนักงาน (ประเทศ=ไทย เท่านั้น)',
  ' *',
  ' * อย่าแก้ไฟล์นี้ด้วยมือ — ถ้าต้องอัปเดตข้อมูล ให้ดึงใหม่จากแหล่งที่มาแล้ว generate ใหม่',
  ' * (ดู src/scripts/generateThaiAddressData.js)',
  ' */',
  '',
  'export interface ThaiProvince { id: number; name: string; }',
  'export interface ThaiDistrict { id: number; name: string; provinceId: number; }',
  'export interface ThaiSubDistrict { id: number; name: string; districtId: number; zip: number; }',
  '',
].join('\n');

const body = [
  'export const THAI_PROVINCES: ThaiProvince[] = ' + JSON.stringify(provinces) + ';',
  '',
  'export const THAI_DISTRICTS: ThaiDistrict[] = ' + JSON.stringify(districts) + ';',
  '',
  'export const THAI_SUB_DISTRICTS: ThaiSubDistrict[] = ' + JSON.stringify(subDistricts) + ';',
  '',
  'export const getDistrictsByProvince = (provinceId: number): ThaiDistrict[] =>',
  '  THAI_DISTRICTS.filter((d) => d.provinceId === provinceId);',
  '',
  'export const getSubDistrictsByDistrict = (districtId: number): ThaiSubDistrict[] =>',
  '  THAI_SUB_DISTRICTS.filter((s) => s.districtId === districtId);',
  '',
  'export const findProvinceByName = (name: string): ThaiProvince | undefined =>',
  '  THAI_PROVINCES.find((p) => p.name === name);',
  '',
  'export const findDistrictByName = (name: string, provinceId?: number): ThaiDistrict | undefined =>',
  '  THAI_DISTRICTS.find((d) => d.name === name && (provinceId === undefined || d.provinceId === provinceId));',
  '',
  'export const findSubDistrictByName = (name: string, districtId?: number): ThaiSubDistrict | undefined =>',
  '  THAI_SUB_DISTRICTS.find((s) => s.name === name && (districtId === undefined || s.districtId === districtId));',
  '',
].join('\n');

const outPath = path.join(__dirname, '..', 'data', 'thailandAddress.ts');
fs.writeFileSync(outPath, header + body, 'utf8');
console.log('wrote', outPath, 'size:', fs.statSync(outPath).size);
