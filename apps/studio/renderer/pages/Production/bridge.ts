import type { Result, StudioBridge } from '@galcraft/contracts';
import { DiagnosticError } from '@galcraft/contracts';
import type { WorkbenchBridge } from '../../../desktop-bridge.js';
export type * from '../../../desktop-bridge.js';
export const workbenchBridge = (
  bridge: Pick<StudioBridge, "documents" | "plugins" | "authoringPreferences">,
) => bridge as WorkbenchBridge;
export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new DiagnosticError(result.error);
  return result.value;
}
