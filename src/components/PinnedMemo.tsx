'use client';

import { useState, useRef, useEffect } from 'react';
import { Memo } from '@/lib/supabase';

type Props = {
  memo: Memo;
  initialX?: number;
  initialY?: number;
  onClose: (memoId: string) => void;
};

const MIN_W = 160;
const MIN_H = 120;
const DEFAULT_W = 240;
const DEFAULT_H = 200;

export default function PinnedMemo({ memo, initialX = 100, initialY = 100, onClose }: Props) {
  const [pos, setPos] = useState({ x: initialX, y: initialY });
  const [size, setSize] = useState({ w: DEFAULT_W, h: DEFAULT_H });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

  useEffect(() => {
    if (!isDragging) return;

    const onMove = (e: MouseEvent) => {
      setPos({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y,
      });
    };
    const onUp = () => setIsDragging(false);

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [isDragging]);

  useEffect(() => {
    if (!isResizing) return;

    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - resizeStart.current.x;
      const dy = e.clientY - resizeStart.current.y;
      setSize({
        w: Math.max(MIN_W, resizeStart.current.w + dx),
        h: Math.max(MIN_H, resizeStart.current.h + dy),
      });
    };
    const onUp = () => setIsResizing(false);

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [isResizing]);

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    setIsDragging(true);
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeStart.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h };
    setIsResizing(true);
  };

  const fontSize = Math.max(11, Math.min(16, Math.floor(size.w / 18)));
  const titleSize = Math.max(12, Math.min(18, Math.floor(size.w / 14)));

  return (
    <div
      className="fixed z-30 flex flex-col overflow-hidden rounded-lg shadow-xl"
      style={{
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: size.h,
        backgroundColor: memo.color + '20',
        border: `2px solid ${memo.color}`,
        cursor: isDragging ? 'grabbing' : 'default',
        userSelect: isDragging || isResizing ? 'none' : 'auto',
      }}
    >
      {/* Title bar - draggable */}
      <div
        className="flex shrink-0 items-center justify-between px-2 py-1.5"
        style={{
          backgroundColor: memo.color,
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
        onMouseDown={handleDragStart}
      >
        <span
          className="truncate font-medium text-white"
          style={{ fontSize: titleSize }}
        >
          {memo.title}
        </span>
        <button
          onClick={() => onClose(memo.id)}
          onMouseDown={(e) => e.stopPropagation()}
          className="ml-1 shrink-0 rounded p-0.5 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div
        className="flex-1 overflow-y-auto whitespace-pre-wrap p-2"
        style={{
          fontSize,
          color: '#e2e8f0',
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
        }}
      >
        {memo.content || '내용 없음'}
      </div>

      {/* Resize handle */}
      <div
        className="absolute bottom-0 right-0 cursor-se-resize"
        style={{ width: 16, height: 16 }}
        onMouseDown={handleResizeStart}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          className="absolute bottom-0.5 right-0.5"
          style={{ opacity: 0.5 }}
        >
          <path d="M11 1v10H1" fill="none" stroke="#94a3b8" strokeWidth="1.5" />
          <path d="M11 5v6H5" fill="none" stroke="#94a3b8" strokeWidth="1.5" />
        </svg>
      </div>
    </div>
  );
}
