'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(
    typeof window !== 'undefined' && localStorage.getItem('rememberMe') === 'true'
  );
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError('로그인 실패: 이메일 또는 비밀번호를 확인하세요');
    } else {
      if (rememberMe) {
        localStorage.setItem('rememberMe', 'true');
      } else {
        localStorage.removeItem('rememberMe');
        sessionStorage.setItem('activeSession', 'true');
      }
      onLogin();
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-sm rounded-2xl bg-card p-8 shadow-xl"
      >
        <h1 className="mb-6 text-center text-2xl font-bold">Planner</h1>

        {error && (
          <div className="mb-4 rounded-lg bg-danger/20 p-3 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="mb-4">
          <label className="mb-1 block text-sm text-muted">이메일</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground outline-none focus:border-primary"
            required
          />
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-sm text-muted">비밀번호</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground outline-none focus:border-primary"
            required
          />
        </div>

        <label className="mb-6 flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          <span className="text-sm text-muted">자동 로그인</span>
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-primary py-2.5 font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {loading ? '로그인 중...' : '로그인'}
        </button>
      </form>
    </div>
  );
}
