import type {
  BatchResult, Candidate, ExperimentDetail, ExperimentSummary, Machine, Method, QueryResult,
  RevealResult, Stats, TraceResult, Validation,
} from './types';

const BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? '') + '/api';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, { headers: { 'Content-Type': 'application/json' }, ...init });
  } catch {
    throw new ApiError('Cannot reach the backend. Make sure the API server is running on port 8000.', 0);
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body.detail === 'string') message = body.detail;
      else if (Array.isArray(body.detail)) message = body.detail.map((d: { msg: string }) => d.msg).join('; ');
    } catch { /* keep default message */ }
    throw new ApiError(message, res.status);
  }
  return res.json() as Promise<T>;
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });

export const api = {
  machines: () => request<Machine[]>('/machines'),
  stats: () => request<Stats>('/stats'),
  experiments: () => request<ExperimentSummary[]>('/experiments'),
  experiment: (id: number) => request<ExperimentDetail>(`/experiments/${id}`),
  createExperiment: (machine_id: string, name?: string) =>
    post<ExperimentSummary>('/experiments', { machine_id, name: name || null }),
  deleteExperiment: (id: number) => request<{ deleted: number }>(`/experiments/${id}`, { method: 'DELETE' }),
  deleteAll: () => request<{ deleted: number }>('/experiments?confirm=true', { method: 'DELETE' }),
  query: (id: number, input: string) => post<QueryResult>(`/experiments/${id}/query`, { input }),
  queryBatch: (id: number, inputs: string[]) => post<BatchResult>(`/experiments/${id}/query-batch`, { inputs }),
  discover: (id: number, method: Method, max_test_len: number) =>
    post<Candidate>(`/experiments/${id}/discover`, { method, max_test_len }),
  refine: (id: number, candidate_id: number, counterexample: string) =>
    post<Candidate>(`/experiments/${id}/refine`, { candidate_id, counterexample }),
  trace: (id: number, candidateId: number, input: string) =>
    post<TraceResult>(`/experiments/${id}/candidates/${candidateId}/trace`, { input }),
  validate: (id: number, candidate_id: number, max_len: number, n_random: number, extra_inputs: string[]) =>
    post<Validation>(`/experiments/${id}/validate`, { candidate_id, max_len, n_random, extra_inputs }),
  reveal: (id: number) => post<RevealResult>(`/experiments/${id}/reveal`),
};

export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : 'Something went wrong');
