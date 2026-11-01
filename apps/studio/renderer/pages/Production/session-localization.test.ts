import { expect, it } from 'vitest';
import { ProductionSession } from './session.js';
import type { WorkbenchBridge } from './bridge.js';

it('creates a draft name once in the creation language and retains it across language changes', () => {
  let locale = 'ja';
  const session = new ProductionSession({ production: {} } as WorkbenchBridge, 'WorkAA', () => locale);
  session.newDraft();
  expect(session.draft!.name).toBe('新しい制作');
  locale = 'en'; session.setUsage('script');
  expect(session.draft!.name).toBe('新しい制作');
  session.newDraft();
  expect(session.draft!.name).toBe('New production');
  session.stop();
});
