/**
 * แปลง exports/missing_gender.csv และ exports/missing_nationality.csv
 * ให้เป็นไฟล์ Excel (.xlsx) แยกกัน 2 ไฟล์
 *
 * รัน: node src/scripts/exportMissingToExcel.js
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

function parseCsv(file) {
  const content = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const lines = content.split(/\r\n/).filter(Boolean);
  return lines.map((line) => {
    const cols = line.match(/("(?:[^"]|"")*"|[^,]*)(,|$)/g) || [];
    return cols
      .map((c) => c.replace(/,$/, ''))
      .filter((c, i, arr) => !(c === '' && i === arr.length - 1))
      .map((c) => c.replace(/^"|"$/g, '').replace(/""/g, '"'));
  });
}

function csvToXlsx(csvFile, xlsxFile, sheetName) {
  const rows = parseCsv(path.join('exports', csvFile));
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 22 }, { wch: 20 }, { wch: 45 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, path.join('exports', xlsxFile));
  console.log(`✅ สร้าง exports/${xlsxFile} (${rows.length - 1} แถวข้อมูล)`);
}

csvToXlsx('missing_gender.csv', 'missing_gender.xlsx', 'ไม่มีเพศ');
csvToXlsx('missing_nationality.csv', 'missing_nationality.xlsx', 'ไม่มีสัญชาติ');
