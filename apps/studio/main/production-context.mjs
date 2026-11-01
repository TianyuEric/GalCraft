import { productionContext as assembleProductionContext } from '@galcraft/authoring/production';

/** Project-session projection; M10 selects and assembles the authoring context. */
export function productionContext(project, current, input) {
  return assembleProductionContext([...project.documents.values()], current, input);
}
