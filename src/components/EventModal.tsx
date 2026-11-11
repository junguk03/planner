'use client';

import { useState, useEffect } from 'react';
import { Event } from '@/lib/supabase';
import { DAY_MIN, findTimeConflict, fromMin, hhmm, toMin } from '@/lib/time';
import { useBackdropClose } from '@/lib/useBackdropClose';

const COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
];

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
// An event may end at 24:00 (end of day)
const END_HOURS = [...HOURS, '24'];
const MINUTE_STEP = 5;
const MINUTE_OPTIONS = Array.from(
  { length: 60 / MINUTE_STEP },
  (_, i) => String(i * MINUTE_STEP).padStart(2, '0'),
);

function getHour(t: string) {
  return t ? t.split(':')[0] : '';
}
function getMinute(t: string) {
  return t ? t.split(':')[1] : '';
}
function minuteOptionsFor(current: string) {
  if (!current || MINUTE_OPTIONS.includes(current)) return MINUTE_OPTIONS;
  return [...MINUTE_OPTIONS, current].sort();
}

type Props = {
  event: Partial<Event> | null;
  date: string;
  multiDates?: string[];
  existingEvents: Event[];
  /** Shown above the form, e.g. why the modal opened after a drag */
  notice?: string;
  onSave: (event: Partial<Event>) => Promise<void> | void;
  onDelete: (id: string) => void;
  onCopyMode?: (event: Event) => void;
  onClose: () => void;
};

function getInitialEndTime(event: Partial<Event> | null) {
  if (event?.end_time) return hhmm(event.end_time);
  if (event?.id) return '';
  if (event?.start_time) return fromMin(Math.min(toMin(event.start_time) + 60, DAY_MIN));
  return '';
}

export default function EventModal({ event, date, multiDates, existingEvents, notice, onSave, onDelete, onCopyMode, onClose }: Props) {
  const [title, setTitle] = useState(event?.id ? event.title || '' : '');
  const [description, setDescription] = useState(event?.id ? event.description || '' : '');
  const [startTime, setStartTime] = useState(hhmm(event?.start_time));
  const [endTime, setEndTime] = useState(getInitialEndTime(event));
  const [color, setColor] = useState(event?.color || COLORS[0]);
  const [saving, setSaving] = useState(false);
  const backdrop = useBackdropClose(onClose);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const targetDates = multiDates && multiDates.length > 1 ? multiDates : [date];

  const endBeforeStart = !!startTime && !!endTime && toMin(endTime) <= toMin(startTime);

  // Live conflict check against every date this event will be saved on
  let conflict: Event | null = null;
  if (startTime && !endBeforeStart) {
    for (const d of targetDates) {
      conflict = findTimeConflict(
        { id: event?.id, date: d, start_time: startTime, end_time: endTime || null },
        existingEvents,
      );
      if (conflict) break;
    }
  }

  // An already-saved event whose date/time is untouched can still be edited
  // (title, color, ...) even if it overlaps something — only new overlaps are blocked.
  const stored = event?.id ? existingEvents.find((e) => e.id === event.id) : undefined;
  const timeUntouched =
    !!stored &&
    stored.date === date &&
    hhmm(stored.start_time) === startTime &&
    hhmm(stored.end_time) === endTime;
  const blocked = !timeUntouched && (endBeforeStart || !!conflict);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || saving || blocked) return;

    setSaving(true);
    try {
      await onSave({
        ...(event?.id ? { id: event.id } : {}),
        title: title.trim(),
        description: description.trim() || null,
        date,
        start_time: startTime || null,
        end_time: startTime ? endTime || null : null,
        color,
      });
    } finally {
      setSaving(false);
    }
  };

  // Picking "--" for the hour clears the time (an event without a start is all-day)
  const changeStart = (hour: string, minute: string) => {
    if (!hour) {
      setStartTime('');
      setEndTime('');
      return;
    }
    const next = `${hour}:${minute || '00'}`;
    const nextMin = toMin(next);
    if (!startTime && !endTime) {
      // First time a start is chosen: default to one hour
      setEndTime(fromMin(Math.min(nextMin + 60, DAY_MIN)));
    } else if (startTime && endTime) {
      // Changing the start moves the whole event: the end follows, keeping the length
      const length = toMin(endTime) - toMin(startTime);
      setEndTime(fromMin(Math.min(nextMin + (length > 0 ? length : 60), DAY_MIN)));
    }
    setStartTime(next);
  };

  const changeEnd = (hour: string, minute: string) => {
    if (!hour) {
      setEndTime('');
      return;
    }
    setEndTime(hour === '24' ? '24:00' : `${hour}:${minute || '00'}`);
  };

  const selectClass =
    'flex-1 rounded-lg border border-border bg-background px-2 py-2 text-foreground outline-none focus:border-primary disabled:opacity-40';

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50" {...backdrop}>
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl"
      >
        <h2 className="mb-1 text-lg font-bold">
          {event?.id ? '일정 수정' : '새 일정'}
          <span className="ml-2 text-sm font-normal text-muted">{date.slice(5).replace('-', '/')}</span>
        </h2>
        {notice && (
          <div className="mb-3 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">{notice}</div>
        )}
        {multiDates && multiDates.length > 1 && (
          <div className="mb-3 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
            {multiDates.length}개 날짜에 동시 추가 ({multiDates[0].slice(5)} ~ {multiDates[multiDates.length - 1].slice(5)})
          </div>
        )}

        <div className="mb-3">
          <input
            type="text"
            placeholder="일정 제목"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground outline-none focus:border-primary"
            autoFocus
            required
            maxLength={200}
          />
        </div>

        <div className="mb-3">
          <textarea
            placeholder="설명 (선택)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            maxLength={2000}
            className="w-full resize-none rounded-lg border border-border bg-background px-4 py-2.5 text-foreground outline-none focus:border-primary"
          />
        </div>

        <div className="mb-3 flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-muted">시작 시간</label>
            <div className="flex items-center gap-2">
              <select
                aria-label="시작 시"
                value={getHour(startTime)}
                onChange={(e) => changeStart(e.target.value, getMinute(startTime))}
                className={selectClass}
              >
                <option value="">--</option>
                {HOURS.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
              <span className="text-muted">:</span>
              <select
                aria-label="시작 분"
                value={getMinute(startTime)}
                onChange={(e) => changeStart(getHour(startTime), e.target.value)}
                disabled={!startTime}
                className={selectClass}
              >
                {!startTime && <option value="">--</option>}
                {minuteOptionsFor(getMinute(startTime)).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs text-muted">종료 시간</label>
            <div className="flex items-center gap-2">
              <select
                aria-label="종료 시"
                value={getHour(endTime)}
                onChange={(e) => changeEnd(e.target.value, getMinute(endTime))}
                disabled={!startTime}
                className={selectClass}
              >
                <option value="">--</option>
                {END_HOURS.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
              <span className="text-muted">:</span>
              <select
                aria-label="종료 분"
                value={getMinute(endTime)}
                onChange={(e) => changeEnd(getHour(endTime), e.target.value)}
                disabled={!endTime || getHour(endTime) === '24'}
                className={selectClass}
              >
                {!endTime && <option value="">--</option>}
                {minuteOptionsFor(getMinute(endTime)).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        {!startTime && (
          <div className="mb-3 text-xs text-muted">시작 시간을 비워 두면 종일 일정으로 저장됩니다.</div>
        )}

        {endBeforeStart && (
          <div className="mb-3 rounded-lg border border-danger/50 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
            종료 시간은 시작 시간보다 늦어야 합니다
          </div>
        )}

        {/* Conflict warning */}
        {conflict && (
          <div className="mb-3 rounded-lg border border-danger/50 bg-danger/10 px-4 py-3">
            <div className="text-sm font-medium text-danger">시간이 겹칩니다</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-foreground">
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: conflict.color }} />
              <span className="font-medium">{conflict.title}</span>
              <span className="text-muted">
                {targetDates.length > 1 && `${conflict.date.slice(5).replace('-', '/')} `}
                {hhmm(conflict.start_time)}{conflict.end_time ? ` - ${hhmm(conflict.end_time)}` : ''}
              </span>
              <span className="text-muted">에 이미 일정이 있습니다</span>
            </div>
          </div>
        )}

        <div className="mb-5">
          <label className="mb-2 block text-xs text-muted">색상</label>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`색상 ${c}`}
                onClick={() => setColor(c)}
                className="h-7 w-7 rounded-full transition-transform"
                style={{
                  backgroundColor: c,
                  transform: color === c ? 'scale(1.3)' : 'scale(1)',
                  outline: color === c ? '2px solid white' : 'none',
                  outlineOffset: '2px',
                }}
              />
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          {event?.id && (
            <button
              type="button"
              onClick={() => onDelete(event.id!)}
              className="rounded-lg bg-danger/20 px-4 py-2 text-sm text-danger transition-colors hover:bg-danger/30"
            >
              삭제
            </button>
          )}
          {event?.id && onCopyMode && (
            <button
              type="button"
              onClick={() => onCopyMode(event as Event)}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted transition-colors hover:bg-card-hover hover:text-foreground"
            >
              복사
            </button>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-muted transition-colors hover:bg-card-hover"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={saving || blocked}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {event?.id ? '수정' : '추가'}
          </button>
        </div>
      </form>
    </div>
  );
}
