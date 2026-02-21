'use client';

import { useState } from 'react';
import { Memo } from '@/lib/supabase';

const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

type Props = {
  memo: Partial<Memo> | null;
  onSave: (data: Partial<Memo>) => void;
  onClose: () => void;
};

export default function MemoModal({ memo, onSave, onClose }: Props) {
  const [title, setTitle] = useState(memo?.title || '');
  const [content, setContent] = useState(memo?.content || '');
  const [color, setColor] = useState(memo?.color || '#3b82f6');

  const handleSave = () => {
    if (!title.trim() && !content.trim()) return;
    onSave({
      ...memo,
      title: title.trim() || '제목 없음',
      content,
      color,
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-bold">
          {memo?.id ? '메모 수정' : '새 메모'}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-muted">제목</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              placeholder="메모 제목"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-muted">내용</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="h-40 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              placeholder="메모 내용을 입력하세요..."
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-muted">색상</label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full transition-transform ${
                    color === c ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-card' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-muted transition-colors hover:bg-card-hover"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
