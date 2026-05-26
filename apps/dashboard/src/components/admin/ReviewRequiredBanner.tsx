import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

interface BannerState {
  count: number;
  loaded: boolean;
}

export function ReviewRequiredBanner() {
  const [state, setState] = useState<BannerState>({ count: 0, loaded: false });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/cases?registry_status=manual_review_required&pageSize=1')
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: { total?: number }) => {
        if (!cancelled) setState({ count: data.total ?? 0, loaded: true });
      })
      .catch(() => { if (!cancelled) setState({ count: 0, loaded: true }); });
    return () => { cancelled = true; };
  }, []);

  if (!state.loaded || state.count === 0) return null;

  return (
    <div
      role="alert"
      dir="rtl"
      className="flex items-center gap-3 px-5 py-2 text-sm font-medium"
      style={{
        background: 'linear-gradient(90deg,#7c2d12 0%,#9a3412 100%)',
        color: '#fef3c7',
        borderBottom: '1px solid rgba(251,191,36,0.3)',
      }}
    >
      <span style={{ fontSize: 16 }}>⚠</span>
      <span>
        {state.count === 1
          ? 'תיק 1 דורש סיווג ידני'
          : `${state.count} תיקים דורשים סיווג ידני`}
        {' '}—{' '}
        סוג התיק לא נמצא ברשימת הרישום הנורמטיבי
      </span>
      <Link
        to="/cases?registry_status=manual_review_required"
        className="mr-auto underline underline-offset-2 hover:text-white"
        style={{ color: '#fde68a' }}
      >
        לתיקים לסיווג &larr;
      </Link>
    </div>
  );
}
