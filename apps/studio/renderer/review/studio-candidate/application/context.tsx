import { createContext, useContext, useSyncExternalStore } from 'react';
import type { CandidateSession } from './session.js';
export const CandidateContext = createContext<CandidateSession | null>(null);
export function useCandidate() { const session = useContext(CandidateContext); if (!session) throw new Error('候选 Studio 会话未装配'); return session; }
export function useCandidateState() { const session = useCandidate(); return useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot); }
