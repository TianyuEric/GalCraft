import { expect, test } from 'vitest';
import { issueText } from './issue-text.js';
import { issueDetails } from '@galcraft/contracts';

test('asset, connection and syntax failures localize the action and retain exact diagnostic detail', () => {
  for (const [code, message] of [['ASSET_MISSING', 'Asset Art001 is unavailable'], ['CONNECTION_UNAVAILABLE', 'HTTP 503 at http://127.0.0.1:8188'], ['DSL_SYNTAX', 'Expected } at statement Line01']]) {
    expect(issueText({ code: code!, message: message! }, 'zh-CN')).toMatch(/[\u4e00-\u9fff]/);
    expect(issueText({ code: code!, message: message! }, 'en')).not.toMatch(/[\u4e00-\u9fff]/);
    expect(issueText({ code: code!, message: message! }, 'ja')).toMatch(/[\u3040-\u30ff]/);
    expect(issueDetails({ code: code!, message: message! })).toContain(message);
    expect(issueText({ code: code!, message: message! }, 'en')).not.toContain(message);
  }
  expect(issueText({ code: 'EXTERNAL_FAILURE', message: 'Provider-specific detail' }, 'en')).toContain('Expand the diagnostic details');
  expect(issueDetails({ code: 'EXTERNAL_FAILURE', message: 'Provider-specific detail' })).toContain('Provider-specific detail');
});
