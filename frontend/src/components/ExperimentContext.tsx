import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, ApiError } from '../api';
import type { Candidate, ExperimentDetail } from '../types';

interface Ctx {
  currentId: number | null;
  current: ExperimentDetail | null;
  loading: boolean;
  select: (id: number | null) => void;
  reload: () => Promise<void>;
  candidate: Candidate | null;
  candidateId: number | null;
  setCandidateId: (id: number | null) => void;
}

const ExperimentContext = createContext<Ctx | null>(null);
const KEY = 'bba.currentExperiment';

export function ExperimentProvider({ children }: { children: ReactNode }) {
  const [currentId, setCurrentId] = useState<number | null>(() => {
    const raw = localStorage.getItem(KEY);
    return raw ? Number(raw) : null;
  });
  const [current, setCurrent] = useState<ExperimentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [candidateId, setCandidateId] = useState<number | null>(null);

  const select = useCallback((id: number | null) => {
    if (id === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(id));
    setCurrentId(id);
    if (id === null) setCurrent(null);
  }, []);

  const reload = useCallback(async () => {
    if (currentId === null) return;
    setLoading(true);
    try {
      setCurrent(await api.experiment(currentId));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) select(null); // experiment was deleted
    } finally {
      setLoading(false);
    }
  }, [currentId, select]);

  useEffect(() => { void reload(); }, [reload]);

  // Keep a valid candidate selected (default: the newest one).
  useEffect(() => {
    const list = current?.candidates ?? [];
    if (list.length === 0) { setCandidateId(null); return; }
    setCandidateId((id) => (id !== null && list.some((c) => c.id === id) ? id : list[list.length - 1].id));
  }, [current]);

  const candidate = useMemo(
    () => current?.candidates.find((c) => c.id === candidateId) ?? null, [current, candidateId]);

  const value = useMemo<Ctx>(() => ({
    currentId, current, loading, select, reload, candidate, candidateId, setCandidateId,
  }), [currentId, current, loading, select, reload, candidate, candidateId]);

  return <ExperimentContext.Provider value={value}>{children}</ExperimentContext.Provider>;
}

export function useExperiment(): Ctx {
  const ctx = useContext(ExperimentContext);
  if (!ctx) throw new Error('useExperiment must be used inside ExperimentProvider');
  return ctx;
}
