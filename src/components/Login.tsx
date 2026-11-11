'use client';

import { useState } from 'react';
import { supabase, authLinkFailed } from '@/lib/supabase';

// 'reset' = choosing a new password after opening the link from the reset email
type Mode = 'login' | 'signup' | 'forgot' | 'reset';

type Props = {
  /** The user arrived from a password-reset email and is signed in only to set a new password */
  recovery?: boolean;
  onRecoveryDone?: () => void;
};

const redirectTo = () => (typeof window !== 'undefined' ? window.location.origin : undefined);

type AuthFailure = { code?: string; message: string };

const RATE_LIMITED = '요청이 많아 잠시 막혔습니다. 몇 분 뒤에 다시 시도해 주세요.';
const isRateLimit = (error: AuthFailure) =>
  error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit';

/** What to tell someone whose sign-up failed (never the raw backend message, CWE-209). */
function signupErrorText(error: AuthFailure): string {
  if (isRateLimit(error)) return RATE_LIMITED;
  switch (error.code) {
    case 'user_already_exists':
    case 'email_exists':
      return '이미 사용 중인 이메일입니다.';
    case 'signup_disabled':
      return '지금은 새 회원가입을 받지 않고 있습니다.';
    case 'email_address_invalid':
      return '사용할 수 없는 이메일 주소입니다. 주소를 다시 확인해 주세요.';
    case 'email_address_not_authorized':
      return '이 주소로는 확인 메일을 보낼 수 없습니다. 운영자에게 문의해 주세요.';
    case 'weak_password':
      return '비밀번호가 너무 쉽습니다. 더 복잡하게 만들어 주세요.';
  }
  if (error.message.includes('already registered')) return '이미 사용 중인 이메일입니다.';
  return '회원가입 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
}

function passwordProblem(password: string, confirmPassword: string): string | null {
  if (password.length < 8) return '비밀번호는 8자 이상이어야 합니다.';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return '비밀번호는 영문과 숫자를 모두 포함해야 합니다.';
  if (password !== confirmPassword) return '비밀번호가 일치하지 않습니다.';
  return null;
}

export default function Login({ recovery = false, onRecoveryDone }: Props) {
  const [chosenMode, setMode] = useState<Mode>('login');
  const mode: Mode = recovery ? 'reset' : chosenMode;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(
    typeof window !== 'undefined' && localStorage.getItem('rememberMe') === 'true'
  );
  const [error, setError] = useState(
    authLinkFailed ? '링크가 만료되었거나 유효하지 않습니다. 다시 요청해 주세요.' : ''
  );
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  // The account exists but its email isn't confirmed yet: offer to send the mail again
  const [canResend, setCanResend] = useState(false);

  const reset = (nextMode: Mode) => {
    setMode(nextMode);
    setError('');
    setMessage('');
    setCanResend(false);
    setPassword('');
    setConfirmPassword('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setCanResend(false);
    if (error) {
      if (error.code === 'email_not_confirmed') {
        setError('이메일 인증이 아직 끝나지 않았습니다. 받은 메일의 확인 링크를 눌러 주세요.');
        setCanResend(true);
      } else if (isRateLimit(error)) {
        setError(RATE_LIMITED);
      } else {
        setError('이메일 또는 비밀번호가 올바르지 않습니다.');
      }
    } else {
      if (rememberMe) {
        localStorage.setItem('rememberMe', 'true');
      } else {
        localStorage.removeItem('rememberMe');
        sessionStorage.setItem('activeSession', 'true');
      }
    }
    setLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const problem = passwordProblem(password, confirmPassword);
    if (problem) {
      setError(problem);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      // The confirmation link must come back to this site, not the project's default URL
      options: { emailRedirectTo: redirectTo() },
    });

    if (error) {
      setError(signupErrorText(error));
      console.error('signup error:', error);
    } else if (data.session) {
      // Email confirmation is off: already signed in. Keep the session for this tab.
      sessionStorage.setItem('activeSession', 'true');
    } else if (data.user && data.user.identities && data.user.identities.length === 0) {
      // With confirmation on, an address that already has an account comes back
      // looking like a success, but with no identity attached and no mail sent.
      setError('이미 사용 중인 이메일입니다. 로그인하거나 비밀번호 찾기를 이용해 주세요.');
    } else {
      setMessage(`${email} 주소로 확인 메일을 보냈습니다. 메일의 링크를 누르면 가입이 끝납니다. (안 보이면 스팸함도 확인해 주세요)`);
      setCanResend(true);
    }
    setLoading(false);
  };

  const handleResend = async () => {
    if (!email || loading) return;
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: redirectTo() },
    });
    setLoading(false);
    if (error) {
      setError(isRateLimit(error) ? RATE_LIMITED : '확인 메일을 다시 보내지 못했습니다. 잠시 후 다시 시도해 주세요.');
      console.error('resend error:', error);
      return;
    }
    setMessage(`${email} 주소로 확인 메일을 다시 보냈습니다.`);
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const problem = passwordProblem(password, confirmPassword);
    if (problem) {
      setError(problem);
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError('비밀번호를 변경하지 못했습니다. 재설정 링크를 다시 요청해 주세요.');
      console.error('password reset error:', error);
      return;
    }
    onRecoveryDone?.();
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() });

    if (error) {
      setError(isRateLimit(error) ? RATE_LIMITED : '오류가 발생했습니다. 다시 시도해 주세요.');
    } else {
      setMessage('비밀번호 재설정 링크를 이메일로 보냈습니다.');
    }
    setLoading(false);
  };

  const titles: Record<Mode, string> = {
    login: '로그인',
    signup: '회원가입',
    forgot: '비밀번호 찾기',
    reset: '새 비밀번호 설정',
  };

  const submitHandlers: Record<Mode, (e: React.FormEvent) => void> = {
    login: handleLogin,
    signup: handleSignup,
    forgot: handleForgot,
    reset: handleReset,
  };
  const submitLabels: Record<Mode, string> = {
    login: '로그인',
    signup: '가입하기',
    forgot: '재설정 링크 보내기',
    reset: '비밀번호 변경',
  };
  const choosingPassword = mode === 'signup' || mode === 'reset';

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-center text-2xl font-bold">Planner</h1>
        <p className="mb-6 text-center text-sm text-muted">{titles[mode]}</p>

        <form
          onSubmit={submitHandlers[mode]}
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

          {canResend && (
            <button
              type="button"
              onClick={handleResend}
              disabled={loading}
              className="mb-4 w-full rounded-lg border border-border py-2 text-sm text-muted transition-colors hover:bg-card-hover hover:text-foreground disabled:opacity-50"
            >
              확인 메일 다시 보내기
            </button>
          )}

          {/* Email */}
          {mode !== 'reset' && (
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
          )}

          {/* Password */}
          {mode !== 'forgot' && (
            <div className="mb-4">
              <label className="mb-1 block text-sm text-muted">{mode === 'reset' ? '새 비밀번호' : '비밀번호'}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground outline-none focus:border-primary"
                placeholder={choosingPassword ? '영문+숫자 8자 이상' : ''}
                required
              />
            </div>
          )}

          {/* Confirm password */}
          {choosingPassword && (
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
              {loading ? '처리 중...' : submitLabels[mode]}
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
          {mode === 'reset' ? (
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                onRecoveryDone?.();
              }}
              className="font-medium text-primary hover:underline"
            >
              취소하고 로그인 화면으로
            </button>
          ) : mode === 'login' ? (
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
