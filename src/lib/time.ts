import type { Event } from './supabase';

// Shared date/time helpers. Times are "HH:MM" (the DB may return "HH:MM:SS");
// an end time of "24:00" means the end of the day.

export const DAY_MIN = 24 * 60;

const pad = (n: number) => String(n).padStart(2, '0');

export function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function fromMin(min: number): string {
  const c = Math.max(0, Math.min(DAY_MIN, Math.round(min)));
  return `${pad(Math.floor(c / 60))}:${pad(c % 60)}`;
}

/** "09:00:00" → "09:00", null → "" */
export function hhmm(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : '';
}

export function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDate(s: string): Date {
  return new Date(s + 'T00:00:00');
}

/** Every date from `a` to `b` inclusive, in either order. */
export function datesBetween(a: string, b: string): string[] {
  const [from, to] = a <= b ? [a, b] : [b, a];
  const out: string[] = [];
  const cursor = parseDate(from);
  const last = parseDate(to);
  while (cursor <= last) {
    out.push(fmtDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

type Timed = { start_time: string | null; end_time: string | null };
export type Slot = Timed & { date: string };

/** [start, end) in minutes. Events without an end count as one hour. null = all-day. */
export function timeRange(e: Timed): [number, number] | null {
  if (!e.start_time) return null;
  const start = toMin(e.start_time);
  let end = e.end_time ? toMin(e.end_time) : start + 60;
  if (end <= start) end = start + 60;
  return [start, Math.min(end, DAY_MIN)];
}

/** First event in `pool` on the same date whose time overlaps `candidate` (ignoring itself). */
export function findTimeConflict(
  candidate: Slot & { id?: string },
  pool: Event[],
  ignoreIds: string[] = [],
): Event | null {
  const range = timeRange(candidate);
  if (!range) return null;
  for (const other of pool) {
    if (other.date !== candidate.date) continue;
    if (candidate.id && other.id === candidate.id) continue;
    if (ignoreIds.includes(other.id)) continue;
    const otherRange = timeRange(other);
    if (!otherRange) continue;
    if (range[0] < otherRange[1] && range[1] > otherRange[0]) return other;
  }
  return null;
}

/**
 * Times for an event moved to start at `newStart`, keeping its length.
 * `newStart === null` makes it all-day. Returns null if it would run past 24:00.
 */
export function placeAt(e: Timed, newStart: string | null): Timed | null {
  if (newStart === null) return { start_time: null, end_time: null };
  const start = toMin(newStart);
  if (start >= DAY_MIN) return null;
  // All-day event dropped onto a time: give it one hour
  if (!e.start_time) {
    return { start_time: fromMin(start), end_time: fromMin(Math.min(start + 60, DAY_MIN)) };
  }
  if (!e.end_time) return { start_time: fromMin(start), end_time: null };
  const duration = toMin(e.end_time) - toMin(e.start_time);
  const end = start + (duration > 0 ? duration : 60);
  if (end > DAY_MIN) return null;
  return { start_time: fromMin(start), end_time: fromMin(end) };
}

/**
 * New slots when two events trade places. Each takes the other's date and start
 * but keeps its own length. If that makes the two overlap each other (same day,
 * different lengths), the later one is pushed to start right after the earlier one.
 * Returns null if either would run past 24:00.
 */
export function swapPlacement(a: Slot, b: Slot): [Slot, Slot] | null {
  const aTimes = placeAt(a, b.start_time);
  const bTimes = placeAt(b, a.start_time);
  if (!aTimes || !bTimes) return null;
  let aNew: Slot = { date: b.date, ...aTimes };
  let bNew: Slot = { date: a.date, ...bTimes };

  if (aNew.date === bNew.date) {
    const ra = timeRange(aNew);
    const rb = timeRange(bNew);
    if (ra && rb && ra[0] < rb[1] && rb[0] < ra[1]) {
      if (ra[0] <= rb[0]) {
        const pushed = placeAt(bNew, fromMin(ra[1]));
        if (!pushed) return null;
        bNew = { date: bNew.date, ...pushed };
      } else {
        const pushed = placeAt(aNew, fromMin(rb[1]));
        if (!pushed) return null;
        aNew = { date: aNew.date, ...pushed };
      }
    }
  }
  return [aNew, bNew];
}

export function sameSlot(x: Slot, y: Slot): boolean {
  return x.date === y.date && hhmm(x.start_time) === hhmm(y.start_time) && hhmm(x.end_time) === hhmm(y.end_time);
}

/**
 * Side-by-side columns for timed events of one day, so overlapping events
 * stay visible instead of stacking on top of each other.
 */
export function layoutColumns(events: Event[]): Map<string, { col: number; cols: number }> {
  const result = new Map<string, { col: number; cols: number }>();
  const timed = events
    .map((ev) => ({ ev, range: timeRange(ev) }))
    .filter((x): x is { ev: Event; range: [number, number] } => x.range !== null)
    .sort((x, y) => x.range[0] - y.range[0] || x.range[1] - y.range[1]);

  let cluster: { id: string; col: number }[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    for (const item of cluster) result.set(item.id, { col: item.col, cols: columnEnds.length });
    cluster = [];
    columnEnds = [];
  };

  for (const { ev, range } of timed) {
    if (range[0] >= clusterEnd) flush();
    let col = columnEnds.findIndex((end) => end <= range[0]);
    if (col === -1) {
      col = columnEnds.length;
      columnEnds.push(range[1]);
    } else {
      columnEnds[col] = range[1];
    }
    cluster.push({ id: ev.id, col });
    clusterEnd = Math.max(clusterEnd, range[1]);
  }
  flush();
  return result;
}
