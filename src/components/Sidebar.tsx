'use client';

import { useState } from 'react';
import { Memo } from '@/lib/supabase';

type Props = {
  open: boolean;
  onClose: () => void;
  memos: Memo[];
  onCreateMemo: () => void;
  onEditMemo: (memo: Memo) => void;
  onDeleteMemo: (id: string) => void;
  onPinMemo: (memo: Memo) => void;
  pinnedMemoIds: string[];
  onLogout: () => void;
};

export default function Sidebar({
  open,
  onClose,
  memos,
  onCreateMemo,
  onEditMemo,
  onDeleteMemo,
  onPinMemo,
  pinnedMemoIds,
  onLogout,
}: Props) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed left-0 top-0 z-50 flex h-full w-80 flex-col bg-card shadow-2xl transition-transform duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-bold">메모장</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-card-hover hover:text-foreground"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Create button */}
        <div className="px-4 py-3">
          <button
            onClick={onCreateMemo}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            새 메모
          </button>
        </div>

        {/* Memo list */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {memos.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted">
              메모가 없습니다
            </div>
          ) : (
            <div className="space-y-2">
              {memos.map((memo) => {
                const isPinned = pinnedMemoIds.includes(memo.id);
                return (
                  <div
                    key={memo.id}
                    className="group rounded-lg border border-border/50 p-3 transition-colors hover:bg-card-hover"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div
                        className="min-w-0 flex-1 cursor-pointer"
                        onClick={() => onEditMemo(memo)}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: memo.color }}
                          />
                          <div className="truncate text-sm font-medium">
                            {memo.title || '제목 없음'}
                          </div>
                        </div>
                        <div className="mt-1 line-clamp-2 text-xs text-muted">
                          {memo.content || '내용 없음'}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => onPinMemo(memo)}
                          className={`rounded p-1 text-xs transition-colors ${
                            isPinned
                              ? 'text-primary'
                              : 'text-muted opacity-0 group-hover:opacity-100 hover:text-foreground'
                          }`}
                          title={isPinned ? '핀 해제' : '캘린더에 띄우기'}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill={isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                            <path d="M12 2l3 9h9l-7 5 3 9-8-6-8 6 3-9-7-5h9z" />
                          </svg>
                        </button>
                        {confirmDelete === memo.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                onDeleteMemo(memo.id);
                                setConfirmDelete(null);
                              }}
                              className="rounded px-1.5 py-0.5 text-xs text-danger hover:bg-danger/20"
                            >
                              삭제
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="rounded px-1.5 py-0.5 text-xs text-muted hover:bg-card-hover"
                            >
                              취소
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(memo.id)}
                            className="rounded p-1 text-xs text-muted opacity-0 transition-colors group-hover:opacity-100 hover:text-danger"
                            title="삭제"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Logout */}
        <div className="border-t border-border px-4 py-3">
          <button
            onClick={onLogout}
            className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm text-muted transition-colors hover:bg-card-hover hover:text-danger"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            로그아웃
          </button>
        </div>
      </div>
    </>
  );
}
