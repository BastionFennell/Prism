export interface TopSlot {
  startAt: string;       // "YYYY-MM-DDTHH:MM" local to poll timezone
  endAt: string;         // "YYYY-MM-DDTHH:MM"
  availableCount: number;
  totalMembers: number;
  label: string;         // "Sat Apr 5 · 6:00 – 9:00 PM"
}

interface PollConfig {
  dateRangeStart: Date;
  dateRangeEnd: Date;
  dailyWindowStart: string;   // "18:00"
  dailyWindowEnd: string;     // "23:00"
  sessionDurationMinutes: number;
  timezone: string;
  memberDiscordIds: string;   // JSON array
}

interface AvailabilityRow {
  discordUserId: string;
  slots: string;  // JSON array of "YYYY-MM-DDTHH:MM"
}

function parseTime(timeStr: string): { h: number; m: number } {
  const [h, m] = timeStr.split(':').map(Number);
  return { h, m };
}

function minutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function addMinutes(timeStr: string, minutes: number): string {
  const { h, m } = parseTime(timeStr);
  const total = h * 60 + m + minutes;
  return minutesToTime(total % (24 * 60));
}

function formatSlotLabel(startAt: string, endAt: string, timezone: string): string {
  const startDate = new Date(startAt + ':00');
  const endDate = new Date(endAt + ':00');

  const dayFmt = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: timezone,
  });
  const timeFmt = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone,
  });

  // startAt is already local, treat as UTC for formatting purposes
  // since we store as "YYYY-MM-DDTHH:MM" local strings, we format directly
  const [datePart, timePart] = startAt.split('T');
  const [y, mo, d] = datePart.split('-').map(Number);
  const [endDatePart, endTimePart] = endAt.split('T');
  const [, , endD] = endDatePart.split('-').map(Number);

  const startDateObj = new Date(Date.UTC(y, mo - 1, d));
  const dayStr = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(startDateObj);

  const { h: sh, m: sm } = parseTime(timePart);
  const { h: eh, m: em } = parseTime(endTimePart);

  const startAmPm = sh < 12 ? 'AM' : 'PM';
  const endAmPm = eh < 12 ? 'AM' : 'PM';
  const startHr = sh % 12 || 12;
  const endHr = eh % 12 || 12;

  const startStr = sm === 0 ? `${startHr}:00` : `${startHr}:${String(sm).padStart(2, '0')}`;
  const endStr = em === 0 ? `${endHr}:00` : `${endHr}:${String(em).padStart(2, '0')}`;

  const timeRange = startAmPm === endAmPm
    ? `${startStr} – ${endStr} ${endAmPm}`
    : `${startStr} ${startAmPm} – ${endStr} ${endAmPm}`;

  return `${dayStr} · ${timeRange}`;
}

function dateToLocalStr(date: Date): string {
  const y = date.getUTCFullYear();
  const mo = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

export function computeTopSlots(
  poll: PollConfig,
  availabilities: AvailabilityRow[]
): TopSlot[] {
  const memberIds: string[] = JSON.parse(poll.memberDiscordIds);
  const totalMembers = memberIds.length;

  // Build set of slots per voter
  const voterSets = new Map<string, Set<string>>();
  for (const av of availabilities) {
    const slots: string[] = JSON.parse(av.slots);
    voterSets.set(av.discordUserId, new Set(slots));
  }

  const { h: winH, m: winM } = parseTime(poll.dailyWindowStart);
  const { h: woutH, m: woutM } = parseTime(poll.dailyWindowEnd);
  const windowStartMin = winH * 60 + winM;
  const windowEndMin = woutH * 60 + woutM;

  const SLOT_MINUTES = 30;
  const slotsPerSession = poll.sessionDurationMinutes / SLOT_MINUTES;

  // Generate all candidate start times
  const candidates: Array<{ startAt: string; endAt: string; score: number }> = [];

  // Iterate each day in range (inclusive)
  const startDay = new Date(poll.dateRangeStart);
  const endDay = new Date(poll.dateRangeEnd);
  startDay.setUTCHours(0, 0, 0, 0);
  endDay.setUTCHours(0, 0, 0, 0);

  for (let day = new Date(startDay); day <= endDay; day.setUTCDate(day.getUTCDate() + 1)) {
    const dateStr = dateToLocalStr(day);

    // Candidate starts: windowStart to windowEnd - sessionDuration
    const lastValidStart = windowEndMin - poll.sessionDurationMinutes;
    for (let startMin = windowStartMin; startMin <= lastValidStart; startMin += SLOT_MINUTES) {
      const startTime = minutesToTime(startMin);
      const startAt = `${dateStr}T${startTime}`;

      // Generate sub-slots for this window
      const subSlots: string[] = [];
      for (let i = 0; i < slotsPerSession; i++) {
        const slotTime = minutesToTime(startMin + i * SLOT_MINUTES);
        subSlots.push(`${dateStr}T${slotTime}`);
      }

      // Count voters available for ALL sub-slots
      let availableCount = 0;
      voterSets.forEach(slotSet => {
        if (subSlots.every(s => slotSet.has(s))) availableCount++;
      });

      const endMin = startMin + poll.sessionDurationMinutes;
      const endTime = minutesToTime(endMin);
      const endAt = endMin >= 24 * 60
        ? `${dateStr}T23:59`  // clamp to same day display
        : `${dateStr}T${endTime}`;

      candidates.push({ startAt, endAt, score: availableCount });
    }
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  const selected = candidates.slice(0, 5);

  return selected.map(s => ({
    startAt: s.startAt,
    endAt: s.endAt,
    availableCount: s.score,
    totalMembers,
    label: formatSlotLabel(s.startAt, s.endAt, poll.timezone),
  }));
}

export function allMembersVoted(poll: PollConfig, availabilities: AvailabilityRow[]): boolean {
  const memberIds: string[] = JSON.parse(poll.memberDiscordIds);
  const votedIds = new Set(availabilities.map(a => a.discordUserId));
  return memberIds.every(id => votedIds.has(id));
}
