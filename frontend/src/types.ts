export interface Machine { id: string; name: string; alphabet: string[]; difficulty: string }

export interface ExperimentSummary {
  id: number; name: string; created_at: string; revealed: boolean; machine: Machine; rule?: string;
  observation_count?: number; candidate_count?: number; validation_count?: number; latest_agreement?: number | null;
}

export interface Observation {
  id: number; input: string; accepted: boolean; label: 'ACCEPTED' | 'REJECTED'; source: string; created_at: string;
}

export interface DfaModel {
  alphabet: string[]; states: string[]; initial: string; accepting: string[];
  transitions: Record<string, Record<string, string>>;
}

export interface TableRow { prefix: string; row: number[]; region: 'S' | 'S.A' }

export interface CandidateInfo {
  stats: { states: number; observations_total: number; observations_fit: number; new_queries: number };
  proven: boolean; refined_from: number | null;
  explanation: string[]; warnings: string[]; suggestions: string[];
  access: Record<string, string>;
  // L*
  suffixes?: string[]; table?: TableRow[]; membership_queries?: number; equivalence_queries?: number; max_test_len?: number;
  // passive (RPNI)
  positives?: number; negatives?: number; pta_states?: number; merges?: number;
  unobserved_transitions?: { state: string; symbol: string }[]; unlabeled_states?: string[];
}

export type Method = 'lstar' | 'passive';

export interface Candidate {
  id: number; experiment_id: number; method: Method; params: { max_test_len?: number };
  dfa: DfaModel; info: CandidateInfo; created_at: string;
}

export interface ValidationRow {
  input: string; category: string; actual: boolean; predicted: boolean; match: boolean;
  actual_label: string; predicted_label: string;
}

export interface Validation {
  id: number; experiment_id: number; candidate_id: number; total: number; matches: number; agreement: number;
  results: ValidationRow[]; created_at: string; counterexamples?: string[];
}

export interface ExperimentDetail {
  experiment: ExperimentSummary; observations: Observation[]; candidates: Candidate[];
  validations: Validation[]; counterexamples: string[];
}

export interface Stats {
  experiments: number; experiments_completed: number; strings_tested: number; candidate_models: number; validations: number;
}

export interface QueryResult { input: string; accepted: boolean; label: 'ACCEPTED' | 'REJECTED'; new: boolean; observation_count: number }
export interface BatchResult { results: Omit<QueryResult, 'observation_count'>[]; observation_count: number }

export interface TraceStep { step: number; symbol: string | null; from_state: string | null; state: string }
export interface TraceResult { input: string; steps: TraceStep[]; accepted: boolean; label: 'ACCEPTED' | 'REJECTED' }

export interface RevealResult {
  rule: string; minimal_dfa: DfaModel; minimal_states: number;
  candidate_checks: { candidate_id: number; method: Method; candidate_states: number; equivalent: boolean; shortest_counterexample: string | null }[];
}
