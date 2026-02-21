'use client';

import { useState } from 'react';
import { Event } from '@/lib/supabase';

const COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
];

type Props = {
  event: Partial<Event> | null;
  date: string;
  onSave: (event: Partial<Event>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
};

function getInitialEndTime(event: Partial<Event> | null) {
  if (event?.id) return event.end_time || '';
  if (event?.end_time) return event.end_time;
  if (event?.start_time) {
    return `${String(Number(event.start_time.split(':')[0]) + 1).padStart(2, '0')}:00`;
  }
  return '';
}

export default function EventModal({ event, date, onSave, onDelete, onClose }: Props) {
  const [title, setTitle] = useState(event?.id ? event.title || '' : '');
  const [description, setDescription] = useState(event?.id ? event.description || '' : '');
  const [startTime, setStartTime] = useState(event?.start_time || '');
  const [endTime, setEndTime] = useState(getInitialEndTime(event));
  const [color, setColor] = useState(event?.color || COLORS[0]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      ...(event?.id ? { id: event.id } : {}),
      title: title.trim(),
      description: description.trim() || null,
      date,
      start_time: startTime || null,
      end_time: endTime || null,
      color,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl"
      >
        <h2 className="mb-4 text-lg font-bold">
          {event?.id ? '일정 수정' : '새 일정'}
        </h2>

        <div className="mb-3">
          <input
            type="text"
            placeholder="일정 제목"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground outline-none focus:border-primary"
            autoFocus
            required
          />
        </div>

        <div className="mb-3">
          <textarea
            placeholder="설명 (선택)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-lg border border-border bg-background px-4 py-2.5 text-foreground outline-none focus:border-primary"
          />
        </div>

        <div className="mb-3 flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-muted">시작 시간</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-primary"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs text-muted">종료 시간</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="mb-5">
          <label className="mb-2 block text-xs text-muted">색상</label>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
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
            className="rounded-lg bg-primary px-4 py-2 text-sm text-white transition-colors hover:bg-primary-hover"
          >
            {event?.id ? '수정' : '추가'}
          </button>
        </div>
      </form>
    </div>
  );
}
