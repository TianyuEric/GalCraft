import type { CapabilityReport, ConnectionConfig } from '@galcraft/contracts';
import type { GenerationInput, WorkflowBinding } from './types.js';
import type { GenerationReadiness, ProductionFormDraft } from './types.js';

export function generationReadiness(routes: Partial<Record<ProductionFormDraft['activeUse'], ConnectionConfig>> = {}): GenerationReadiness {
  return ['script', 'background', 'figure', 'difference', 'cg', 'voice', 'bgm', 'ui'].map(usage => ({ usage, state: routes[usage as ProductionFormDraft['activeUse']] ? 'unchecked' : 'needsConnection', issues: [] }));
}

export {inputCapability,confirmInput} from '@galcraft/generation-services/capabilities';
