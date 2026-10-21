export interface OtScan { date: string; project: string; otStart: string; punchTime: string; transactionId: string; fetchedAt: number; status: string; expected: string }
export function thaiDate(now?: Date): string;
export function nextDate(date: string, days?: number): string;
export function stamp(date: string, time: string): number;
export function evaluateScan(scan: Pick<OtScan, 'date' | 'otStart' | 'punchTime'>, hours: string): { expected: string; status: string };
