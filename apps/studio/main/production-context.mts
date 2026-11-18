import type { ProjectSession } from '@galcraft/documents';
import { productionContext as assembleProductionContext } from '@galcraft/authoring/production';

/** Project-session projection; M10 selects and assembles the authoring context. */
export function productionContext(project: Pick<ProjectSession, 'documents'>, current: Parameters<typeof assembleProductionContext>[1], input: Parameters<typeof assembleProductionContext>[2]) {
  return assembleProductionContext([...project.documents.values()], current, input);
}
