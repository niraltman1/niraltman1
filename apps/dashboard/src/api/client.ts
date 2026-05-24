export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body: ApiResponse<T> = await res.json();
  if (!body.success) {
    throw new ApiClientError(body.error.code, body.error.message);
  }
  return body.data;
}

function get<T>(path: string): Promise<T> {
  return request<T>(path);
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
}

function patch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) });
}

export const api = {
  clients: {
    list: (page = 1, pageSize = 50) =>
      get(`/api/clients?page=${page}&pageSize=${pageSize}`),
    get: (id: number) =>
      get(`/api/clients/${id}`),
    create: (body: unknown) =>
      post<{ id: number }>('/api/clients', body),
    update: (id: number, body: unknown) =>
      patch(`/api/clients/${id}`, body),
    getTimeline: (id: number) =>
      get(`/api/clients/${id}/timeline`),
  },

  cases: {
    list: (page = 1, pageSize = 50, clientId?: number) => {
      const qs = clientId
        ? `clientId=${clientId}`
        : `page=${page}&pageSize=${pageSize}`;
      return get(`/api/cases?${qs}`);
    },
    get: (id: number) =>
      get(`/api/cases/${id}`),
    create: (body: unknown) =>
      post<{ id: number }>('/api/cases', body),
  },

  documents: {
    list: (page = 1, pageSize = 50) =>
      get(`/api/documents?page=${page}&pageSize=${pageSize}`),
    get: (id: number) =>
      get(`/api/documents/${id}`),
    getStatus: (id: number) =>
      get(`/api/documents/${id}/status`),
  },

  search: {
    query: (q: string, limit = 20) =>
      get(`/api/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  },

  queue: {
    stats: () =>
      get('/api/queue/stats'),
    items: (limit = 50) =>
      get(`/api/queue/items?limit=${limit}`),
    poisoned: () =>
      get('/api/queue/poisoned'),
    requeue: (id: string) =>
      post(`/api/queue/requeue/${id}`),
  },

  actionPlan: {
    list: (status?: string, limit?: number) => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (limit)  params.set('limit', String(limit));
      return get(`/api/action-plan?${params.toString()}`);
    },
    approve: (planIds: string[]) =>
      post('/api/action-plan/approve', { planIds }),
    reject: (planIds: string[]) =>
      post('/api/action-plan/reject', { planIds }),
    sign: (planIds: string[]) =>
      post<{ signedAt: string; totalEntries: number }>('/api/action-plan/sign', { planIds }),
  },

  admin: {
    workers: () =>
      get('/api/admin/workers'),
    watcherEvents: () =>
      get('/api/admin/watcher/events'),
    backups: () =>
      get('/api/admin/backups'),
    createBackup: () =>
      post<{ snapshotId: string }>('/api/admin/backups'),
    repairManifest: () =>
      post('/api/admin/repair/manifest'),
    repairIntegrity: () =>
      post('/api/admin/repair/integrity'),
  },
};
