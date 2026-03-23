'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
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

function formatDayDisplay(dateStr: string): { day: string; date: string } {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d));
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(date);
  const dateLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date);
  return { day, date: dateLabel };
}

function dateToLocalStr(date: Date): string {
  const y = date.getUTCFullYear();
  const mo = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

function slotColor(count: number, total: number): string {
  if (total === 0 || count === 0) return '#2a2a2a';
  const ratio = count / total;
  if (ratio >= 1.0) return '#16a34a';
  if (ratio >= 0.75) return '#22c55e';
  if (ratio >= 0.5) return '#86efac';
  if (ratio >= 0.25) return '#bbf7d0';
  return '#dcfce7';
}

export default function PollGrid({
  pollData,
  userId,
}: {
  pollData: PollData;
  userId: string;
}) {
  const router = useRouter();
  const [mySlots, setMySlots] = useState<Set<string>>(new Set(pollData.mySlots));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [slotCounts, setSlotCounts] = useState(pollData.slotCounts);
  const isDragging = useRef(false);
  const dragMode = useRef<'add' | 'remove'>('add');

  const isClosed = pollData.status !== 'collecting';

  // Generate columns (days) and rows (time slots)
  const days: string[] = [];
  const start = new Date(pollData.dateRangeStart);
  const end = new Date(pollData.dateRangeEnd);
  start.setUTCHours(0, 0, 0, 0);
  end.setUTCHours(0, 0, 0, 0);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(dateToLocalStr(new Date(d)));
  }

  const windowStartMin = parseTime(pollData.dailyWindowStart);
  const windowEndMin = parseTime(pollData.dailyWindowEnd);
  const times: string[] = [];
  for (let m = windowStartMin; m < windowEndMin; m += 30) {
    times.push(minutesToTime(m));
  }

  const toggleSlot = (slotKey: string) => {
    if (isClosed) return;
    setMySlots(prev => {
      const next = new Set(prev);
      if (next.has(slotKey)) {
        next.delete(slotKey);
      } else {
        next.add(slotKey);
      }
      return next;
    });
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
    setMySlots(prev => {
      const next = new Set(prev);
      if (dragMode.current === 'add') next.add(slotKey);
      else next.delete(slotKey);
      return next;
    });
    setSaved(false);
  };

  useEffect(() => {
    const stop = () => { isDragging.current = false; };
    window.addEventListener('mouseup', stop);
    window.addEventListener('touchend', stop);
    return () => {
      window.removeEventListener('mouseup', stop);
      window.removeEventListener('touchend', stop);
    };
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
    } finally {
      setSaving(false);
    }
  };

  const hasVoted = pollData.mySlots.length > 0;

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '100%', overflowX: 'auto' }}>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 14, color: '#888' }}>
          {pollData.voters.length} / {pollData.totalMembers} players voted
          {pollData.voters.length > 0 && ': '}
          {pollData.voters.map(v => v.discordUsername).join(', ')}
        </div>
        {isClosed && (
          <span style={{ background: '#7c3aed', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>
            Voting closed
          </span>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 12, color: '#aaa', flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 14, height: 14, background: '#1d4ed8', display: 'inline-block', borderRadius: 2 }} />
          Your selection
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 14, height: 14, background: '#16a34a', display: 'inline-block', borderRadius: 2 }} />
          Everyone available
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 14, height: 14, background: '#2a2a2a', border: '1px solid #444', display: 'inline-block', borderRadius: 2 }} />
          No one available
        </span>
      </div>

      <div style={{ display: 'flex', userSelect: 'none' }}>
        {/* Time labels column */}
        <div style={{ display: 'flex', flexDirection: 'column', marginRight: 4 }}>
          <div style={{ height: 44 }} />
          {times.map(t => (
            <div key={t} style={{ height: 28, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontSize: 11, color: '#666', paddingRight: 4, minWidth: 50 }}>
              {t.endsWith(':00') ? formatTimeDisplay(t) : ''}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map(day => {
          const { day: dayLabel, date: dateLabel } = formatDayDisplay(day);
          return (
            <div key={day} style={{ flex: 'none', marginRight: 2 }}>
              <div style={{ height: 44, textAlign: 'center', fontSize: 12, color: '#ccc', lineHeight: 1.3, paddingBottom: 4 }}>
                <div style={{ fontWeight: 600 }}>{dayLabel}</div>
                <div style={{ color: '#888' }}>{dateLabel}</div>
              </div>
              {times.map(time => {
                const slotKey = `${day}T${time}`;
                const isMine = mySlots.has(slotKey);
                const count = slotCounts[slotKey] ?? 0;
                const bg = isMine ? '#1d4ed8' : slotColor(count, pollData.totalMembers);
                const border = isMine ? '1px solid #3b82f6' : '1px solid #333';
                return (
                  <div
                    key={slotKey}
                    style={{
                      width: 36,
                      height: 28,
                      background: bg,
                      border,
                      borderRadius: 2,
                      marginBottom: 1,
                      cursor: isClosed ? 'default' : 'pointer',
                      transition: 'background 0.1s',
                      position: 'relative',
                    }}
                    title={`${formatTimeDisplay(time)} — ${count}/${pollData.totalMembers} available`}
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

      {!isClosed && (
        <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              background: '#7c3aed',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '10px 24px',
              fontSize: 15,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving...' : hasVoted ? 'Update availability' : 'Save availability'}
          </button>
          {saved && <span style={{ color: '#22c55e', fontSize: 14 }}>✓ Saved!</span>}
          <span style={{ color: '#666', fontSize: 13 }}>
            {mySlots.size} slot{mySlots.size !== 1 ? 's' : ''} selected
          </span>
        </div>
      )}
    </div>
  );
}
