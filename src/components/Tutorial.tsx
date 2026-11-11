'use client';

import { useEffect, useState } from 'react';

type View = 'month' | 'week';

type Step = {
  title: string;
  /** One line shown under the title */
  text: string;
  /** CSS selectors, tried in order; the first visible match is highlighted */
  targets: string[];
  /** Switch to this view before showing the step */
  view?: View;
};

const CALENDAR = '[data-tour="calendar"]';
const ANY_EVENT = '[data-event-id]';

const STEPS: Step[] = [
  {
    title: '일정 추가',
    text: '빈 칸을 클릭하면 새 일정을 만들고, 여러 칸을 끌면 여러 날에 한 번에 넣습니다.',
    targets: [CALENDAR],
  },
  {
    title: '일정 수정 · 완료',
    text: '일정을 클릭하면 수정·삭제·복사를 하고, 앞의 체크박스로 완료 표시를 합니다.',
    targets: [ANY_EVENT, CALENDAR],
  },
  {
    title: '끌어서 옮기기',
    text: '일정을 끌어서 옮기고, 다른 일정 위에 놓으면 둘의 자리를 바꿉니다.',
    targets: [ANY_EVENT, CALENDAR],
  },
  {
    title: '끌어서 복사',
    text: '일정을 마우스 오른쪽 버튼으로 끌면 놓은 자리에 복사됩니다.',
    targets: [ANY_EVENT, CALENDAR],
  },
  {
    title: '월 / 주 화면',
    text: "'월'은 한 달 달력, '주'는 시간표 화면입니다.",
    targets: ['[data-tour="view"]'],
  },
  {
    title: '시간 늘리기',
    text: '주 화면에서 일정의 오른쪽 아래 모서리를 끌면 시간을 늘리거나 옆 날짜까지 채웁니다.',
    targets: ['[data-tour="resize-handle"]', CALENDAR],
    view: 'week',
  },
  {
    title: '날짜 이동',
    text: "◀ ▶ 로 이전·다음으로 넘기고, '오늘'을 누르면 오늘로 돌아옵니다.",
    targets: ['[data-tour="nav"]'],
  },
  {
    title: '여러 일정 한꺼번에',
    text: "'선택'에서 여러 일정을 골라 한꺼번에 지우거나 매주 반복으로 복사합니다.",
    targets: ['[data-tour="select"]'],
  },
  {
    title: '되돌리기',
    text: '방금 한 추가·이동·복사·삭제를 한 단계씩 되돌립니다. (Ctrl+Z / ⌘Z)',
    targets: ['[data-tour="undo"]'],
  },
  {
    title: '메모장',
    text: '메모를 쓰고, 별(★)을 누르면 달력 위에 띄워 둡니다. 다시 로그인해도 그대로 있습니다.',
    targets: ['[data-tour="menu"]'],
  },
  {
    title: '다시 보기',
    text: "이 안내는 '?' 버튼으로 언제든 다시 볼 수 있습니다.",
    targets: ['[data-tour="help"]'],
  },
];

type Props = {
  view: View;
  onViewChange: (view: View) => void;
  /** Finished or skipped */
  onClose: () => void;
};

type Box = {
  /** Highlighted area in viewport coordinates; null if no target is on screen */
  rect: { top: number; left: number; width: number; height: number } | null;
  vw: number;
  vh: number;
};

const CARD_W = 340;
const CARD_H_ESTIMATE = 210;
const GAP = 14;
const PAD = 6;

function findTarget(selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el;
    }
  }
  return null;
}

export default function Tutorial({ view, onViewChange, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;

  const goTo = (next: number) => {
    if (next < 0) return;
    if (next >= STEPS.length) {
      onClose();
      return;
    }
    const nextView = STEPS[next].view;
    if (nextView && nextView !== view) onViewChange(nextView);
    setIndex(next);
  };

  // Find and measure the highlighted element for the current step
  useEffect(() => {
    let cancelled = false;
    const measure = (scrollIntoView: boolean) => {
      if (cancelled) return;
      const el = findTarget(step.targets);
      if (el && scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const r = el?.getBoundingClientRect();
      setBox({
        rect: r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null,
        vw: window.innerWidth,
        vh: window.innerHeight,
      });
    };
    // The target can appear a moment later (e.g. right after switching 월/주)
    const frame = requestAnimationFrame(() => measure(true));
    const timer = setTimeout(() => measure(false), 250);
    const remeasure = () => measure(false);
    window.addEventListener('resize', remeasure);
    window.addEventListener('scroll', remeasure, true);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      window.removeEventListener('resize', remeasure);
      window.removeEventListener('scroll', remeasure, true);
    };
  }, [step, view]);

  // Keyboard: → / Enter next, ← back, Esc skip
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!['ArrowRight', 'ArrowLeft', 'Enter', 'Escape'].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      const next = e.key === 'ArrowLeft' ? index - 1 : index + 1;
      if (next < 0) return;
      if (next >= STEPS.length) {
        onClose();
        return;
      }
      const nextView = STEPS[next].view;
      if (nextView && nextView !== view) onViewChange(nextView);
      setIndex(next);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [index, view, onViewChange, onClose]);

  // Card position: under the target if there is room, else above it, else in the middle of it
  const rect = box?.rect ?? null;
  const cardStyle: React.CSSProperties = { width: CARD_W, maxWidth: 'calc(100vw - 32px)' };
  if (box && rect) {
    const left = Math.min(Math.max(rect.left + rect.width / 2 - CARD_W / 2, 16), Math.max(box.vw - CARD_W - 16, 16));
    cardStyle.left = left;
    if (rect.top + rect.height + GAP + CARD_H_ESTIMATE <= box.vh) {
      cardStyle.top = rect.top + rect.height + PAD + GAP;
    } else if (rect.top - GAP - CARD_H_ESTIMATE >= 0) {
      cardStyle.bottom = box.vh - rect.top + PAD + GAP;
    } else {
      cardStyle.top = Math.max(rect.top + rect.height / 2 - CARD_H_ESTIMATE / 2, 16);
    }
  } else {
    cardStyle.left = '50%';
    cardStyle.top = '50%';
    cardStyle.transform = 'translate(-50%, -50%)';
  }

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-label="사용 안내" data-tutorial>
      {/* Blocks clicks on the app while the tour is open; dims everything if nothing is highlighted */}
      <div className={`absolute inset-0 ${rect ? '' : 'bg-slate-950/70'}`} />

      {/* Spotlight: a clear window over the target, everything else dimmed by its shadow */}
      {rect && (
        <div
          className="pointer-events-none absolute rounded-lg border-2 border-primary transition-all duration-200"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.7)',
          }}
        />
      )}

      {/* Step card */}
      {box && (
        <div className="absolute rounded-xl border border-border bg-card p-4 shadow-2xl" style={cardStyle}>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-muted">{index + 1} / {STEPS.length}</span>
            <button onClick={onClose} className="text-xs text-muted hover:text-foreground">
              건너뛰기
            </button>
          </div>
          <div className="mb-1 text-base font-bold">{step.title}</div>
          <p className="mb-4 text-sm leading-relaxed text-foreground/90">{step.text}</p>
          <div className="flex items-center justify-end gap-2">
            {index > 0 && (
              <button
                onClick={() => goTo(index - 1)}
                className="rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:bg-card-hover"
              >
                이전
              </button>
            )}
            <button
              onClick={() => goTo(index + 1)}
              autoFocus
              className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
            >
              {isLast ? '완료' : '다음'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
