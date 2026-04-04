'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
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
  voters: { discordUserId: string; discordUsername: string; slots: string[] }[];
  mySlots: string[];
  slotCounts: Record<string, number>;
}

const CELL_H = 32;
const HEADER_H = 52;
const HOUR_GAP = 6;
const HALF_GAP = 2;
const TIME_W = 60;
const TOUCH_MOVE_THRESHOLD = 10; // px — beyond this, it's a scroll in scroll mode

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

function slotColor(count: number, totalVoters: number): string {
  if (totalVoters === 0 || count === 0) return '#1e1e20';
  const ratio = count / totalVoters;
  if (ratio >= 1.0) return '#15803d';
  if (ratio >= 0.75) return '#166534';
  if (ratio >= 0.5) return '#1a5c34';
  if (ratio >= 0.25) return '#1e4d35';
  return '#1a3a2a';
}

function mySlotColor(selected: boolean): string {
  return selected ? '#2563eb' : '#1e1e20';
}

function slotToUTC(slotStr: string, pollTimezone: string): Date {
  const guessMs = new Date(`${slotStr}:00.000Z`).getTime();
  const localStr = new Intl.DateTimeFormat('sv-SE', {
    timeZone: pollTimezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(guessMs));
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

function getSlotFromPoint(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y);
  return el?.getAttribute('data-slot') ?? null;
}

type ViewMode = 'mine' | 'group';
type TouchMode = 'select' | 'scroll';

export default function PollGrid({ pollData, userId }: { pollData: PollData; userId: string }) {
  const router = useRouter();
  const [mySlots, setMySlots] = useState<Set<string>>(new Set(pollData.mySlots));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [slotCounts] = useState(pollData.slotCounts);
  const [showUserTZ, setShowUserTZ] = useState(false);
  const [hoveredVoter, setHoveredVoter] = useState<string | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);
  const isDragging = useRef(false);
  const dragMode = useRef<'add' | 'remove'>('add');
  const isClosed = pollData.status !== 'collecting';

  const hasSaved = pollData.mySlots.length > 0;
  const [viewMode, setViewMode] = useState<ViewMode>(hasSaved ? 'group' : 'mine');

  // Touch mode state
  const [touchMode, setTouchMode] = useState<TouchMode>('select');
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Touch tracking refs
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const touchStartSlot = useRef<string | null>(null);
  const touchMoved = useRef(false);
  const lastTouchSlot = useRef<string | null>(null);
  const isTwoFingerGesture = useRef(false);
  const twoFingerStart = useRef<{ x: number; y: number; scrollLeft: number; pageScrollY: number } | null>(null);

  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

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

  const voterSlotSets = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const v of pollData.voters) {
      map[v.discordUserId] = new Set(v.slots);
    }
    return map;
  }, [pollData.voters]);

  const totalVoters = pollData.voters.length;
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
    if (!isDifferentTZ) return `${pollLabel} — ${count}/${totalVoters} available`;
    const utcDate = slotToUTC(`${day}T${time}`, pollData.timezone);
    const userLabel = formatTimeInTZ(utcDate, userTimezone);
    return `${pollLabel} ${tzAbbr(pollData.timezone)} · ${userLabel} ${tzAbbr(userTimezone)} — ${count}/${totalVoters} available`;
  }

  // ── Slot manipulation ──────────────────────────────────────────────────

  const applySlot = useCallback((slotKey: string, mode: 'add' | 'remove') => {
    if (isClosed) return;
    setMySlots(prev => {
      const n = new Set(prev);
      mode === 'add' ? n.add(slotKey) : n.delete(slotKey);
      return n;
    });
    setSaved(false);
  }, [isClosed]);

  const toggleSlot = useCallback((slotKey: string) => {
    if (isClosed) return;
    setMySlots(prev => { const n = new Set(prev); n.has(slotKey) ? n.delete(slotKey) : n.add(slotKey); return n; });
    setSaved(false);
  }, [isClosed]);

  // ── Mouse handlers (desktop only) ─────────────────────────────────────

  const handleMouseDown = (slotKey: string) => {
    if (isClosed) return;
    isDragging.current = true;
    dragMode.current = mySlots.has(slotKey) ? 'remove' : 'add';
    toggleSlot(slotKey);
  };
  const handleMouseEnter = (slotKey: string) => {
    if (!isDragging.current || isClosed) return;
    applySlot(slotKey, dragMode.current);
  };

  useEffect(() => {
    const stop = () => { isDragging.current = false; };
    window.addEventListener('mouseup', stop);
    return () => { window.removeEventListener('mouseup', stop); };
  }, []);

  // ── Touch handlers ────────────────────────────────────────────────────

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isClosed) return;

    if (touchMode === 'select') {
      if (e.touches.length >= 2) {
        // Two-finger: manual scroll (both axes)
        isTwoFingerGesture.current = true;
        isDragging.current = false;
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const container = scrollContainerRef.current;
        twoFingerStart.current = {
          x: midX,
          y: midY,
          scrollLeft: container?.scrollLeft ?? 0,
          pageScrollY: window.scrollY,
        };
        return;
      }

      // Single finger in select mode: start drag-select
      const touch = e.touches[0];
      const slot = getSlotFromPoint(touch.clientX, touch.clientY);
      if (!slot) return;

      e.preventDefault(); // Prevent scroll in select mode
      isTwoFingerGesture.current = false;
      isDragging.current = true;
      dragMode.current = mySlots.has(slot) ? 'remove' : 'add';
      lastTouchSlot.current = slot;
      toggleSlot(slot);
    } else {
      // Scroll mode: record start position, don't toggle yet
      const touch = e.touches[0];
      touchStartPos.current = { x: touch.clientX, y: touch.clientY };
      touchStartSlot.current = getSlotFromPoint(touch.clientX, touch.clientY);
      touchMoved.current = false;
    }
  }, [isClosed, touchMode, mySlots, toggleSlot]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (isClosed) return;

    if (touchMode === 'select') {
      if (isTwoFingerGesture.current || e.touches.length >= 2) {
        // Manual two-finger scroll (both axes)
        isTwoFingerGesture.current = true;
        isDragging.current = false;
        if (e.touches.length >= 2 && twoFingerStart.current) {
          const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          const container = scrollContainerRef.current;
          if (container) {
            container.scrollLeft = twoFingerStart.current.scrollLeft - (midX - twoFingerStart.current.x);
          }
          window.scrollTo(0, twoFingerStart.current.pageScrollY - (midY - twoFingerStart.current.y));
        }
        return;
      }

      if (!isDragging.current) return;
      e.preventDefault();

      const touch = e.touches[0];
      const slot = getSlotFromPoint(touch.clientX, touch.clientY);
      if (slot && slot !== lastTouchSlot.current) {
        lastTouchSlot.current = slot;
        applySlot(slot, dragMode.current);
      }
    } else {
      // Scroll mode: check if finger moved enough to be a scroll
      if (!touchStartPos.current) return;
      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - touchStartPos.current.x);
      const dy = Math.abs(touch.clientY - touchStartPos.current.y);
      if (dx > TOUCH_MOVE_THRESHOLD || dy > TOUCH_MOVE_THRESHOLD) {
        touchMoved.current = true;
      }
    }
  }, [isClosed, touchMode, applySlot]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchMode === 'select') {
      isDragging.current = false;
      lastTouchSlot.current = null;
      isTwoFingerGesture.current = false;
      twoFingerStart.current = null;
    } else {
      // Scroll mode: if finger didn't move, it's a tap → toggle
      if (!touchMoved.current && touchStartSlot.current) {
        toggleSlot(touchStartSlot.current);
      }
      touchStartPos.current = null;
      touchStartSlot.current = null;
      touchMoved.current = false;
    }
  }, [touchMode, toggleSlot]);

  // ── Save ──────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/poll/${pollData.pollId}/availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots: Array.from(mySlots) }),
      });
      if (res.ok) { setSaved(true); setViewMode('group'); router.refresh(); }
    } finally { setSaving(false); }
  };

  // ── Derived state ─────────────────────────────────────────────────────

  const hoveredSlotVoters = useMemo(() => {
    if (!hoveredSlot) return null;
    const available = new Set<string>();
    const unavailable = new Set<string>();
    for (const v of pollData.voters) {
      if (voterSlotSets[v.discordUserId]?.has(hoveredSlot)) {
        available.add(v.discordUserId);
      } else {
        unavailable.add(v.discordUserId);
      }
    }
    return { available, unavailable };
  }, [hoveredSlot, pollData.voters, voterSlotSets]);

  function getCellStyle(slotKey: string, isMine: boolean): { bg: string; border: string; opacity: number } {
    const count = slotCounts[slotKey] ?? 0;

    if (hoveredVoter) {
      const isVoterSlot = voterSlotSets[hoveredVoter]?.has(slotKey);
      if (isVoterSlot) {
        return { bg: '#2563eb', border: '1px solid #60a5fa', opacity: 1 };
      }
      return { bg: '#1e1e20', border: '1px solid #2e2e31', opacity: 0.3 };
    }

    if (viewMode === 'mine') {
      return {
        bg: mySlotColor(isMine),
        border: isMine ? '1px solid #60a5fa' : '1px solid #2e2e31',
        opacity: 1,
      };
    }

    const wasSaved = pollData.mySlots.includes(slotKey);
    const effectiveCount = isMine && !wasSaved ? count + 1 : !isMine && wasSaved ? count - 1 : count;
    const bg = slotColor(effectiveCount, totalVoters);
    const border = effectiveCount > 0 ? '1px solid rgba(255,255,255,0.05)' : '1px solid #2e2e31';
    return { bg, border, opacity: 1 };
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '100%' }}>
      <style>{`
        .poll-slot { transition: filter 0.08s, background 0.08s; }
        .poll-slot:hover { filter: brightness(1.3); }
        .poll-slot.closed { cursor: default !important; }
        .poll-slot.closed:hover { filter: none; }
      `}</style>

      {/* Toolbar */}
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 13, color: '#71717a', lineHeight: 1.6 }}>
          <span style={{ color: '#a1a1aa' }}>{pollData.voters.length}</span>
          <span> / {pollData.totalMembers} voted</span>
          {pollData.voters.length > 0 && (
            <span> · {pollData.voters.map((v, i) => {
              const isAvailable = hoveredSlotVoters?.available.has(v.discordUserId);
              const isUnavailable = hoveredSlotVoters?.unavailable.has(v.discordUserId);
              const isHoveredName = hoveredVoter === v.discordUserId;

              let color = '#a1a1aa';
              let textDecoration = 'none';
              let fontWeight: number = 400;
              let nameOpacity = 1;

              if (hoveredSlotVoters) {
                if (isAvailable) {
                  color = '#4ade80';
                  fontWeight = 600;
                } else if (isUnavailable) {
                  color = '#52525b';
                  textDecoration = 'line-through';
                  nameOpacity = 0.6;
                }
              } else if (isHoveredName) {
                color = '#e2e8f0';
                textDecoration = 'underline';
              }

              return (
                <span key={v.discordUserId}>
                  {i > 0 && ', '}
                  <span
                    onMouseEnter={() => setHoveredVoter(v.discordUserId)}
                    onMouseLeave={() => setHoveredVoter(null)}
                    style={{
                      color,
                      cursor: 'pointer',
                      textDecoration,
                      fontWeight,
                      opacity: nameOpacity,
                      transition: 'all 0.15s',
                    }}
                  >
                    {v.discordUsername}
                  </span>
                </span>
              );
            })}</span>
          )}
          {isClosed && (
            <span style={{ background: '#7c3aed', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11, marginLeft: 8, verticalAlign: 'middle' }}>
              Voting closed
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0, flexWrap: 'wrap' }}>
          {/* Touch mode toggle (mobile only) */}
          {isTouchDevice && !isClosed && (
            <div style={{ display: 'flex', background: '#27272a', borderRadius: 6, padding: 2, gap: 2, marginRight: 8 }}>
              {([['select', '✏️ Select'], ['scroll', '↔️ Scroll']] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setTouchMode(mode)}
                  style={{
                    background: touchMode === mode ? '#3f3f46' : 'transparent',
                    color: touchMode === mode ? '#f4f4f5' : '#71717a',
                    border: 'none', borderRadius: 4, padding: '4px 10px',
                    fontSize: 12, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {/* View mode toggle */}
          {hasSaved && (
            <div style={{ display: 'flex', background: '#27272a', borderRadius: 6, padding: 2, gap: 2, marginRight: 8 }}>
              {([['mine', 'Just me'], ['group', 'Group']] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  style={{
                    background: viewMode === mode ? '#3f3f46' : 'transparent',
                    color: viewMode === mode ? '#f4f4f5' : '#71717a',
                    border: 'none', borderRadius: 4, padding: '4px 12px',
                    fontSize: 12, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {/* Timezone toggle */}
          <div style={{ display: 'flex', background: '#27272a', borderRadius: 6, padding: 2, gap: 2 }}>
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
      </div>

      {/* Legend */}
      {viewMode === 'group' && hasSaved && (
        <div style={{ display: 'flex', gap: 20, marginBottom: 16, fontSize: 12, color: '#71717a', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 12, height: 12, background: '#15803d', display: 'inline-block', borderRadius: 3, flexShrink: 0 }} />
            All voters available
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 12, height: 12, background: '#1a3a2a', display: 'inline-block', borderRadius: 3, flexShrink: 0 }} />
            Some available
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 12, height: 12, background: '#1e1e20', border: '1px solid #2e2e31', display: 'inline-block', borderRadius: 3, flexShrink: 0 }} />
            No one
          </span>
        </div>
      )}

      {/* Grid */}
      <div
        ref={scrollContainerRef}
        style={{
          overflowX: 'auto',
          WebkitOverflowScrolling: touchMode === 'scroll' ? 'touch' : undefined,
          touchAction: touchMode === 'select' ? 'none' : 'pan-x pan-y',
        }}
        onMouseLeave={() => setHoveredSlot(null)}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div style={{
          display: 'flex',
          userSelect: 'none',
          minWidth: `${TIME_W + days.length * 32}px`,
        }}>

          {/* Time-label column */}
          <div style={{ width: TIME_W, flexShrink: 0 }}>
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

          {/* Day columns */}
          {days.map((day, dayIdx) => {
            const { day: dayLabel, date: dateLabel, isWeekend } = displayDayLabel(day);
            const isWeekStart = dayLabel === 'Sun' && dayIdx > 0;
            return (
              <div key={day} style={{ flex: 1, minWidth: 38, marginLeft: isWeekStart ? 10 : 3 }}>
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

                {times.map((time, i) => {
                  const slotKey = `${day}T${time}`;
                  const isMine = mySlots.has(slotKey);
                  const isHour = time.endsWith(':00');
                  const gap = i === 0 ? 4 : isHour ? HOUR_GAP : HALF_GAP;

                  const { bg, border, opacity } = getCellStyle(slotKey, isMine);

                  const count = slotCounts[slotKey] ?? 0;
                  const availableVoters = pollData.voters
                    .filter(v => voterSlotSets[v.discordUserId]?.has(slotKey))
                    .map(v => v.discordUsername);
                  const tooltipLines = [slotTooltip(day, time, count)];
                  if (viewMode === 'group' && availableVoters.length > 0) {
                    tooltipLines.push('Available: ' + availableVoters.join(', '));
                  }

                  return (
                    <div
                      key={slotKey}
                      data-slot={slotKey}
                      className={`poll-slot${isClosed ? ' closed' : ''}`}
                      style={{
                        height: CELL_H,
                        marginTop: gap,
                        background: bg,
                        border,
                        borderRadius: 4,
                        cursor: isClosed ? 'default' : 'pointer',
                        opacity,
                        transition: 'opacity 0.15s, background 0.08s',
                      }}
                      title={tooltipLines.join('\n')}
                      onMouseDown={() => handleMouseDown(slotKey)}
                      onMouseEnter={() => { handleMouseEnter(slotKey); setHoveredSlot(slotKey); }}
                      onMouseLeave={() => setHoveredSlot(null)}
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
