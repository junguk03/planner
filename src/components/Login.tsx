'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

type Mode = 'login' | 'signup' | 'forgot';

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(
    typeof window !== 'undefined' && localStorage.getItem('rememberMe') === 'true'
  );
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const reset = (nextMode: Mode) => {
    setMode(nextMode);
    setError('');
    setMessage('');
    setPassword('');
    setConfirmPassword('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.');
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

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.');
      return;
    }
    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });

    if (error) {
      if (error.message.includes('already registered')) {
        setError('이미 사용 중인 이메일입니다.');
      } else {
        setError(error.message);
      }
    } else {
      setMessage('가입 확인 이메일을 보냈습니다. 이메일을 확인해 주세요.');
    }
    setLoading(false);
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
    });

    if (error) {
      setError('오류가 발생했습니다. 다시 시도해 주세요.');
    } else {
      setMessage('비밀번호 재설정 링크를 이메일로 보냈습니다.');
    }
    setLoading(false);
  };

  const titles: Record<Mode, string> = {
    login: '로그인',
    signup: '회원가입',
    forgot: '비밀번호 찾기',
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-center text-2xl font-bold">Planner</h1>
        <p className="mb-6 text-center text-sm text-muted">{titles[mode]}</p>

        <form
          onSubmit={mode === 'login' ? handleLogin : mode === 'signup' ? handleSignup : handleForgot}
          className="rounded-2xl bg-card p-8 shadow-xl"
        >
          {error && (
            <div className="mb-4 rounded-lg bg-danger/20 p-3 text-sm text-danger">
              {error}
            </div>
          )}

          {message && (
            <div className="mb-4 rounded-lg bg-primary/20 p-3 text-sm text-primary">
              {message}
            </div>
          )}

          {/* Email */}
          <div className="mb-4">
            <label className="mb-1 block text-sm text-muted">이메일</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground outline-none focus:border-primary"
              placeholder="name@example.com"
              required
            />
          </div>

          {/* Password */}
          {mode !== 'forgot' && (
            <div className="mb-4">
              <label className="mb-1 block text-sm text-muted">비밀번호</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground outline-none focus:border-primary"
                placeholder={mode === 'signup' ? '6자 이상' : ''}
                required
              />
            </div>
          )}

          {/* Confirm password */}
          {mode === 'signup' && (
            <div className="mb-4">
              <label className="mb-1 block text-sm text-muted">비밀번호 확인</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground outline-none focus:border-primary"
                required
              />
            </div>
          )}

          {/* Remember me */}
          {mode === 'login' && (
            <label className="mb-6 flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              <span className="text-sm text-muted">자동 로그인</span>
            </label>
          )}

          {/* Submit */}
          {!message && (
            <button
              type="submit"
              disabled={loading}
              className={`w-full rounded-lg py-2.5 font-medium text-white transition-colors disabled:opacity-50 ${
                mode === 'login' ? 'mb-0' : 'mb-4'
              } bg-primary hover:bg-primary-hover`}
            >
              {loading
                ? '처리 중...'
                : mode === 'login'
                ? '로그인'
                : mode === 'signup'
                ? '가입하기'
                : '재설정 링크 보내기'}
            </button>
          )}

          {/* Forgot password link */}
          {mode === 'login' && (
            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={() => reset('forgot')}
                className="text-xs text-muted hover:text-foreground"
              >
                비밀번호를 잊으셨나요?
              </button>
            </div>
          )}
        </form>

        {/* Bottom switch */}
        <div className="mt-4 text-center text-sm text-muted">
          {mode === 'login' ? (
            <>
              계정이 없으신가요?{' '}
              <button onClick={() => reset('signup')} className="font-medium text-primary hover:underline">
                회원가입
              </button>
            </>
          ) : (
            <button onClick={() => reset('login')} className="font-medium text-primary hover:underline">
              ← 로그인으로 돌아가기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
