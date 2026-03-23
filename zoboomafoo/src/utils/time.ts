import { DateTime } from 'luxon';
import { AppError } from './errors';

export function parseSessionTime(
  dateStr: string,
  timeStr: string,
  timezone: string
): Date {
  const dt = DateTime.fromFormat(
    `${dateStr} ${timeStr}`,
    'yyyy-MM-dd HH:mm',
    { zone: timezone }
  );

  if (!dt.isValid) {
    throw new AppError(
      `Invalid date/time: "${dateStr} ${timeStr}" in timezone "${timezone}". Use YYYY-MM-DD and HH:MM (24-hour).`
    );
  }

  if (dt.toUTC() < DateTime.utc()) {
    throw new AppError('Session time must be in the future.');
  }

  return dt.toUTC().toJSDate();
}

export function discordTimestamp(date: Date, style: 'F' | 'R' | 't' | 'D' = 'F'): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}

export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
