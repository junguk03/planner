'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, openedFromRecoveryLink, Event, Memo } from '@/lib/supabase';
import {
  datesBetween,
  findTimeConflict,
  fmtDate,
  fromMin,
  hhmm,
  parseDate,
  placeAt,
  sameSlot,
  swapPlacement,
  timeRange,
} from '@/lib/time';
import Login from '@/components/Login';
import MonthView from '@/components/MonthView';
import WeekView from '@/components/WeekView';
import EventModal from '@/components/EventModal';
import Sidebar from '@/components/Sidebar';
import MemoModal from '@/components/MemoModal';
import PinnedMemo from '@/components/PinnedMemo';
import SelectMode from '@/components/SelectMode';
import Tutorial from '@/components/Tutorial';
import {
  ACCOUNT_PINS_KEY,
  ACCOUNT_TUTORIAL_KEY,
  MAX_ACCOUNT_PINS,
  PinLayout,
  loadPins,
  markTutorialSeen,
  pinsPending,
  readAccountState,
  samePins,
  savePins,
  setPinsPending,
  tutorialSeen,
} from '@/lib/localState';

type ViewMode = 'month' | 'week';

/**
 * How to reverse one user action. Everything the action changed is listed so
 * "되돌리기" can put it back in one step.
 */
type UndoEntry = {
  /** Shown to the user, e.g. "일정 이동" */
  label: string;
  /** Rows the action changed → put these fields back */
  restore?: { id: string; patch: Partial<Event> }[];
  /** Rows the action created → delete them */
  remove?: string[];
  /** Rows the action deleted → create them again */
  reinsert?: Event[];
};

const MAX_UNDO = 30;
const DEFAULT_PIN = { w: 240, h: 200 };

const slotOf = (e: Event) => ({ date: e.date, start_time: e.start_time, end_time: e.end_time });

type ModalState = {
  open: boolean;
  event: Partial<Event> | null;
  date: string;
  /** Explains why the modal opened (e.g. a drag landed on an occupied time) */
  notice?: string;
};
const CLOSED_MODAL: ModalState = { open: false, event: null, date: '' };

type NewEvent = Pick<Event, 'user_id' | 'title' | 'description' | 'date' | 'start_time' | 'end_time' | 'color'>;

const MAX_REPEAT_DAYS = 366;

const conflictText = (c: Event) =>
  `${c.date.slice(5).replace('-', '/')} ${hhmm(c.start_time)}${c.end_time ? `-${hhmm(c.end_time)}` : ''} "${c.title}"`;

export default function Home() {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  // Arrived from a password-reset email: ask for a new password before showing the app
  const [recovery, setRecovery] = useState(openedFromRecoveryLink);
  const [view, setView] = useState<ViewMode>('month');
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState(new Date().getDate());
  const [events, setEvents] = useState<Event[]>([]);
  const [modal, setModal] = useState<ModalState>(CLOSED_MODAL);

  // Sidebar & Memo state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [memoModal, setMemoModal] = useState<{
    open: boolean;
    memo: Partial<Memo> | null;
  }>({ open: false, memo: null });
  // Memos pinned on the calendar (with position/size). Saved with the account, so they
  // are the same on every device the user logs in on.
  const [pins, setPins] = useState<PinLayout[]>([]);
  // The account `pins` was loaded for — nothing is saved until this matches the signed-in user
  const [pinsOwner, setPinsOwner] = useState<string | null>(null);
  const localLoadedFor = useRef<string | null>(null);
  // True while this device has pin changes the account doesn't have yet
  const pinsDirty = useRef(false);
  // Counts pin changes, so a finished save knows whether a newer change is still waiting
  const pinsVersion = useRef(0);
  const [selectModeOpen, setSelectModeOpen] = useState(false);
  const [multiDates, setMultiDates] = useState<string[]>([]);

  // Undo history (this session only), newest last
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [undoing, setUndoing] = useState(false);
  const pushUndo = (entry: UndoEntry) => setUndoStack((prev) => [...prev.slice(-(MAX_UNDO - 1)), entry]);

  // Guided tour of the features
  const [tourOpen, setTourOpen] = useState(false);
  const tourReturnView = useRef<ViewMode>('month');

  // Click-to-paste mode (triggered from EventModal "복사" button)
  const [clickPasteSource, setClickPasteSource] = useState<Event | null>(null);

  // Short message at the top of the screen (errors, "시간이 겹칩니다", copy results)
  const [notice, setNotice] = useState<{ text: string; kind: 'error' | 'info' } | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((text: string, kind: 'error' | 'info' = 'error') => {
    setNotice({ text, kind });
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 5000);
  }, []);

  /** Reports a failed DB call. Returns true if there was an error. */
  const failed = (error: { message: string } | null, action: string) => {
    if (!error) return false;
    console.error(`${action} failed:`, error);
    notify(`${action}에 실패했습니다. 잠시 후 다시 시도해 주세요.`);
    return true;
  };

  // Check auth
  useEffect(() => {
    const signedIn = (u: { id: string; email?: string; user_metadata?: unknown }) => {
      setUser((prev) => (prev?.id === u.id ? prev : { id: u.id, email: u.email ?? '' }));
      // First time we see this account in this page load: restore its pinned memos,
      // and show the tutorial if it has never been seen.
      if (localLoadedFor.current !== u.id) {
        localLoadedFor.current = u.id;
        const account = readAccountState(u.user_metadata);
        const local = loadPins(u.id);
        // This browser's copy wins (and is uploaded) if it has changes that never reached
        // the account — the page was closed right after moving a pin, or the pins were
        // made before account sync existed.
        const localIsNewer = pinsPending(u.id) || (account.pins === null && local.length > 0);
        pinsDirty.current = localIsNewer;
        setPins(localIsNewer ? local : account.pins ?? local);
        setPinsOwner(u.id);
        if (!account.tutorialSeen && !tutorialSeen(u.id)) setTourOpen(true);

        // The session kept in this browser can be hours old. Ask the server for the
        // account as it is now, in case pins were changed on another device since.
        // (Deferred: auth calls must not run inside the auth-state callback.)
        setTimeout(async () => {
          const { data } = await supabase.auth.getUser();
          if (!data.user || localLoadedFor.current !== data.user.id || pinsDirty.current) return;
          const fresh = readAccountState(data.user.user_metadata);
          if (fresh.pins) {
            const freshPins = fresh.pins;
            setPins((prev) => (samePins(prev, freshPins) ? prev : freshPins));
          }
          if (fresh.tutorialSeen && !tutorialSeen(data.user.id)) {
            markTutorialSeen(data.user.id);
            setTourOpen(false);
          }
        }, 0);
      }
    };
    const signedOut = () => {
      localLoadedFor.current = null;
      pinsDirty.current = false;
      setUser(null);
      setPinsOwner(null);
      setPins([]);
      setUndoStack([]);
    };

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        if (openedFromRecoveryLink) sessionStorage.setItem('activeSession', 'true');
        const remembered = localStorage.getItem('rememberMe') === 'true';
        const activeSession = sessionStorage.getItem('activeSession') === 'true';
        if (!remembered && !activeSession) {
          // Not remembered and no active session → sign out
          await supabase.auth.signOut();
          setLoading(false);
          return;
        }
        signedIn(session.user);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        sessionStorage.setItem('activeSession', 'true');
        setRecovery(true);
      }
      if (session?.user) {
        signedIn(session.user);
      } else {
        signedOut();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Auto date update: check every minute if date changed
  const todayRef = useRef(new Date().getDate());
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      if (now.getDate() !== todayRef.current) {
        todayRef.current = now.getDate();
        setYear(now.getFullYear());
        setMonth(now.getMonth());
        setSelectedDay(now.getDate());
      }
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  // Fetch events. Only the newest request may update the list, so a slow response
  // for a month we already left (or from before a local change) can't overwrite it.
  const fetchSeq = useRef(0);
  const fetchEvents = useCallback(async () => {
    if (!user) return;
    const seq = ++fetchSeq.current;

    const fetchStart = new Date(year, month, 1);
    fetchStart.setDate(fetchStart.getDate() - 7);
    const fetchEnd = new Date(year, month + 1, 0);
    fetchEnd.setDate(fetchEnd.getDate() + 7);

    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', fmtDate(fetchStart))
      .lte('date', fmtDate(fetchEnd))
      .order('date')
      .order('start_time');

    if (seq !== fetchSeq.current) return;
    if (!error && data) {
      setEvents(data);
    }
  }, [user, year, month]);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  /** Apply a change to the list right away; the refetch after the DB call confirms it. */
  const applyLocal = (update: (prev: Event[]) => Event[]) => {
    fetchSeq.current++;
    setEvents(update);
  };

  // Realtime: listen for event changes (one subscription per user, not per month)
  const fetchEventsRef = useRef(fetchEvents);
  useEffect(() => {
    fetchEventsRef.current = fetchEvents;
  }, [fetchEvents]);
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`events-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `user_id=eq.${userId}` }, () => {
        void fetchEventsRef.current();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId]);

  // Remember pinned memos (only once this account's saved pins have been loaded):
  // in this browser right away, and with the account shortly after a change.
  useEffect(() => {
    if (!userId || pinsOwner !== userId) return;
    savePins(userId, pins);
    if (!pinsDirty.current) return;
    setPinsPending(userId, true);
    const version = pinsVersion.current;
    const timer = setTimeout(async () => {
      const { error } = await supabase.auth.updateUser({
        data: { [ACCOUNT_PINS_KEY]: pins.slice(0, MAX_ACCOUNT_PINS) },
      });
      if (error) {
        // Still saved (and marked pending) in this browser; retried on the next change or visit
        console.error('saving pinned memos to the account failed:', error);
        return;
      }
      // Only "all sent" if nothing changed while this save was on its way
      if (pinsVersion.current === version) {
        pinsDirty.current = false;
        setPinsPending(userId, false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [pins, pinsOwner, userId]);

  // Fetch memos
  const fetchMemos = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('memos')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (!error && data) {
      setMemos(data);
    }
  }, [user]);

  useEffect(() => {
    void fetchMemos();
  }, [fetchMemos]);

  // Navigation
  const goToday = () => {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth());
    setSelectedDay(now.getDate());
  };

  const shiftMonth = (delta: number) => {
    const target = new Date(year, month + delta, 1);
    const daysInTarget = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    setYear(target.getFullYear());
    setMonth(target.getMonth());
    // Keep the week-view anchor inside the month (e.g. the 31st → a 30-day month)
    setSelectedDay(Math.min(selectedDay, daysInTarget));
  };

  const shiftWeek = (delta: number) => {
    const d = new Date(year, month, selectedDay + delta * 7);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
    setSelectedDay(d.getDate());
  };

  const goPrev = () => (view === 'month' ? shiftMonth(-1) : shiftWeek(-1));
  const goNext = () => (view === 'month' ? shiftMonth(1) : shiftWeek(1));

  const closeModal = () => {
    setModal(CLOSED_MODAL);
    setMultiDates([]);
  };

  // Event CRUD
  const saveEvent = async (eventData: Partial<Event>) => {
    if (!user) return;

    const fields = {
      title: eventData.title,
      description: eventData.description,
      start_time: eventData.start_time,
      end_time: eventData.end_time,
      color: eventData.color,
    };

    if (eventData.id) {
      const before = events.find((e) => e.id === eventData.id);
      const { error } = await supabase
        .from('events')
        .update({ ...fields, date: eventData.date })
        .eq('id', eventData.id)
        .eq('user_id', user.id);
      if (failed(error, '일정 저장')) return;
      if (before) {
        pushUndo({
          label: '일정 수정',
          restore: [{
            id: before.id,
            patch: {
              title: before.title,
              description: before.description,
              color: before.color,
              ...slotOf(before),
            },
          }],
        });
      }
    } else {
      const dates = multiDates.length > 1 ? multiDates : [eventData.date!];
      // Block if any target date already has an overlapping event
      for (const date of dates) {
        const conflict = findTimeConflict(
          { date, start_time: eventData.start_time ?? null, end_time: eventData.end_time ?? null },
          events,
        );
        if (conflict) {
          notify(`시간이 겹쳐서 추가하지 않았습니다: ${conflictText(conflict)}`);
          return;
        }
      }
      const { data, error } = await supabase
        .from('events')
        .insert(dates.map((date) => ({ user_id: user.id, ...fields, date })))
        .select('id');
      if (failed(error, '일정 저장')) return;
      pushCreated(data, dates.length > 1 ? `일정 ${dates.length}개 추가` : '일정 추가');
    }

    closeModal();
    fetchEvents();
  };

  /** Record newly created rows so they can be undone (needs the ids the DB gave them). */
  const pushCreated = (rows: { id: string }[] | null, label: string) => {
    if (rows && rows.length > 0) pushUndo({ label, remove: rows.map((r) => r.id) });
  };

  const deleteEvent = async (id: string) => {
    if (!user) return;
    const before = events.find((e) => e.id === id);
    closeModal();
    applyLocal((prev) => prev.filter((e) => e.id !== id));
    const { error } = await supabase.from('events').delete().eq('id', id).eq('user_id', user.id);
    if (!failed(error, '일정 삭제') && before) pushUndo({ label: '일정 삭제', reinsert: [before] });
    fetchEvents();
  };

  const toggleDone = async (eventId: string) => {
    if (!user) return;
    const event = events.find((e) => e.id === eventId);
    if (!event) return;
    applyLocal((prev) => prev.map((e) => (e.id === eventId ? { ...e, done: !event.done } : e)));
    const { error } = await supabase
      .from('events')
      .update({ done: !event.done })
      .eq('id', eventId)
      .eq('user_id', user.id);
    failed(error, '완료 표시');
    fetchEvents();
  };

  /**
   * Copy an event to another date. newStartTime: undefined keeps its time,
   * null makes the copy all-day, "HH:MM" moves it there (same length).
   * Returns false if nothing was copied (overlap, past midnight, DB error).
   */
  const copyEvent = async (event: Event, newDate: string, newStartTime?: string | null): Promise<boolean> => {
    if (!user) return false;

    const times =
      newStartTime === undefined
        ? { start_time: event.start_time, end_time: event.end_time }
        : placeAt(event, newStartTime);
    if (!times) {
      notify('자정(24:00)을 넘어가서 복사할 수 없습니다.');
      return false;
    }
    const conflict = findTimeConflict({ date: newDate, ...times }, events);
    if (conflict) {
      notify(`시간이 겹쳐서 복사하지 않았습니다: ${conflictText(conflict)}`);
      return false;
    }

    const { data, error } = await supabase
      .from('events')
      .insert({
        user_id: user.id,
        title: event.title,
        description: event.description,
        date: newDate,
        ...times,
        color: event.color,
      })
      .select('id');
    if (failed(error, '일정 복사')) return false;
    pushCreated(data, '일정 복사');
    fetchEvents();
    return true;
  };

  /**
   * Move an event by drag. newStartTime: undefined keeps its time (month view),
   * null makes it all-day (all-day row), "HH:MM" moves it there (same length).
   * If the new time overlaps another event nothing is saved; the edit modal opens
   * on the new position so the user can adjust the time or cancel.
   */
  const moveEvent = async (eventId: string, newDate: string, newStartTime?: string | null) => {
    if (!user) return;
    const event = events.find((e) => e.id === eventId);
    if (!event) return;

    const times =
      newStartTime === undefined
        ? { start_time: event.start_time, end_time: event.end_time }
        : placeAt(event, newStartTime);
    if (!times) {
      notify('자정(24:00)을 넘어가서 옮길 수 없습니다.');
      return;
    }
    const target = { date: newDate, ...times };
    if (sameSlot(event, target)) return;

    const moved: Event = { ...event, ...target };
    if (findTimeConflict(moved, events)) {
      setMultiDates([]);
      setModal({
        open: true,
        event: moved,
        date: newDate,
        notice: '옮기려는 시간에 다른 일정이 있습니다. 시간을 바꿔서 저장하거나 취소하세요. (취소하면 원래 자리에 그대로 있습니다)',
      });
      return;
    }

    applyLocal((prev) => prev.map((e) => (e.id === eventId ? moved : e)));
    const { error } = await supabase.from('events').update(target).eq('id', eventId).eq('user_id', user.id);
    if (!failed(error, '일정 이동')) {
      pushUndo({ label: '일정 이동', restore: [{ id: event.id, patch: slotOf(event) }] });
    }
    fetchEvents();
  };

  /**
   * Resize/fill: drag the bottom-right handle of an event in WeekView.
   * The event's end becomes the bottom of the target row; if the drag also crossed
   * days, every day in between gets the same event (an existing one with the same
   * title and start is stretched instead of duplicated).
   * Nothing is changed if any day would overlap another event.
   */
  const resizeFillEvents = async (source: Event, targetDate: string, targetEndHour: number) => {
    if (!user) return;
    const current = events.find((e) => e.id === source.id) ?? source;
    const range = timeRange(current);
    if (!range) return;

    const startHour = Math.floor(range[0] / 60);
    const newStart = hhmm(current.start_time);
    const newEnd = fromMin(Math.min(Math.max(targetEndHour, startHour) + 1, 24) * 60);

    const plan = datesBetween(current.date, targetDate).map((date) => ({
      date,
      existing:
        date === current.date
          ? current
          : events.find((e) => e.date === date && e.title === current.title && hhmm(e.start_time) === newStart),
    }));

    for (const { date, existing } of plan) {
      const conflict = findTimeConflict(
        { id: existing?.id, date, start_time: newStart, end_time: newEnd },
        events,
      );
      if (conflict) {
        notify(`시간이 겹칩니다: ${conflictText(conflict)}`);
        return;
      }
    }

    const updateIds = plan
      .filter((p) => p.existing && hhmm(p.existing.end_time) !== newEnd)
      .map((p) => p.existing!.id);
    const inserts: NewEvent[] = plan
      .filter((p) => !p.existing)
      .map((p) => ({
        user_id: user.id,
        title: current.title,
        description: current.description,
        date: p.date,
        start_time: newStart,
        end_time: newEnd,
        color: current.color,
      }));
    if (updateIds.length === 0 && inserts.length === 0) return;

    const undo: UndoEntry = { label: inserts.length > 0 ? '일정 채우기' : '시간 변경' };
    applyLocal((prev) => prev.map((e) => (updateIds.includes(e.id) ? { ...e, end_time: newEnd } : e)));
    if (updateIds.length > 0) {
      const { error } = await supabase
        .from('events')
        .update({ end_time: newEnd })
        .in('id', updateIds)
        .eq('user_id', user.id);
      if (failed(error, '일정 시간 변경')) {
        fetchEvents();
        return;
      }
      undo.restore = plan
        .filter((p) => p.existing && updateIds.includes(p.existing.id))
        .map((p) => ({ id: p.existing!.id, patch: { end_time: p.existing!.end_time } }));
    }
    if (inserts.length > 0) {
      const { data, error } = await supabase.from('events').insert(inserts).select('id');
      if (!failed(error, '일정 채우기') && data) undo.remove = data.map((r) => r.id);
    }
    if (undo.restore || undo.remove) pushUndo(undo);
    fetchEvents();
  };

  // Swap two events: each takes the other's date and start, keeping its own length.
  // Cancelled (with a message) if either would then overlap a third event.
  const swapEvents = async (sourceId: string, targetId: string) => {
    if (!user || sourceId === targetId) return;
    const a = events.find((e) => e.id === sourceId);
    const b = events.find((e) => e.id === targetId);
    if (!a || !b) return;

    const placed = swapPlacement(a, b);
    if (!placed) {
      notify('자정(24:00)을 넘어가서 교환할 수 없습니다.');
      return;
    }
    const [aSlot, bSlot] = placed;
    if (sameSlot(a, aSlot) && sameSlot(b, bSlot)) return;

    const conflict =
      findTimeConflict({ id: a.id, ...aSlot }, events, [b.id]) ??
      findTimeConflict({ id: b.id, ...bSlot }, events, [a.id]);
    if (conflict) {
      notify(`교환하면 시간이 겹쳐서 취소했습니다: ${conflictText(conflict)}`);
      return;
    }

    applyLocal((prev) =>
      prev.map((e) => (e.id === a.id ? { ...e, ...aSlot } : e.id === b.id ? { ...e, ...bSlot } : e)),
    );
    const [resA, resB] = await Promise.all([
      supabase.from('events').update(aSlot).eq('id', a.id).eq('user_id', user.id),
      supabase.from('events').update(bSlot).eq('id', b.id).eq('user_id', user.id),
    ]);
    if (!failed(resA.error ?? resB.error, '일정 교환')) {
      pushUndo({
        label: '일정 교환',
        restore: [
          { id: a.id, patch: slotOf(a) },
          { id: b.id, patch: slotOf(b) },
        ],
      });
    }
    fetchEvents();
  };

  // Memo CRUD
  const saveMemo = async (memoData: Partial<Memo>) => {
    if (!user) return;

    if (memoData.id) {
      const { error } = await supabase
        .from('memos')
        .update({
          title: memoData.title,
          content: memoData.content,
          color: memoData.color,
          updated_at: new Date().toISOString(),
        })
        .eq('id', memoData.id)
        .eq('user_id', user.id);
      if (failed(error, '메모 저장')) return;
    } else {
      const { error } = await supabase.from('memos').insert({
        user_id: user.id,
        title: memoData.title,
        content: memoData.content,
        color: memoData.color,
      });
      if (failed(error, '메모 저장')) return;
    }

    setMemoModal({ open: false, memo: null });
    fetchMemos();
  };

  const deleteMemo = async (id: string) => {
    if (!user) return;
    unpinMemo(id);
    const { error } = await supabase.from('memos').delete().eq('id', id).eq('user_id', user.id);
    failed(error, '메모 삭제');
    fetchMemos();
  };

  // Every pin change made here goes through this, so it is also sent to the account
  const changePins = useCallback((update: (prev: PinLayout[]) => PinLayout[]) => {
    pinsDirty.current = true;
    pinsVersion.current++;
    setPins(update);
  }, []);

  const unpinMemo = (id: string) => changePins((prev) => prev.filter((p) => p.id !== id));

  const togglePinMemo = (memo: Memo) => {
    changePins((prev) =>
      prev.some((p) => p.id === memo.id)
        ? prev.filter((p) => p.id !== memo.id)
        : [...prev, { id: memo.id, x: 120 + prev.length * 30, y: 120 + prev.length * 30, ...DEFAULT_PIN }]
    );
  };

  // A pinned memo was dragged or resized: remember where it is now
  const movePin = useCallback(
    (id: string, layout: Omit<PinLayout, 'id'>) => {
      changePins((prev) => prev.map((p) => (p.id === id ? { id, ...layout } : p)));
    },
    [changePins],
  );

  /**
   * Copy the selected events ("매주 반복" over a date range, or all onto one day).
   * Copies that already exist or would overlap another event are skipped.
   * Returns true if the select window should close.
   */
  const batchCopy = async (
    selectedEvents: Event[],
    mode: 'weekly' | 'daily',
    options: { startDate?: string; endDate?: string; targetDate?: string }
  ): Promise<boolean> => {
    if (!user) return false;

    const asNew = (ev: Event, date: string): NewEvent => ({
      user_id: user.id,
      title: ev.title,
      description: ev.description,
      date,
      start_time: ev.start_time,
      end_time: ev.end_time,
      color: ev.color,
    });

    const candidates: NewEvent[] = [];
    let rangeFrom: string;
    let rangeTo: string;

    if (mode === 'weekly' && options.startDate && options.endDate) {
      rangeFrom = options.startDate;
      rangeTo = options.endDate;
      if (rangeFrom > rangeTo) {
        notify('종료일이 시작일보다 빠릅니다.');
        return false;
      }
      const spanDays = (parseDate(rangeTo).getTime() - parseDate(rangeFrom).getTime()) / 86_400_000;
      if (spanDays > MAX_REPEAT_DAYS) {
        notify('매주 반복은 한 번에 최대 1년까지만 가능합니다.');
        return false;
      }
      const days = datesBetween(rangeFrom, rangeTo);
      for (const ev of selectedEvents) {
        const weekday = parseDate(ev.date).getDay();
        for (const date of days) {
          if (date !== ev.date && parseDate(date).getDay() === weekday) candidates.push(asNew(ev, date));
        }
      }
    } else if (mode === 'daily' && options.targetDate) {
      rangeFrom = rangeTo = options.targetDate;
      for (const ev of selectedEvents) candidates.push(asNew(ev, options.targetDate));
    } else {
      return false;
    }

    // Compare against what is really stored for the target dates —
    // they are often outside the month that is currently loaded.
    const { data: existing, error: readError } = await supabase
      .from('events')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', rangeFrom)
      .lte('date', rangeTo);
    if (failed(readError, '일정 확인')) return false;

    const pool: Event[] = [...((existing as Event[] | null) ?? [])];
    const inserts: NewEvent[] = [];
    let skipped = 0;
    for (const candidate of candidates) {
      const duplicate = pool.some(
        (e) =>
          e.date === candidate.date &&
          e.title === candidate.title &&
          hhmm(e.start_time) === hhmm(candidate.start_time),
      );
      if (duplicate || findTimeConflict(candidate, pool)) {
        skipped++;
        continue;
      }
      inserts.push(candidate);
      pool.push({ ...candidate, id: `pending-${inserts.length}`, done: false, created_at: '' });
    }

    const skippedText = skipped > 0 ? ` (${skipped}개는 이미 있거나 시간이 겹쳐서 건너뜀)` : '';
    if (inserts.length === 0) {
      notify(`복사할 수 있는 일정이 없습니다.${skippedText}`);
      return false;
    }
    const { data, error } = await supabase.from('events').insert(inserts).select('id');
    if (failed(error, '일정 복사')) return false;
    pushCreated(data, `일정 ${inserts.length}개 복사`);

    notify(`일정 ${inserts.length}개를 복사했습니다.${skippedText}`, 'info');
    fetchEvents();
    setSelectModeOpen(false);
    return true;
  };

  const batchDelete = async (selectedEvents: Event[]) => {
    if (!user || selectedEvents.length === 0) return;
    const ids = selectedEvents.map((e) => e.id);
    const { error } = await supabase.from('events').delete().in('id', ids).eq('user_id', user.id);
    if (failed(error, '일정 삭제')) return;
    applyLocal((prev) => prev.filter((e) => !ids.includes(e.id)));
    fetchEvents();
    setSelectModeOpen(false);

    pushUndo({ label: `일정 ${selectedEvents.length}개 삭제`, reinsert: selectedEvents });
    notify(`일정 ${selectedEvents.length}개를 삭제했습니다. 위쪽 '되돌리기' 버튼으로 복구할 수 있습니다.`, 'info');
  };

  /** Reverse the most recent action in the undo history. */
  const undoLast = async () => {
    if (!user || undoing) return;
    const entry = undoStack[undoStack.length - 1];
    if (!entry) return;

    setUndoing(true);
    try {
      let error: { message: string } | null = null;

      if (entry.remove && entry.remove.length > 0) {
        ({ error } = await supabase.from('events').delete().in('id', entry.remove).eq('user_id', user.id));
      }
      if (!error && entry.restore) {
        const results = await Promise.all(
          entry.restore.map(({ id, patch }) =>
            supabase.from('events').update(patch).eq('id', id).eq('user_id', user.id),
          ),
        );
        error = results.find((r) => r.error)?.error ?? null;
      }
      if (!error && entry.reinsert && entry.reinsert.length > 0) {
        const fieldsOf = (ev: Event) => ({
          user_id: user.id,
          title: ev.title,
          description: ev.description,
          date: ev.date,
          start_time: ev.start_time,
          end_time: ev.end_time,
          color: ev.color,
          done: ev.done,
        });
        // Bring them back under their old ids so earlier undo steps still find them;
        // if the database refuses explicit ids, let it assign new ones.
        ({ error } = await supabase
          .from('events')
          .insert(entry.reinsert.map((ev) => ({ id: ev.id, ...fieldsOf(ev) }))));
        if (error) {
          ({ error } = await supabase.from('events').insert(entry.reinsert.map(fieldsOf)));
        }
      }

      if (failed(error, '되돌리기')) return;
      setUndoStack((prev) => prev.filter((e) => e !== entry));
      notify(`되돌렸습니다: ${entry.label}`, 'info');
    } finally {
      setUndoing(false);
      fetchEvents();
    }
  };

  // Ctrl+Z / ⌘Z, unless typing in a field or a window is open on top
  const undoLastRef = useRef(undoLast);
  useEffect(() => {
    undoLastRef.current = undoLast;
  });
  const overlayOpen = modal.open || memoModal.open || selectModeOpen || tourOpen;
  useEffect(() => {
    if (overlayOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      e.preventDefault();
      void undoLastRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [overlayOpen]);

  const openTour = () => {
    // Clear anything that would sit on top of (or under) the tour
    closeModal();
    setMemoModal({ open: false, memo: null });
    setSelectModeOpen(false);
    setSidebarOpen(false);
    setClickPasteSource(null);
    tourReturnView.current = view;
    setTourOpen(true);
  };

  const closeTour = () => {
    setTourOpen(false);
    setView(tourReturnView.current);
    if (!user || tutorialSeen(user.id)) return;
    markTutorialSeen(user.id);
    // Also note it on the account, so it doesn't pop up again on another device
    void supabase.auth.updateUser({ data: { [ACCOUNT_TUTORIAL_KEY]: true } }).then(({ error }) => {
      if (error) console.error('saving tutorial state to the account failed:', error);
    });
  };

  const logout = async () => {
    // A pin moved a moment ago may not have been sent to the account yet
    if (pinsDirty.current && user) {
      const { error } = await supabase.auth.updateUser({
        data: { [ACCOUNT_PINS_KEY]: pins.slice(0, MAX_ACCOUNT_PINS) },
      });
      // If it didn't go through, the pending mark stays and it is sent at the next login here
      if (!error) setPinsPending(user.id, false);
      pinsDirty.current = false;
    }
    localStorage.removeItem('rememberMe');
    sessionStorage.removeItem('activeSession');
    await supabase.auth.signOut();
    // Pins stay saved with the account for the next login; only the on-screen state is cleared
    localLoadedFor.current = null;
    setPinsOwner(null);
    setPins([]);
    setUndoStack([]);
    setUser(null);
    setEvents([]);
    setMemos([]);
    setClickPasteSource(null);
    setSidebarOpen(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted">로딩 중...</div>
      </div>
    );
  }

  if (!user || recovery) {
    return <Login recovery={!!user && recovery} onRecoveryDone={() => setRecovery(false)} />;
  }

  const monthLabel = `${year}년 ${month + 1}월`;
  const lastUndo = undoStack[undoStack.length - 1];

  const pasteAt = async (date: string, time?: string | null) => {
    if (!clickPasteSource) return;
    // Stay in paste mode if it could not be pasted there, so another spot can be clicked
    if (await copyEvent(clickPasteSource, date, time)) setClickPasteSource(null);
  };

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-4">
          {/* Hamburger */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 transition-colors hover:bg-card-hover"
            title="메뉴"
            data-tour="menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>
          <h1 className="text-xl font-bold">Planner</h1>
          <div className="flex items-center gap-4" data-tour="nav">
            <div className="flex items-center gap-2">
              <button
                onClick={goPrev}
                className="rounded-lg px-3 py-1.5 text-base transition-colors hover:bg-card-hover"
                title="이전"
              >
                ◀
              </button>
              <span className="min-w-[140px] text-center text-base font-medium">{monthLabel}</span>
              <button
                onClick={goNext}
                className="rounded-lg px-3 py-1.5 text-base transition-colors hover:bg-card-hover"
                title="다음"
              >
                ▶
              </button>
            </div>
            <button
              onClick={goToday}
              className="rounded-lg border border-border px-4 py-1.5 text-sm transition-colors hover:bg-card-hover"
            >
              오늘
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={undoLast}
            disabled={!lastUndo || undoing}
            data-tour="undo"
            title={lastUndo ? `되돌리기: ${lastUndo.label} (Ctrl+Z)` : '되돌릴 작업이 없습니다'}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-card-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 14L4 9l5-5" />
              <path d="M4 9h10.5a5.5 5.5 0 010 11H11" />
            </svg>
            되돌리기
          </button>
          <button
            onClick={() => {
              setClickPasteSource(null);
              setSelectModeOpen(true);
            }}
            data-tour="select"
            className="rounded-lg border border-border px-4 py-1.5 text-sm transition-colors hover:bg-card-hover"
          >
            선택
          </button>
          <div className="flex overflow-hidden rounded-lg border border-border" data-tour="view">
            <button
              onClick={() => setView('month')}
              className={`px-4 py-1.5 text-sm transition-colors ${
                view === 'month' ? 'bg-primary text-white' : 'hover:bg-card-hover'
              }`}
            >
              월
            </button>
            <button
              onClick={() => setView('week')}
              className={`px-4 py-1.5 text-sm transition-colors ${
                view === 'week' ? 'bg-primary text-white' : 'hover:bg-card-hover'
              }`}
            >
              주
            </button>
          </div>
          <button
            onClick={openTour}
            data-tour="help"
            title="사용 안내 다시 보기"
            aria-label="사용 안내"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-sm font-bold text-muted transition-colors hover:bg-card-hover hover:text-foreground"
          >
            ?
          </button>
        </div>
      </header>

      {/* Calendar */}
      {view === 'month' ? (
        <MonthView
          year={year}
          month={month}
          events={events}
          onDateClick={(date) => {
            setMultiDates([]);
            setModal({ open: true, event: {}, date });
          }}
          onDateRangeSelect={(dates) => {
            setMultiDates(dates);
            setModal({ open: true, event: {}, date: dates[0] });
          }}
          onEventClick={(event) => {
            setMultiDates([]);
            setModal({ open: true, event, date: event.date });
          }}
          onToggleDone={toggleDone}
          onMoveEvent={moveEvent}
          onSwapEvents={swapEvents}
          onCopyEvent={copyEvent}
          pasteSource={clickPasteSource}
          onPasteClick={pasteAt}
          onCancelPaste={() => setClickPasteSource(null)}
        />
      ) : (
        <WeekView
          year={year}
          month={month}
          day={selectedDay}
          events={events}
          onTimeClick={(date, time, endTime) => {
            setMultiDates([]);
            setModal({ open: true, event: { start_time: time, end_time: endTime }, date });
          }}
          onTimeRangeSelect={(dates, startTime, endTime) => {
            setMultiDates(dates);
            setModal({ open: true, event: { start_time: startTime, end_time: endTime }, date: dates[0] });
          }}
          onAllDayClick={(date) => {
            setMultiDates([]);
            setModal({ open: true, event: {}, date });
          }}
          onEventClick={(event) => {
            setMultiDates([]);
            setModal({ open: true, event, date: event.date });
          }}
          onToggleDone={toggleDone}
          onMoveEvent={moveEvent}
          onSwapEvents={swapEvents}
          onCopyEvent={copyEvent}
          onResizeFill={resizeFillEvents}
          pasteSource={clickPasteSource}
          onPasteClick={pasteAt}
          onCancelPaste={() => setClickPasteSource(null)}
        />
      )}

      {/* Pinned Memos */}
      {pins.map((pin) => {
        // A pin whose memo isn't loaded (yet) or was deleted elsewhere is simply not drawn
        const memo = memos.find((m) => m.id === pin.id);
        return memo ? (
          <PinnedMemo key={pin.id} memo={memo} layout={pin} onLayoutChange={movePin} onClose={unpinMemo} />
        ) : null;
      })}

      {/* Event Modal */}
      {modal.open && (
        <EventModal
          event={modal.event}
          date={modal.date}
          multiDates={multiDates}
          existingEvents={events}
          notice={modal.notice}
          onSave={saveEvent}
          onDelete={deleteEvent}
          onCopyMode={(ev) => {
            // Copy the saved event, not an unsaved drag position shown in the modal
            setClickPasteSource(events.find((e) => e.id === ev.id) ?? ev);
            closeModal();
            setSelectModeOpen(false);
          }}
          onClose={closeModal}
        />
      )}

      {/* Memo Modal */}
      {memoModal.open && (
        <MemoModal
          memo={memoModal.memo}
          onSave={saveMemo}
          onClose={() => setMemoModal({ open: false, memo: null })}
        />
      )}

      {/* Select Mode */}
      {selectModeOpen && (() => {
        let selectEvents: Event[];
        if (view === 'week') {
          const anchor = new Date(year, month, selectedDay);
          const weekStart = new Date(anchor);
          weekStart.setDate(anchor.getDate() - anchor.getDay());
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6);
          const from = fmtDate(weekStart);
          const to = fmtDate(weekEnd);
          selectEvents = events.filter((e) => e.date >= from && e.date <= to);
        } else {
          // Only the month on screen (the loaded list also holds a week on each side)
          const monthPrefix = fmtDate(new Date(year, month, 1)).slice(0, 8);
          selectEvents = events.filter((e) => e.date.startsWith(monthPrefix));
        }
        return (
          <SelectMode
            events={selectEvents}
            weekMode={view === 'week'}
            monthLabel={`${month + 1}월`}
            onClose={() => setSelectModeOpen(false)}
            onBatchCopy={batchCopy}
            onBatchDelete={batchDelete}
            onEditEvent={(event) => {
              setMultiDates([]);
              setModal({ open: true, event, date: event.date });
            }}
          />
        );
      })()}

      {/* Notice */}
      {notice && (
        <div
          role="status"
          className={`fixed left-1/2 top-4 z-[80] flex max-w-[90vw] -translate-x-1/2 items-center gap-3 rounded-xl border bg-card px-5 py-3 text-sm shadow-xl ${
            notice.kind === 'error' ? 'border-danger/60 text-danger' : 'border-success/60 text-success'
          }`}
        >
          <span>{notice.text}</span>
          <button
            onClick={() => setNotice(null)}
            className="shrink-0 rounded-lg p-1 text-muted hover:text-foreground"
            title="닫기"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Tutorial */}
      {tourOpen && <Tutorial view={view} onViewChange={setView} onClose={closeTour} />}

      {/* Sidebar */}
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        memos={memos}
        onCreateMemo={() => {
          setMemoModal({ open: true, memo: {} });
          setSidebarOpen(false);
        }}
        onEditMemo={(memo) => {
          setMemoModal({ open: true, memo });
          setSidebarOpen(false);
        }}
        onDeleteMemo={deleteMemo}
        onPinMemo={togglePinMemo}
        pinnedMemoIds={pins.map((p) => p.id)}
        onLogout={logout}
      />
    </div>
  );
}
