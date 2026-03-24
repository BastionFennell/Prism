'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';

interface PollData {
  pollId: string;
  gameName: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  sessionDurationMinutes: number;
  dailyWindowStart: string;
  dailyWindowEnd: string;
  timezone: string;
  expiresAt: string;
  status: string;
  totalMembers: number;
  voters: { discordUserId: string; discordUsername: string }[];
  mySlots: string[];
  slotCounts: Record<string, number>;
}

const CELL_H = 32;        // px — cell height
const HEADER_H = 52;      // px — day header height
const HOUR_GAP = 6;       // px — extra top gap before each :00 row
const HALF_GAP = 2;       // px — gap between :30 and next :00
const TIME_W = 60;        // px — width of the time-label column

function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function minutesToTime(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}
function formatTimeDisplay(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  const hr = h % 12 || 12;
  return m === 0 ? `${hr} ${period}` : `${hr}:${String(m).padStart(2, '0')} ${period}`;
}
function dateToLocalStr(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}
function slotColor(count: number, total: number): string {
  if (total === 0 || count === 0) return '#1e1e20';
  const ratio = count / total;
  if (ratio >= 1.0) return '#16a34a';
  if (ratio >= 0.75) return '#22c55e';
  if (ratio >= 0.5) return '#4ade80';
  if (ratio >= 0.25) return '#86efac';
  return '#bbf7d0';
}

// sv-SE locale reliably produces "YYYY-MM-DD HH:MM" — no formatToParts edge cases.
function slotToUTC(slotStr: string, pollTimezone: string): Date {
  // Treat the slot string as UTC to get an approximate timestamp, then compute
  // the real UTC time by measuring the poll-timezone offset at that moment.
  const guessMs = new Date(`${slotStr}:00.000Z`).getTime();
  const localStr = new Intl.DateTimeFormat('sv-SE', {
    timeZone: pollTimezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(guessMs)); // → "2026-03-24 09:30"
  const localMs = new Date(localStr.replace(' ', 'T') + ':00.000Z').getTime();
  return new Date(guessMs + (guessMs - localMs));
}
function formatTimeInTZ(date: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz,
  }).formatToParts(date);
  const hour = parts.find(p => p.type === 'hour')?.value ?? '';
  const minute = parts.find(p => p.type === 'minute')?.value ?? '';
  const dayperiod = parts.find(p => p.type === 'dayPeriod')?.value ?? '';
  return minute === '00' ? `${hour} ${dayperiod}` : `${hour}:${minute} ${dayperiod}`;
}
function formatDayInTZ(date: Date, tz: string): { day: string; date: string } {
  return {
    day: new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz }).format(date),
    date: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: tz }).format(date),
  };
}
function tzAbbr(tz: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date());
  return parts.find(p => p.type === 'timeZoneName')?.value ?? tz;
}

export default function PollGrid({ pollData, userId }: { pollData: PollData; userId: string }) {
  const router = useRouter();
  const [mySlots, setMySlots] = useState<Set<string>>(new Set(pollData.mySlots));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [slotCounts] = useState(pollData.slotCounts);
  const [showUserTZ, setShowUserTZ] = useState(false);
  const isDragging = useRef(false);
  const dragMode = useRef<'add' | 'remove'>('add');
  const isClosed = pollData.status !== 'collecting';

  const userTimezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  const isDifferentTZ = useMemo(() => {
    try {
      const ref = new Date(pollData.dateRangeStart);
      const opts: Intl.DateTimeFormatOptions = {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
      };
      return new Intl.DateTimeFormat('en-US', { ...opts, timeZone: pollData.timezone }).format(ref)
          !== new Intl.DateTimeFormat('en-US', { ...opts, timeZone: userTimezone }).format(ref);
    } catch {
      return pollData.timezone !== userTimezone;
    }
  }, [pollData.timezone, pollData.dateRangeStart, userTimezone]);

  // Build day + time arrays
  const days = useMemo(() => {
    const result: string[] = [];
    const s = new Date(pollData.dateRangeStart); s.setUTCHours(0, 0, 0, 0);
    const e = new Date(pollData.dateRangeEnd);   e.setUTCHours(0, 0, 0, 0);
    for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) result.push(dateToLocalStr(new Date(d)));
    return result;
  }, [pollData.dateRangeStart, pollData.dateRangeEnd]);

  const times = useMemo(() => {
    const result: string[] = [];
    const start = parseTime(pollData.dailyWindowStart);
    const end = parseTime(pollData.dailyWindowEnd);
    for (let m = start; m < end; m += 30) result.push(minutesToTime(m));
    return result;
  }, [pollData.dailyWindowStart, pollData.dailyWindowEnd]);

  const firstDay = days[0] ?? '2000-01-01';
  const windowStartMin = parseTime(pollData.dailyWindowStart);
  const windowEndMin = parseTime(pollData.dailyWindowEnd);

  function displayTimeLabel(time: string): string {
    if (!showUserTZ || !isDifferentTZ) return formatTimeDisplay(time);
    const utcDate = slotToUTC(`${firstDay}T${time}`, pollData.timezone);
    return formatTimeInTZ(utcDate, userTimezone);
  }

  function displayDayLabel(day: string): { day: string; date: string; isWeekend: boolean } {
    let dayStr: string, dateLabel: string;
    if (!showUserTZ || !isDifferentTZ) {
      const [y, mo, d] = day.split('-').map(Number);
      const dt = new Date(Date.UTC(y, mo - 1, d));
      dayStr = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(dt);
      dateLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(dt);
    } else {
      const midMin = Math.floor((windowStartMin + windowEndMin) / 2 / 30) * 30;
      const utcDate = slotToUTC(`${day}T${minutesToTime(midMin)}`, pollData.timezone);
      ({ day: dayStr, date: dateLabel } = formatDayInTZ(utcDate, userTimezone));
    }
    return { day: dayStr, date: dateLabel, isWeekend: dayStr === 'Sat' || dayStr === 'Sun' };
  }

  function slotTooltip(day: string, time: string, count: number): string {
    const pollLabel = formatTimeDisplay(time);
    if (!isDifferentTZ) return `${pollLabel} — ${count}/${pollData.totalMembers} available`;
    const utcDate = slotToUTC(`${day}T${time}`, pollData.timezone);
    const userLabel = formatTimeInTZ(utcDate, userTimezone);
    return `${pollLabel} ${tzAbbr(pollData.timezone)} · ${userLabel} ${tzAbbr(userTimezone)} — ${count}/${pollData.totalMembers} available`;
  }

  const toggleSlot = (slotKey: string) => {
    if (isClosed) return;
    setMySlots(prev => { const n = new Set(prev); n.has(slotKey) ? n.delete(slotKey) : n.add(slotKey); return n; });
    setSaved(false);
  };
  const handleMouseDown = (slotKey: string) => {
    if (isClosed) return;
    isDragging.current = true;
    dragMode.current = mySlots.has(slotKey) ? 'remove' : 'add';
    toggleSlot(slotKey);
  };
  const handleMouseEnter = (slotKey: string) => {
    if (!isDragging.current || isClosed) return;
    setMySlots(prev => { const n = new Set(prev); dragMode.current === 'add' ? n.add(slotKey) : n.delete(slotKey); return n; });
    setSaved(false);
  };
  useEffect(() => {
    const stop = () => { isDragging.current = false; };
    window.addEventListener('mouseup', stop);
    window.addEventListener('touchend', stop);
    return () => { window.removeEventListener('mouseup', stop); window.removeEventListener('touchend', stop); };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/poll/${pollData.pollId}/availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots: Array.from(mySlots) }),
      });
      if (res.ok) { setSaved(true); router.refresh(); }
    } finally { setSaving(false); }
  };

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '100%' }}>
      <style>{`
        .poll-slot { transition: filter 0.08s, background 0.08s; }
        .poll-slot:hover { filter: brightness(1.5); }
        .poll-slot.closed { cursor: default !important; }
        .poll-slot.closed:hover { filter: none; }
      `}</style>

      {/* Toolbar: voters + timezone */}
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 13, color: '#71717a' }}>
          <span style={{ color: '#a1a1aa' }}>{pollData.voters.length}</span>
          <span> / {pollData.totalMembers} players voted</span>
          {pollData.voters.length > 0 && (
            <span style={{ color: '#71717a' }}> · {pollData.voters.map(v => v.discordUsername).join(', ')}</span>
          )}
          {isClosed && (
            <span style={{ background: '#7c3aed', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11, marginLeft: 8, verticalAlign: 'middle' }}>
              Voting closed
            </span>
          )}
        </div>
        <div style={{ display: 'flex', background: '#27272a', borderRadius: 6, padding: 2, gap: 2, flexShrink: 0 }}>
          {[false, true].map(isUser => (
            <button
              key={String(isUser)}
              onClick={() => setShowUserTZ(isUser)}
              style={{
                background: showUserTZ === isUser ? '#3f3f46' : 'transparent',
                color: showUserTZ === isUser ? '#f4f4f5' : '#71717a',
                border: 'none', borderRadius: 4, padding: '4px 12px',
                fontSize: 12, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}
            >
              {isUser ? `My time (${tzAbbr(userTimezone)})` : tzAbbr(pollData.timezone)}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 16, fontSize: 12, color: '#71717a', flexWrap: 'wrap' }}>
        {[
          { color: '#2563eb', border: '1px solid #3b82f6', label: 'Your selection' },
          { color: '#16a34a', border: 'none', label: 'Everyone available' },
          { color: '#1e1e20', border: '1px solid #2e2e31', label: 'No one available' },
        ].map(({ color, border, label }) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 12, height: 12, background: color, border, display: 'inline-block', borderRadius: 3, flexShrink: 0 }} />
            {label}
          </span>
        ))}
      </div>

      {/* Grid */}
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div style={{
          display: 'flex',
          userSelect: 'none',
          minWidth: `${TIME_W + days.length * 32}px`,
        }}>

          {/* Time-label column */}
          <div style={{ width: TIME_W, flexShrink: 0 }}>
            {/* Header spacer */}
            <div style={{ height: HEADER_H }} />
            {times.map((t, i) => {
              const isHour = t.endsWith(':00');
              const gap = i === 0 ? 0 : isHour ? HOUR_GAP : HALF_GAP;
              return (
                <div
                  key={t}
                  style={{
                    height: CELL_H,
                    marginTop: gap,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    paddingRight: 10,
                    fontSize: 11,
                    color: isHour ? '#71717a' : 'transparent',
                    fontWeight: isHour ? 500 : 400,
                    letterSpacing: '0.01em',
                  }}
                >
                  {displayTimeLabel(t)}
                </div>
              );
            })}
          </div>

          {/* Day columns — flex:1 so they fill available space evenly */}
          {days.map(day => {
            const { day: dayLabel, date: dateLabel, isWeekend } = displayDayLabel(day);
            return (
              <div key={day} style={{ flex: 1, minWidth: 28, marginLeft: 3 }}>
                {/* Day header */}
                <div style={{
                  height: HEADER_H,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  paddingBottom: 8,
                  borderBottom: `2px solid ${isWeekend ? '#3b2a6b' : '#27272a'}`,
                  marginBottom: 0,
                }}>
                  <div style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: isWeekend ? '#a78bfa' : '#d4d4d8',
                    letterSpacing: '0.03em',
                  }}>
                    {dayLabel}
                  </div>
                  <div style={{ fontSize: 11, color: '#52525b', marginTop: 2 }}>
                    {dateLabel}
                  </div>
                </div>

                {/* Cells */}
                {times.map((time, i) => {
                  const slotKey = `${day}T${time}`;
                  const isMine = mySlots.has(slotKey);
                  const count = slotCounts[slotKey] ?? 0;
                  const isHour = time.endsWith(':00');
                  const gap = i === 0 ? 4 : isHour ? HOUR_GAP : HALF_GAP;

                  let bg: string;
                  let border: string;
                  if (isMine) {
                    bg = '#2563eb';
                    border = '1px solid #60a5fa';
                  } else {
                    bg = slotColor(count, pollData.totalMembers);
                    border = count > 0 ? 'none' : '1px solid #2e2e31';
                  }

                  return (
                    <div
                      key={slotKey}
                      className={`poll-slot${isClosed ? ' closed' : ''}`}
                      style={{
                        height: CELL_H,
                        marginTop: gap,
                        background: bg,
                        border,
                        borderRadius: 4,
                        cursor: isClosed ? 'default' : 'pointer',
                      }}
                      title={slotTooltip(day, time, count)}
                      onMouseDown={() => handleMouseDown(slotKey)}
                      onMouseEnter={() => handleMouseEnter(slotKey)}
                      onTouchStart={() => handleMouseDown(slotKey)}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {!isClosed && (
        <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              background: saving ? '#581c87' : '#7c3aed',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '10px 28px',
              fontSize: 14,
              fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
              letterSpacing: '0.01em',
            }}
          >
            {saving ? 'Saving…' : pollData.mySlots.length > 0 ? 'Update availability' : 'Save availability'}
          </button>
          {saved && <span style={{ color: '#4ade80', fontSize: 13, fontWeight: 500 }}>✓ Saved</span>}
          <span style={{ color: '#52525b', fontSize: 13 }}>
            {mySlots.size} slot{mySlots.size !== 1 ? 's' : ''} selected
          </span>
        </div>
      )}
    </div>
  );
}
