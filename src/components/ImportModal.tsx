'use client';

import { useEffect, useMemo, useState } from 'react';
import { parsePlan, ParsedPlan } from '@/lib/planImport';
import { useBackdropClose } from '@/lib/useBackdropClose';

type Props = {
  /** Inserts the plan. Resolves to true when done (the window then closes). */
  onImport: (plan: ParsedPlan) => Promise<boolean>;
  onClose: () => void;
};

const MAX_FILE_BYTES = 2_000_000;

export default function ImportModal({ onImport, onClose }: Props) {
  const [text, setText] = useState('');
  const [fileError, setFileError] = useState('');
  const [importing, setImporting] = useState(false);
  const backdrop = useBackdropClose(onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const plan = useMemo(() => parsePlan(text), [text]);
  const dates = plan.events.map((e) => e.date).sort();
  const nothing = plan.events.length === 0 && plan.memos.length === 0;
  const canImport = !nothing && plan.errors.length === 0 && !importing;

  const loadFile = async (file: File | undefined) => {
    setFileError('');
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setFileError('파일이 너무 큽니다.');
      return;
    }
    setText(await file.text());
  };

  const handleImport = async () => {
    if (!canImport) return;
    setImporting(true);
    try {
      await onImport(plan);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" {...backdrop}>
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-xl bg-card p-6 shadow-2xl">
        <h2 className="mb-1 text-lg font-bold">계획 가져오기</h2>
        <p className="mb-4 text-sm text-muted">
          계획 파일(.json)을 고르거나 내용을 붙여넣으면, 그 안의 일정과 메모를 한꺼번에 넣습니다.
        </p>

        <label className="mb-3 flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-border py-3 text-sm text-muted transition-colors hover:bg-card-hover hover:text-foreground">
          파일 선택
          <input
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              void loadFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="또는 계획 파일의 내용을 여기에 붙여넣으세요"
          aria-label="계획 내용"
          spellCheck={false}
          className="mb-3 h-36 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus:border-primary"
        />

        {fileError && <div className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{fileError}</div>}

        {plan.errors.length > 0 && (
          <div className="mb-3 max-h-32 overflow-y-auto rounded-lg border border-danger/50 bg-danger/10 px-3 py-2 text-sm text-danger">
            <div className="font-medium">가져올 수 없습니다 (문제 {plan.errors.length}개)</div>
            <ul className="mt-1 list-disc pl-5 text-xs">
              {plan.errors.slice(0, 5).map((err, i) => (
                <li key={i}>{err}</li>
              ))}
              {plan.errors.length > 5 && <li>… 외 {plan.errors.length - 5}개</li>}
            </ul>
          </div>
        )}

        {!nothing && plan.errors.length === 0 && (
          <div className="mb-3 rounded-lg bg-success/10 px-3 py-2 text-sm text-success" data-import-summary>
            일정 {plan.events.length}개
            {dates.length > 0 && ` (${dates[0]} ~ ${dates[dates.length - 1]})`}
            , 메모 {plan.memos.length}개를 넣습니다. 이미 있거나 시간이 겹치는 일정은 건너뜁니다.
          </div>
        )}

        <div className="mt-auto flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-muted transition-colors hover:bg-card-hover"
          >
            취소
          </button>
          <button
            onClick={handleImport}
            disabled={!canImport}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {importing ? '가져오는 중...' : '가져오기'}
          </button>
        </div>
      </div>
    </div>
  );
}
