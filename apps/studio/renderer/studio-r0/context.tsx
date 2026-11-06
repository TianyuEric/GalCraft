import { createContext, useContext, useSyncExternalStore } from 'react';
import type { ReviewStore } from './model.js';
export const ReviewContext = createContext<ReviewStore | null>(null);
export function useReview() {
  const store = useContext(ReviewContext);
  if (!store) throw new Error('Review workspace is missing its session.');
  return store;
}
export function useReviewState() {
  const store = useReview();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
