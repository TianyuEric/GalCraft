import { expect, it, vi } from 'vitest';
import { validateProductionCandidate, type CandidateValidationPorts } from './candidate-validation.js';
import type { Candidate, TaskItem } from './types.js';
import type { Artifact } from '@galcraft/contracts';

it('uses the explicit SVG operation even when the text request retains the default script usage', async () => {
  const image = { kind: 'image', mime: 'image/svg+xml' } as Artifact;
  const candidate = { artifacts: [{ kind: 'text', mime: 'text/plain' }] } as Candidate;
  const item = { purpose: 'text', operation: 'svg', target: { usage: 'script' } } as TaskItem;
  const scriptSource = vi.fn(() => { throw new Error('SVG has no script target'); });
  const prepareSVG = vi.fn(async () => ({ ok: true as const, value: image, warnings: [] }));
  expect(await validateProductionCandidate(candidate, item, { scriptSource, prepareSVG } as unknown as CandidateValidationPorts)).toEqual([]);
  expect(scriptSource).not.toHaveBeenCalled();expect(prepareSVG).toHaveBeenCalledWith(candidate);
  expect(candidate.artifacts).toContain(image);
});

it('keeps script-target validation for legacy text items without an explicit operation', async () => {
  const item = { purpose: 'text', target: { usage: 'script' } } as TaskItem;
  const ports = { scriptSource: () => ({ documents: [] }) } as unknown as CandidateValidationPorts;
  expect((await validateProductionCandidate({ artifacts: [] } as unknown as Candidate, item, ports))[0]?.code).toBe('SCRIPT_TARGET');
});
