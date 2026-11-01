import { emptyContributions } from '@galcraft/plugins/contracts';
import type { GalCraftPlugin } from '@galcraft/plugins/contracts';
import type { Json } from '@galcraft/contracts';
import { operation, operationId } from './definition.js';

export function createPlugin(): GalCraftPlugin { return { activate: async () => ({ ...emptyContributions(), fieldEditors: [{
  key: 'org.example.video/input', contributionKey: operationId, fieldKey: 'input',
  mount(root, context) {
    const target = context.target; if (!target || target.kind !== 'production') throw new Error('Production draft context required');
    let values = structuredClone(target.fields), references = structuredClone(target.references), released = false;
    const form = document.createElement('fieldset'); form.disabled = target.readonly;
    for (const field of operation.fields) {
      const label = document.createElement('label'); label.className = 'authoring-field'; label.textContent = field.label;
      const input = field.type === 'enum' ? document.createElement('select') : document.createElement('input');
      input.setAttribute('aria-label', field.label); input.setAttribute('data-video-field', field.path);
      if (input instanceof HTMLSelectElement) for (const value of field.enumValues ?? []) { const option = document.createElement('option'); option.value = option.textContent = value; input.append(option); }
      else { input.type = field.type === 'boolean' ? 'checkbox' : ['integer', 'number'].includes(field.type) ? 'number' : 'text'; if (field.min !== undefined) input.min = String(field.min); if (field.max !== undefined) input.max = String(field.max); }
      if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = values[field.path] === true; else input.value = String(values[field.path] ?? '');
      input.addEventListener('input', () => { values[field.path] = input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked : ['integer', 'number'].includes(field.type) ? Number(input.value) : input.value; });
      label.append(input); form.append(label);
    }
    const media = document.createElement('select'); media.setAttribute('aria-label', '参考图 / Reference image');
    const none = document.createElement('option'); none.value = ''; none.textContent = '无参考图 / No reference'; media.append(none);
    void context.studio.assets?.query({ kind: 'image', folder: null, characterId: null, sceneId: null, locale: null, search: '', tags: [], reference: 'any', review: 'any', sort: 'name', direction: 'asc', offset: 0, limit: 100, indexRevision: null }).then(result => {
      if (released) return;
      if (!result.ok) { error.textContent = result.error.message; return; }
      for (const asset of result.value) { const option = document.createElement('option'); option.value = asset.id; option.textContent = asset.name; media.append(option); }
      media.value = references[0]?.assetId ?? '';
    });
    const error = document.createElement('p'); error.setAttribute('role', 'alert');
    media.addEventListener('change', () => { void (async () => {
      if (!media.value) { references = []; return; }
      const result = await target.resolveReference({ assetId: media.value }); if (released) return;
      if (result.ok) references = [result.value]; else error.textContent = result.error.message;
    })(); });
    const label = document.createElement('label'); label.textContent = '参考图 / Reference image'; label.append(media); form.append(label);
    const save = document.createElement('button'); save.type = 'button'; save.textContent = '保存制作输入 / Save production input';
    save.addEventListener('click', () => { void (async () => { save.disabled = true;
      const result = await target.commit({ expectedRevision: target.revision, fields: values as Record<string, Json>, references });
      if (released) return; save.disabled = false; error.textContent = result.ok ? '制作草稿已保存 / Draft saved' : result.error.message;
    })(); });
    form.append(save, error); root.append(form);
    return () => { released = true; form.remove(); };
  },
}] }), deactivate: async () => {} }; }
