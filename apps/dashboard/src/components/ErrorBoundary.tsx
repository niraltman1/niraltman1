import { Component, type ErrorInfo, type ReactNode } from 'react';
import { WarningIcon } from '@phosphor-icons/react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error.message, info.componentStack);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          className="flex flex-col items-center justify-center min-h-screen gap-6 text-center p-8"
        >
          <WarningIcon size={64} weight="duotone" className="text-gold/60" />
          <div>
            <h1 className="text-2xl font-serif font-bold text-parchment">אירעה שגיאה בלתי צפויה</h1>
            <p className="text-parchment/60 mt-2 max-w-md">
              המערכת נתקלה בבעיה. פרטי הענין נרשמו ביומן.
            </p>
            {this.state.message && (
              <p className="text-parchment/40 mt-1 text-xs font-mono">{this.state.message}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-5 py-2 bg-gold/20 hover:bg-gold/30 text-gold rounded-md
                       transition-colors text-sm font-medium"
          >
            רענן דף
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
