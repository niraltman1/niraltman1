import { useEffect, useRef, useState } from 'react';

const MESSAGES = [
  'מאתחל את מנוע Legal-OS...',
  'מתחבר לבסיס הנתונים המאובטח...',
  'מעיר עובדי הבינה המלאכותית...',
  'המערכת מוכנה ✓',
] as const;

const MIN_DISPLAY_MS = 2000;
const POLL_INTERVAL_MS = 500;
const MSG_INTERVAL_MS = 1500;
const FADE_DURATION_MS = 400;

export function SplashScreen({ onReady }: { onReady: () => void }) {
  const [phase, setPhase]       = useState<'connecting' | 'fading'>('connecting');
  const [msgIndex, setMsgIndex] = useState(0);
  const [apiReady, setApiReady] = useState(false);
  const minMetRef               = useRef(false);
  const apiReadyRef             = useRef(false);
  const onReadyRef              = useRef(onReady);
  onReadyRef.current            = onReady;

  const tryTransition = () => {
    if (minMetRef.current && apiReadyRef.current && phase === 'connecting') {
      setMsgIndex(MESSAGES.length - 1);
      setPhase('fading');
      setTimeout(() => onReadyRef.current(), FADE_DURATION_MS);
    }
  };

  // Minimum display timer
  useEffect(() => {
    const t = setTimeout(() => {
      minMetRef.current = true;
      tryTransition();
    }, MIN_DISPLAY_MS);
    return () => clearTimeout(t);
  }, []);

  // Health poll
  useEffect(() => {
    const id = setInterval(async () => {
      if (apiReadyRef.current) return;
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          apiReadyRef.current = true;
          setApiReady(true);
          tryTransition();
        }
      } catch { /* API not yet up */ }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // Message cycler (stops at last message when ready)
  useEffect(() => {
    const id = setInterval(() => {
      setMsgIndex((i) => {
        if (apiReady) return MESSAGES.length - 1;
        return i < MESSAGES.length - 2 ? i + 1 : i;
      });
    }, MSG_INTERVAL_MS);
    return () => clearInterval(id);
  }, [apiReady]);

  const isFading = phase === 'fading';

  return (
    <div
      dir="rtl"
      style={{
        position:        'fixed',
        inset:           0,
        backgroundColor: '#0A1226',
        display:         'flex',
        flexDirection:   'column',
        alignItems:      'center',
        justifyContent:  'center',
        zIndex:          9999,
        opacity:         isFading ? 0 : 1,
        transition:      `opacity ${FADE_DURATION_MS}ms ease-out`,
        fontFamily:      '"Heebo", system-ui, sans-serif',
      }}
    >
      {/* ─── Logo area ─────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: '2rem' }}>
        {/* ═══════════════════════════════════════════════════════════════════
            USER LOGO INJECTION POINT
            Replace the <svg> below with your actual logo SVG.
            Keep the wrapping element and className="logo-svg".
            Mark paths to animate with className="circuit-trace".
            Mark glow nodes with className="circuit-node".
            ═══════════════════════════════════════════════════════════════════ */}
        <svg
          className="logo-svg"
          viewBox="0 0 160 160"
          width="120"
          height="120"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Pillar */}
          <line x1="80" y1="30" x2="80" y2="130" stroke="#5BE0D4" strokeWidth="2" strokeLinecap="round" />
          {/* Base */}
          <line x1="55" y1="130" x2="105" y2="130" stroke="#5BE0D4" strokeWidth="2.5" strokeLinecap="round" />
          {/* Beam */}
          <line x1="35" y1="55" x2="125" y2="55" stroke="#5BE0D4" strokeWidth="2" strokeLinecap="round" />
          {/* Left chain */}
          <line x1="40" y1="55" x2="40" y2="90" stroke="#5BE0D4" strokeWidth="1.5" strokeDasharray="3 2" />
          {/* Right chain */}
          <line x1="120" y1="55" x2="120" y2="90" stroke="#5BE0D4" strokeWidth="1.5" strokeDasharray="3 2" />
          {/* Left pan */}
          <path d="M 25,90 Q 40,98 55,90" fill="none" stroke="#5BE0D4" strokeWidth="1.5" />
          {/* Right pan */}
          <path d="M 105,90 Q 120,98 135,90" fill="none" stroke="#5BE0D4" strokeWidth="1.5" />
          {/* Pivot node */}
          <circle className="circuit-node" cx="80" cy="55" r="4" />

          {/* ── Circuit traces emanating from pivot ── */}
          <path
            className="circuit-trace"
            style={{ '--dash-len': '120' } as React.CSSProperties}
            d="M 80,55 h-22 v12 h-10 v-6 h-8"
          />
          <path
            className="circuit-trace"
            style={{ '--dash-len': '100' } as React.CSSProperties}
            d="M 80,55 h22 v12 h10 v-6 h8"
          />
          <path
            className="circuit-trace"
            style={{ '--dash-len': '80' } as React.CSSProperties}
            d="M 80,55 v-18 h-14 v-6"
          />

          {/* Circuit terminal nodes */}
          <circle className="circuit-node" cx="40"  cy="73" r="2.5" style={{ animationDelay: '0.6s' }} />
          <circle className="circuit-node" cx="120" cy="73" r="2.5" style={{ animationDelay: '1.0s' }} />
          <circle className="circuit-node" cx="66"  cy="31" r="2.5" style={{ animationDelay: '1.4s' }} />
        </svg>
        {/* ═══════════════════════════ END LOGO INJECTION POINT ══════════════ */}
      </div>

      {/* ─── Title ─────────────────────────────────────────────────────────── */}
      <h1
        style={{
          fontSize:      '2rem',
          fontWeight:    700,
          color:         '#E8EEF3',
          margin:        '0 0 0.25rem',
          letterSpacing: '0.08em',
        }}
      >
        Legal-OS Beta
      </h1>
      <p
        style={{
          fontSize:   '0.85rem',
          color:      '#5BE0D4',
          margin:     '0 0 2.5rem',
          letterSpacing: '0.04em',
        }}
      >
        אלטמן משרד עורכי דין
      </p>

      {/* ─── Loading message ───────────────────────────────────────────────── */}
      <p
        key={msgIndex}
        style={{
          fontSize:   '0.9rem',
          color:      apiReady ? '#5BE0D4' : '#94A3B8',
          margin:     '0 0 3rem',
          minHeight:  '1.4em',
          transition: 'color 0.3s',
          animation:  'fade-msg 0.3s ease-out',
        }}
      >
        {MESSAGES[msgIndex]}
      </p>

      {/* ─── Progress bar ──────────────────────────────────────────────────── */}
      <div
        style={{
          position:        'absolute',
          bottom:          0,
          left:            0,
          right:           0,
          height:          '3px',
          backgroundColor: 'rgba(91,224,212,0.1)',
        }}
      >
        <div className={`progress-bar-fill${apiReady ? ' complete' : ''}`} />
      </div>
    </div>
  );
}
