import type { GalCraftPlugin } from '@galcraft/plugins/contracts';
import { emptyContributions } from '@galcraft/plugins/contracts';
import { documentEditorKey, editorKey, writingOperationId } from './metadata.js';
import { operationId, scoreDocumentKey } from './score.js';
import { mountMusicWorkstation } from './workstation.js';
import { mountMusicWritingEditor } from './writing-editor.js';
export { mountMusicWritingEditor } from './writing-editor.js';
export { mountMusicWorkstation } from './workstation.js';
export function createPlugin(): GalCraftPlugin {
  const releases = new Set<() => void>();
  return { async activate(context) { const contributions = emptyContributions();
    contributions.fieldEditors = [
      { key: `${editorKey}-writing`, contributionKey: writingOperationId, fieldKey: 'description', mount(root, context) { const dispose = mountMusicWritingEditor(root, context); releases.add(dispose); return () => { releases.delete(dispose); dispose(); }; } },
      { key: editorKey, contributionKey: operationId, fieldKey: 'score', mount(root, context) { const dispose = mountMusicWorkstation(root, context); releases.add(dispose); return () => { releases.delete(dispose); dispose(); }; } },
      { key: documentEditorKey, contributionKey: scoreDocumentKey, fieldKey: 'score', mount(root, context) { const dispose = mountMusicWorkstation(root, context); releases.add(dispose); return () => { releases.delete(dispose); dispose(); }; } },
    ]; return contributions;
  }, async deactivate() { for (const dispose of releases) dispose(); releases.clear(); } };
}
