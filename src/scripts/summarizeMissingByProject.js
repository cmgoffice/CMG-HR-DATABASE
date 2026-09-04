const fs = require('fs');

function parseCsv(file) {
  const content = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const lines = content.split(/\r\n/).filter(Boolean);
  return lines.slice(1).map((line) => {
    const cols = line.match(/("[^"]*"|[^,]+)/g) || [];
    return cols.map((c) => c.replace(/^"|"$/g, ''));
  });
}

['missing_gender.csv', 'missing_nationality.csv'].forEach((f) => {
  const rows = parseCsv('exports/' + f);
  const byProject = {};
  rows.forEach((r) => {
    const proj = r[4] || 'ไม่ระบุ';
    byProject[proj] = (byProject[proj] || 0) + 1;
  });
  console.log(`=== ${f} (${rows.length} คน) ===`);
  Object.entries(byProject)
    .sort((a, b) => b[1] - a[1])
    .forEach(([p, c]) => console.log(`  ${c} คน - ${p}`));
  console.log('');
});
