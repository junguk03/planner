'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, Event, Memo } from '@/lib/supabase';
import Login from '@/components/Login';
import MonthView from '@/components/MonthView';
import WeekView from '@/components/WeekView';
import EventModal from '@/components/EventModal';
import Sidebar from '@/components/Sidebar';
import MemoModal from '@/components/MemoModal';
import PinnedMemo from '@/components/PinnedMemo';
import SelectMode from '@/components/SelectMode';

type ViewMode = 'month' | 'week';

export default function Home() {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('month');
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState(new Date().getDate());
  const [events, setEvents] = useState<Event[]>([]);
  const [modal, setModal] = useState<{
    open: boolean;
    event: Partial<Event> | null;
    date: string;
  }>({ open: false, event: null, date: '' });

  // Sidebar & Memo state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [memoModal, setMemoModal] = useState<{
    open: boolean;
    memo: Partial<Memo> | null;
  }>({ open: false, memo: null });
  const [pinnedMemoIds, setPinnedMemoIds] = useState<string[]>([]);
  const [selectModeOpen, setSelectModeOpen] = useState(false);
  const [multiDates, setMultiDates] = useState<string[]>([]);
  const [undoStack, setUndoStack] = useState<Event[][]>([]);
  const [undoVisible, setUndoVisible] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check auth
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const remembered = localStorage.getItem('rememberMe') === 'true';
        const activeSession = sessionStorage.getItem('activeSession') === 'true';
        if (!remembered && !activeSession) {
          // Not remembered and no active session → sign out
          await supabase.auth.signOut();
          setLoading(false);
          return;
        }
        setUser({ id: session.user.id, email: session.user.email! });
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email! });
      } else {
        setUser(null);
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

  // Fetch events
  const fetchEvents = useCallback(async () => {
    if (!user) return;

    const fetchStart = new Date(year, month, 1);
    fetchStart.setDate(fetchStart.getDate() - 7);
    const fetchEnd = new Date(year, month + 1, 0);
    fetchEnd.setDate(fetchEnd.getDate() + 7);

    const fmtDate = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', fmtDate(fetchStart))
      .lte('date', fmtDate(fetchEnd))
      .order('date')
      .order('start_time');

    if (!error && data) {
      setEvents(data);
    }
  }, [user, year, month]);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  // Realtime: listen for event changes
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('events-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `user_id=eq.${user.id}` }, () => {
        fetchEvents();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchEvents]);

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

  const goPrev = () => {
    if (view === 'month') {
      if (month === 0) {
        setYear(year - 1);
        setMonth(11);
      } else {
        setMonth(month - 1);
      }
    } else {
      const d = new Date(year, month, selectedDay - 7);
      setYear(d.getFullYear());
      setMonth(d.getMonth());
      setSelectedDay(d.getDate());
    }
  };

  const goNext = () => {
    if (view === 'month') {
      if (month === 11) {
        setYear(year + 1);
        setMonth(0);
      } else {
        setMonth(month + 1);
      }
    } else {
      const d = new Date(year, month, selectedDay + 7);
      setYear(d.getFullYear());
      setMonth(d.getMonth());
      setSelectedDay(d.getDate());
    }
  };

  // Event CRUD
  const saveEvent = async (eventData: Partial<Event>) => {
    if (!user) return;

    if (eventData.id) {
      await supabase
        .from('events')
        .update({
          title: eventData.title,
          description: eventData.description,
          date: eventData.date,
          start_time: eventData.start_time,
          end_time: eventData.end_time,
          color: eventData.color,
        })
        .eq('id', eventData.id);
    } else if (multiDates.length > 1) {
      // Multi-date insert
      const inserts = multiDates.map((date) => ({
        user_id: user.id,
        title: eventData.title,
        description: eventData.description,
        date,
        start_time: eventData.start_time,
        end_time: eventData.end_time,
        color: eventData.color,
      }));
      await supabase.from('events').insert(inserts);
    } else {
      await supabase.from('events').insert({
        user_id: user.id,
        title: eventData.title,
        description: eventData.description,
        date: eventData.date,
        start_time: eventData.start_time,
        end_time: eventData.end_time,
        color: eventData.color,
      });
    }

    setModal({ open: false, event: null, date: '' });
    setMultiDates([]);
    fetchEvents();
  };

  const deleteEvent = async (id: string) => {
    await supabase.from('events').delete().eq('id', id);
    setModal({ open: false, event: null, date: '' });
    fetchEvents();
  };

  const toggleDone = async (eventId: string) => {
    const event = events.find((e) => e.id === eventId);
    if (!event) return;
    await supabase.from('events').update({ done: !event.done }).eq('id', eventId);
    fetchEvents();
  };

  const copyEvent = async (event: Event, newDate: string, newStartTime?: string) => {
    if (!user) return;

    const startTime = newStartTime || event.start_time;
    let endTime = event.end_time;

    if (newStartTime && event.start_time && event.end_time) {
      const oldStartMin = parseInt(event.start_time.split(':')[0]) * 60 + parseInt(event.start_time.split(':')[1]);
      const oldEndMin = parseInt(event.end_time.split(':')[0]) * 60 + parseInt(event.end_time.split(':')[1]);
      const duration = oldEndMin - oldStartMin;
      const newStartMin = parseInt(newStartTime.split(':')[0]) * 60 + parseInt(newStartTime.split(':')[1]);
      const newEndMin = newStartMin + duration;
      endTime = `${String(Math.floor(newEndMin / 60)).padStart(2, '0')}:${String(newEndMin % 60).padStart(2, '0')}`;
    }

    await supabase.from('events').insert({
      user_id: user.id,
      title: event.title,
      description: event.description,
      date: newDate,
      start_time: startTime,
      end_time: endTime,
      color: event.color,
    });
    fetchEvents();
  };

  const moveEvent = async (eventId: string, newDate: string, newStartTime?: string) => {
    const event = events.find((e) => e.id === eventId);
    if (!event) return;

    // Check if there's an event at the target position → swap
    const targetEvent = events.find((e) => {
      if (e.id === eventId) return false;
      if (e.date !== newDate) return false;
      if (newStartTime) {
        // Week view: match by hour
        const eHour = e.start_time ? parseInt(e.start_time.split(':')[0]) : -1;
        const targetHour = parseInt(newStartTime.split(':')[0]);
        return eHour === targetHour;
      }
      // Month view: same date (swap first found)
      return !e.start_time && !event.start_time;
    });

    if (targetEvent) {
      // Swap: move target to dragged event's original position
      const swapData: Record<string, string | null> = { date: event.date };
      if (event.start_time) {
        swapData.start_time = event.start_time;
        swapData.end_time = event.end_time;
      }
      await supabase.from('events').update(swapData).eq('id', targetEvent.id);
    }

    // Move dragged event to target position
    const updateData: Record<string, string | null> = { date: newDate };
    if (newStartTime !== undefined) {
      const oldStart = event.start_time;
      const oldEnd = event.end_time;
      updateData.start_time = newStartTime;
      if (oldStart && oldEnd) {
        const oldStartMin = parseInt(oldStart.split(':')[0]) * 60 + parseInt(oldStart.split(':')[1]);
        const oldEndMin = parseInt(oldEnd.split(':')[0]) * 60 + parseInt(oldEnd.split(':')[1]);
        const duration = oldEndMin - oldStartMin;
        const newStartMin = parseInt(newStartTime.split(':')[0]) * 60 + parseInt(newStartTime.split(':')[1]);
        const newEndMin = newStartMin + duration;
        updateData.end_time = `${String(Math.floor(newEndMin / 60)).padStart(2, '0')}:${String(newEndMin % 60).padStart(2, '0')}`;
      }
    }

    await supabase.from('events').update(updateData).eq('id', eventId);
    fetchEvents();
  };

  // Memo CRUD
  const saveMemo = async (memoData: Partial<Memo>) => {
    if (!user) return;

    if (memoData.id) {
      await supabase
        .from('memos')
        .update({
          title: memoData.title,
          content: memoData.content,
          color: memoData.color,
          updated_at: new Date().toISOString(),
        })
        .eq('id', memoData.id);
    } else {
      await supabase.from('memos').insert({
        user_id: user.id,
        title: memoData.title,
        content: memoData.content,
        color: memoData.color,
      });
    }

    setMemoModal({ open: false, memo: null });
    fetchMemos();
  };

  const deleteMemo = async (id: string) => {
    setPinnedMemoIds((prev) => prev.filter((pid) => pid !== id));
    await supabase.from('memos').delete().eq('id', id);
    fetchMemos();
  };

  const togglePinMemo = (memo: Memo) => {
    setPinnedMemoIds((prev) =>
      prev.includes(memo.id)
        ? prev.filter((id) => id !== memo.id)
        : [...prev, memo.id]
    );
  };

  const batchCopy = async (
    selectedEvents: Event[],
    mode: 'weekly' | 'daily',
    options: { startDate?: string; endDate?: string; targetDate?: string }
  ) => {
    if (!user) return;

    const inserts: Array<{
      user_id: string;
      title: string;
      description: string | null;
      date: string;
      start_time: string | null;
      end_time: string | null;
      color: string;
    }> = [];

    if (mode === 'weekly' && options.startDate && options.endDate) {
      const start = new Date(options.startDate + 'T00:00:00');
      const end = new Date(options.endDate + 'T00:00:00');

      for (const ev of selectedEvents) {
        const evDate = new Date(ev.date + 'T00:00:00');
        const evDow = evDate.getDay();

        const cursor = new Date(start);
        while (cursor <= end) {
          if (cursor.getDay() === evDow) {
            const dateStr = fmtDateUtil(cursor);
            // Skip if same as original date or already exists
            const alreadyExists = events.some(
              (ex) => ex.date === dateStr && ex.title === ev.title && ex.start_time === ev.start_time
            );
            if (dateStr !== ev.date && !alreadyExists) {
              inserts.push({
                user_id: user.id,
                title: ev.title,
                description: ev.description,
                date: dateStr,
                start_time: ev.start_time,
                end_time: ev.end_time,
                color: ev.color,
              });
            }
          }
          cursor.setDate(cursor.getDate() + 1);
        }
      }
    } else if (mode === 'daily' && options.targetDate) {
      for (const ev of selectedEvents) {
        inserts.push({
          user_id: user.id,
          title: ev.title,
          description: ev.description,
          date: options.targetDate,
          start_time: ev.start_time,
          end_time: ev.end_time,
          color: ev.color,
        });
      }
    }

    if (inserts.length > 0) {
      await supabase.from('events').insert(inserts);
      fetchEvents();
    }
    setSelectModeOpen(false);
  };

  const batchDelete = async (selectedEvents: Event[]) => {
    if (!user || selectedEvents.length === 0) return;
    const ids = selectedEvents.map((e) => e.id);
    await supabase.from('events').delete().in('id', ids);
    fetchEvents();
    setSelectModeOpen(false);

    // Push to undo stack and show toast
    setUndoStack((prev) => [...prev, selectedEvents]);
    setUndoVisible(true);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setUndoVisible(false), 5000);
  };

  const undoDelete = async () => {
    if (!user || undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setUndoVisible(false);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);

    const inserts = last.map((ev) => ({
      user_id: user.id,
      title: ev.title,
      description: ev.description,
      date: ev.date,
      start_time: ev.start_time,
      end_time: ev.end_time,
      color: ev.color,
      done: ev.done,
    }));
    await supabase.from('events').insert(inserts);
    fetchEvents();
  };

  const fmtDateUtil = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const logout = async () => {
    localStorage.removeItem('rememberMe');
    sessionStorage.removeItem('activeSession');
    await supabase.auth.signOut();
    setUser(null);
    setEvents([]);
    setMemos([]);
    setPinnedMemoIds([]);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted">로딩 중...</div>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={() => {}} />;
  }

  const monthLabel = `${year}년 ${month + 1}월`;
  const pinnedMemos = memos.filter((m) => pinnedMemoIds.includes(m.id));

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
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>
          <h1 className="text-xl font-bold">Planner</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={goPrev}
              className="rounded-lg px-3 py-1.5 text-base transition-colors hover:bg-card-hover"
            >
              ◀
            </button>
            <span className="min-w-[140px] text-center text-base font-medium">{monthLabel}</span>
            <button
              onClick={goNext}
              className="rounded-lg px-3 py-1.5 text-base transition-colors hover:bg-card-hover"
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

        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectModeOpen(true)}
            className="rounded-lg border border-border px-4 py-1.5 text-sm transition-colors hover:bg-card-hover"
          >
            선택
          </button>
          <div className="flex overflow-hidden rounded-lg border border-border">
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
          onCopyEvent={copyEvent}
        />
      ) : (
        <WeekView
          year={year}
          month={month}
          day={selectedDay}
          events={events}
          onTimeClick={(date, time, endTime) => {
            setModal({ open: true, event: { start_time: time, end_time: endTime }, date });
          }}
          onEventClick={(event) => {
            setModal({ open: true, event, date: event.date });
          }}
          onToggleDone={toggleDone}
          onMoveEvent={moveEvent}
          onCopyEvent={copyEvent}
        />
      )}

      {/* Pinned Memos */}
      {pinnedMemos.map((memo, i) => (
        <PinnedMemo
          key={memo.id}
          memo={memo}
          initialX={120 + i * 30}
          initialY={120 + i * 30}
          onClose={(id) => setPinnedMemoIds((prev) => prev.filter((pid) => pid !== id))}
        />
      ))}

      {/* Event Modal */}
      {modal.open && (
        <EventModal
          event={modal.event}
          date={modal.date}
          multiDates={multiDates}
          existingEvents={events}
          onSave={saveEvent}
          onDelete={deleteEvent}
          onClose={() => {
            setModal({ open: false, event: null, date: '' });
            setMultiDates([]);
          }}
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
        let selectEvents = events;
        if (view === 'week') {
          const anchor = new Date(year, month, selectedDay);
          const dow = anchor.getDay();
          const weekDates = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(anchor);
            d.setDate(anchor.getDate() - dow + i);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          });
          selectEvents = events.filter((e) => weekDates.includes(e.date));
        }
        return (
          <SelectMode
            events={selectEvents}
            weekMode={view === 'week'}
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

      {/* Undo Toast */}
      {undoVisible && (
        <div className="fixed bottom-6 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-3 rounded-xl border border-border bg-card px-5 py-3 shadow-xl">
          <span className="text-sm text-foreground">이벤트가 삭제되었습니다</span>
          <button
            onClick={undoDelete}
            className="rounded-lg bg-primary px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
          >
            되돌리기
          </button>
          <button
            onClick={() => setUndoVisible(false)}
            className="rounded-lg p-1 text-muted hover:text-foreground"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

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
        pinnedMemoIds={pinnedMemoIds}
        onLogout={logout}
      />
    </div>
  );
}
