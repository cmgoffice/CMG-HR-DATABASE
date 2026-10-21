import { evaluateScan, nextDate, thaiDate } from './otScan';
const scan = { date: '2026-10-20', otStart: '16:00', punchTime: '2026-10-20 18:00:00' };
test('exact end is sufficient; one second earlier is short', () => {
  expect(evaluateScan(scan, '2').status).toBe('ok');
  expect(evaluateScan({ ...scan, punchTime: '2026-10-20 17:59:59' }, '2').status).toBe('short');
});
test('unplanned threshold and missing punches', () => {
  expect(evaluateScan({ ...scan, punchTime: '2026-10-20 17:00:00' }, '').status).toBe('unplanned');
  expect(evaluateScan({ ...scan, punchTime: '2026-10-20 16:59:59' }, '').status).toBe('none');
  expect(evaluateScan({ ...scan, punchTime: '' }, '2').status).toBe('missing');
  expect(evaluateScan({ ...scan, punchTime: '' }, '').status).toBe('none');
});
test('overnight, fractional hours and Bangkok date boundary', () => {
  expect(evaluateScan({ ...scan, otStart: '23:00', punchTime: '2026-10-21 01:30:00' }, '2.5').status).toBe('ok');
  expect(nextDate('2026-12-31')).toBe('2027-01-01');
  expect(thaiDate(new Date('2026-10-20T18:00:00Z'))).toBe('2026-10-21');
});
