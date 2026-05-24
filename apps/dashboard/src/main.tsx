import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { router } from './router/index.js';
import { logger, createConsoleSink } from '@factum-il/shared';
import { SplashScreen } from './components/SplashScreen.js';
import './styles/fonts.css';
import './styles/globals.css';

logger.addSink(createConsoleSink());
logger.configure('INFO');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      gcTime:   300_000,
    },
  },
});

function AppRoot() {
  const [ready, setReady] = useState(false);

  if (!ready) return <SplashScreen onReady={() => setReady(true)} />;

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

createRoot(rootEl).render(
  <StrictMode>
    <AppRoot />
  </StrictMode>,
);
