import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// True when the page was opened from a password-reset email link. Must be read
// before the client is created, because the client consumes and clears the URL hash.
export const openedFromRecoveryLink =
  typeof window !== 'undefined' &&
  /(^|[#?&])type=recovery(&|$)/.test(window.location.hash + window.location.search);

// True when an emailed link (reset / confirm) came back as expired or invalid.
export const authLinkFailed =
  typeof window !== 'undefined' && /(^|[#?&])error_code=/.test(window.location.hash + window.location.search);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export type Event = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  date: string;        // YYYY-MM-DD
  start_time: string | null;  // HH:MM
  end_time: string | null;    // HH:MM
  color: string;
  done: boolean;
  created_at: string;
};

export type Memo = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  color: string;
  created_at: string;
  updated_at: string;
};
