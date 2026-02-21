'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase, Event, Memo } from '@/lib/supabase';
import Login from '@/components/Login';
import MonthView from '@/components/MonthView';
import WeekView from '@/components/WeekView';
import EventModal from '@/components/EventModal';
import Sidebar from '@/components/Sidebar';
import MemoModal from '@/components/MemoModal';
import PinnedMemo from '@/components/PinnedMemo';

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

  // Check auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
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
    fetchEvents();
  };

  const deleteEvent = async (id: string) => {
    await supabase.from('events').delete().eq('id', id);
    setModal({ open: false, event: null, date: '' });
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

  const logout = async () => {
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
            setModal({ open: true, event: {}, date });
          }}
          onEventClick={(event) => {
            setModal({ open: true, event, date: event.date });
          }}
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
          onSave={saveEvent}
          onDelete={deleteEvent}
          onClose={() => setModal({ open: false, event: null, date: '' })}
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
