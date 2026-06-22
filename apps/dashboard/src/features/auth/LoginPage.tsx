import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ScalesIcon, UserIcon, LockKeyIcon, EyeIcon, EyeSlashIcon,
  SpinnerIcon, WarningCircleIcon,
} from '@phosphor-icons/react';
import { api, storeToken } from '@/api/client.js';

export function LoginPage() {
  const navigate = useNavigate();
  const [username,  setUsername]  = useState('');
  const [password,  setPassword]  = useState('');
  const [showPass,  setShowPass]  = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [loading,   setLoading]   = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await api.auth.login(username, password);
      storeToken(result.token);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בהתחברות');
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    'w-full bg-[#0d0d10] border border-white/10 rounded-lg pe-9 ps-3 py-2.5 ' +
    'text-parchment text-sm placeholder:text-parchment/30 ' +
    'focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500/60 transition ' +
    'aria-[invalid=true]:border-red-500/50 aria-[invalid=true]:ring-red-500/20';

  const hasError = error !== null;

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-[#0d0d10] flex items-center justify-center px-4"
    >
      <div className="w-full max-w-sm">

        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-navy-100 border border-gold-500/20 mb-4">
            <ScalesIcon size={32} weight="duotone" className="text-gold-500" />
          </div>
          <h1 className="text-2xl font-bold font-serif text-parchment tracking-tight">Factum-IL</h1>
          <p className="text-parchment/50 text-sm mt-1">מערכת ניהול משרד עו&quot;ד</p>
        </div>

        {/* Form card */}
        <form
          onSubmit={handleSubmit}
          className="bg-navy-100 border border-white/10 rounded-2xl p-6 shadow-xl flex flex-col gap-5"
          noValidate
        >
          <h2 className="text-parchment font-semibold text-base text-center">כניסה למערכת</h2>

          {/* Username */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="username" className="text-parchment/70 text-sm font-medium">
              שם משתמש
            </label>
            <div className="relative">
              <UserIcon
                size={16}
                weight="duotone"
                className="absolute top-1/2 -translate-y-1/2 end-3 text-parchment/40 pointer-events-none"
              />
              <input
                id="username"
                type="text"
                autoComplete="username"
                autoFocus
                required
                aria-invalid={hasError}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={inputClass}
                placeholder="שם המשתמש שלך"
              />
            </div>
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-parchment/70 text-sm font-medium">
              סיסמה
            </label>
            <div className="relative">
              <LockKeyIcon
                size={16}
                weight="duotone"
                className="absolute top-1/2 -translate-y-1/2 end-3 text-parchment/40 pointer-events-none"
              />
              <input
                id="password"
                type={showPass ? 'text' : 'password'}
                autoComplete="current-password"
                required
                aria-invalid={hasError}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass + ' ps-10'}
                placeholder="••••••••"
              />
              <button
                type="button"
                aria-label={showPass ? 'הסתר סיסמה' : 'הצג סיסמה'}
                onClick={() => setShowPass((v) => !v)}
                className="absolute top-1/2 -translate-y-1/2 start-3 text-parchment/40 hover:text-parchment/70 transition"
              >
                {showPass
                  ? <EyeSlashIcon size={16} weight="duotone" />
                  : <EyeIcon      size={16} weight="duotone" />}
              </button>
            </div>
          </div>

          {/* Error */}
          <div aria-live="polite" aria-atomic="true" className="min-h-[0px]">
            {hasError && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2">
                <WarningCircleIcon size={16} weight="duotone" className="shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gold-500 hover:bg-gold-600 disabled:opacity-50 disabled:cursor-not-allowed
                       text-navy-900 font-semibold rounded-lg py-2.5 text-sm
                       flex items-center justify-center gap-2 transition-colors"
          >
            {loading
              ? <><SpinnerIcon size={16} className="animate-spin" />מתחבר...</>
              : 'כניסה'}
          </button>
        </form>

        <p className="text-center text-parchment/30 text-xs mt-6">
          Factum-IL · כל הזכויות שמורות · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
