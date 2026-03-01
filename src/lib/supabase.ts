import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

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
