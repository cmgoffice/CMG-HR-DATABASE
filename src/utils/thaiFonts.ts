// Fontsource font assets ใช้ร่วมกันระหว่าง followUpDocuments.ts และ announcementDocument.ts
// ต้อง import ผ่านไฟล์กลางนี้ไฟล์เดียว (ห้าม import ตรงจาก "@fontsource/..." ซ้ำในหลายไฟล์)
// เพราะ webpack 5 asset modules จะ error "Can't handle conflicting asset info for sourceFilename"
// เมื่อโมดูลสองตัวที่ import ไฟล์เดียวกันถูก concatenate (module concatenation) เข้าด้วยกัน
import sarabunLatinRegularUrl from "@fontsource/sarabun/files/sarabun-latin-400-normal.woff";
import sarabunLatinBoldUrl from "@fontsource/sarabun/files/sarabun-latin-600-normal.woff";

export { sarabunLatinRegularUrl, sarabunLatinBoldUrl };
