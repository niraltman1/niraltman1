import { generateTraceId, runWithTrace } from './correlation.js';

interface Req { headers: Record<string, string | string[] | undefined> }
interface Res { setHeader(name: string, value: string): void }
type NextFn = () => void;
type Middleware = (req: Req, res: Res, next: NextFn) => void;

export function observabilityMiddleware(): Middleware {
  return (req, res, next) => {
    // Use existing X-Trace-Id header if provided (e.g. from upstream proxy), or generate
    const existing = req.headers['x-trace-id'];
    const traceId = (typeof existing === 'string' && existing.length > 0)
      ? existing
      : generateTraceId();
    res.setHeader('X-Trace-Id', traceId);
    // Run the rest of the request in the trace context
    runWithTrace(traceId, next);
  };
}
