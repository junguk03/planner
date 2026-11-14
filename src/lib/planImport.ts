// "계획 가져오기": turns a pasted/loaded JSON plan into events and memos to insert.
//
// Expected shape:
// {
//   "events": [{ "title": "PortSwigger", "date": "2026-12-21",
//                "start_time": "09:00", "end_time": "12:00",      // both optional → all-day
//                "description": "...", "color": "#3b82f6" }],      // optional
//   "memos":  [{ "title": "...", "content": "...", "color": "#3b82f6" }]
// }

import { toMin } from './time';

export const PLAN_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
];

export const MAX_PLAN_EVENTS = 2000;
export const MAX_PLAN_MEMOS = 50;
// Same limits as the event and memo forms
const MAX_TITLE = 200;
const MAX_DESCRIPTION = 2000;
const MAX_MEMO_CONTENT = 5000;

export type PlanEvent = {
  title: string;
  description: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  color: string;
};

export type PlanMemo = { title: string; content: string; color: string };

export type ParsedPlan = {
  events: PlanEvent[];
  memos: PlanMemo[];
  /** Human-readable problems; the plan can only be imported when this is empty */
  errors: string[];
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function validDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00');
  // Rejects things like 2027-02-30 (which Date would roll over to March)
  return !Number.isNaN(d.getTime()) && d.getMonth() + 1 === Number(s.slice(5, 7)) && d.getDate() === Number(s.slice(8, 10));
}

/** "HH:MM" with a real hour/minute; `allow24` permits the end-of-day "24:00" */
function validTime(s: unknown, allow24: boolean): s is string {
  if (typeof s !== 'string' || !/^\d{2}:\d{2}$/.test(s)) return false;
  if (allow24 && s === '24:00') return true;
  return Number(s.slice(0, 2)) <= 23 && Number(s.slice(3, 5)) <= 59;
}

const colorOf = (v: unknown) => (typeof v === 'string' && PLAN_COLORS.includes(v) ? v : PLAN_COLORS[0]);

export function parsePlan(text: string): ParsedPlan {
  const result: ParsedPlan = { events: [], memos: [], errors: [] };
  if (!text.trim()) return result;

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    result.errors.push('내용을 읽을 수 없습니다. 계획 파일의 내용 전체를 그대로 붙여넣었는지 확인해 주세요.');
    return result;
  }
  if (!isRecord(data)) {
    result.errors.push('계획 파일 형식이 아닙니다.');
    return result;
  }

  const rawEvents = data.events ?? [];
  const rawMemos = data.memos ?? [];
  if (!Array.isArray(rawEvents) || !Array.isArray(rawMemos)) {
    result.errors.push('계획 파일 형식이 아닙니다. (events, memos는 목록이어야 합니다)');
    return result;
  }
  if (rawEvents.length > MAX_PLAN_EVENTS) {
    result.errors.push(`일정이 너무 많습니다. 한 번에 최대 ${MAX_PLAN_EVENTS}개까지 가져올 수 있습니다.`);
    return result;
  }
  if (rawMemos.length > MAX_PLAN_MEMOS) {
    result.errors.push(`메모가 너무 많습니다. 한 번에 최대 ${MAX_PLAN_MEMOS}개까지 가져올 수 있습니다.`);
    return result;
  }

  rawEvents.forEach((raw, i) => {
    const where = `일정 ${i + 1}번째`;
    if (!isRecord(raw)) return void result.errors.push(`${where}: 형식이 올바르지 않습니다.`);
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    if (!title || title.length > MAX_TITLE) return void result.errors.push(`${where}: 제목은 1~${MAX_TITLE}자여야 합니다.`);
    if (!validDate(raw.date)) return void result.errors.push(`${where} "${title}": 날짜가 올바르지 않습니다. (예: 2026-12-21)`);

    const start = raw.start_time ?? null;
    const end = raw.end_time ?? null;
    if (start !== null && !validTime(start, false)) return void result.errors.push(`${where} "${title}": 시작 시간이 올바르지 않습니다. (예: 09:00)`);
    if (end !== null && !validTime(end, true)) return void result.errors.push(`${where} "${title}": 종료 시간이 올바르지 않습니다. (예: 12:00)`);
    if (end !== null && start === null) return void result.errors.push(`${where} "${title}": 종료 시간만 있고 시작 시간이 없습니다.`);
    if (start !== null && end !== null && toMin(end) <= toMin(start)) {
      return void result.errors.push(`${where} "${title}": 종료 시간이 시작 시간보다 늦어야 합니다.`);
    }

    const description = typeof raw.description === 'string' ? raw.description.trim() : '';
    if (description.length > MAX_DESCRIPTION) return void result.errors.push(`${where} "${title}": 설명은 ${MAX_DESCRIPTION}자까지입니다.`);

    result.events.push({
      title,
      description: description || null,
      date: raw.date,
      start_time: start,
      end_time: end,
      color: colorOf(raw.color),
    });
  });

  rawMemos.forEach((raw, i) => {
    const where = `메모 ${i + 1}번째`;
    if (!isRecord(raw)) return void result.errors.push(`${where}: 형식이 올바르지 않습니다.`);
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    if (!title || title.length > MAX_TITLE) return void result.errors.push(`${where}: 제목은 1~${MAX_TITLE}자여야 합니다.`);
    const content = typeof raw.content === 'string' ? raw.content : '';
    if (content.length > MAX_MEMO_CONTENT) return void result.errors.push(`${where} "${title}": 내용은 ${MAX_MEMO_CONTENT}자까지입니다.`);
    result.memos.push({ title, content, color: colorOf(raw.color) });
  });

  return result;
}
