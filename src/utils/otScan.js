export const thaiDate = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
export const nextDate = (date, days = 1) => new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
export const stamp = (date, time) => Date.parse(`${date}T${time.replace('.', ':')}:00+07:00`);
export const evaluateScan = (scan, hours) => {
  const amount = Number(hours) || 0;
  const expected = stamp(scan.date, scan.otStart) + amount * 3600000;
  const actual = scan.punchTime ? Date.parse(scan.punchTime.replace(' ', 'T') + (/(Z|[+-]\d\d:\d\d)$/.test(scan.punchTime) ? '' : '+07:00')) : NaN;
  return { expected: new Date(expected).toISOString(), status: !Number.isFinite(actual) ? (amount > 0 ? 'missing' : 'none') : amount > 0 ? (actual >= expected ? 'ok' : 'short') : actual >= expected + 3600000 ? 'unplanned' : 'none' };
};
