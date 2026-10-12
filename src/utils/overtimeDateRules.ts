/**
 * OT entry is intentionally unrestricted by date. Future OT can be recorded for
 * any date without a cutoff or weekday restriction.
 */
export const isOvertimeDateAllowed = (_dateStr: string): boolean => true;
