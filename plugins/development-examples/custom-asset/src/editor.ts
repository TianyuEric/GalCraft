import type { AssetEditorContribution, AssetPreviewContribution, Contributions, GalCraftPlugin } from '@galcraft/plugins/contracts';
import { validatePluginData } from '@galcraft/plugins/contracts';
import { id, kind, schema, type Shape } from './model.js';

const editor: AssetEditorContribution = { key: id + '/properties', assetType: kind, contexts: ['asset'], mount(root, context) {
  const t = (zh: string, en: string, ja: string) => context.locale === 'en' ? en : context.locale === 'ja' ? ja : zh;
  let value = structuredClone(context.value) as Shape;
  const colorLabel = document.createElement('label'), color = document.createElement('input'); color.type = 'text'; color.value = value.color;
  color.ariaLabel = t('填充颜色', 'Fill color', '塗りつぶし色'); colorLabel.append(color.ariaLabel, color);
  const vertices = document.createElement('div'), heading = document.createElement('h4'); heading.textContent = t('顶点', 'Vertices', '頂点');
  const error = document.createElement('p'); error.setAttribute('role', 'alert'); error.className = 'field-error';
  const draw = () => { vertices.replaceChildren(); value.vertices.forEach((vertex, index) => {
    const row = document.createElement('div'); row.className = 'asset-type-vertex';
    for (const axis of ['x', 'y'] as const) { const label = document.createElement('label'), input = document.createElement('input');
      input.type = 'number'; input.min = '0'; input.max = '1024'; input.step = 'any'; input.value = String(vertex[axis]); input.disabled = context.target.readonly;
      input.ariaLabel = `${t('顶点', 'Vertex', '頂点')} ${index + 1} ${axis.toUpperCase()}`; label.append(input.ariaLabel, input);
      input.oninput = () => { vertex[axis] = Number(input.value); }; row.append(label); }
    vertices.append(row);
  }); }; draw();
  const textureLabel = document.createElement('label'), texture = document.createElement('textarea'); texture.rows = 2;
  texture.ariaLabel = t('纹理引用（JSON 或 null）', 'Texture reference (JSON or null)', 'テクスチャ参照（JSON または null）'); texture.value = JSON.stringify(value.texture); textureLabel.append(texture.ariaLabel, texture);
  const apply = document.createElement('button'); apply.type = 'button'; apply.className = 'studio-button'; apply.textContent = t('应用类型属性', 'Apply type properties', '種類のプロパティを適用');
  apply.disabled = color.disabled = texture.disabled = context.target.readonly;
  apply.onclick = async () => { if (context.signal.aborted) return; error.textContent = '';
    try {
      const next: Shape = { ...value, color: color.value, texture: JSON.parse(texture.value) };
      const checked = validatePluginData(schema, next); if (!checked.ok) { error.textContent = checked.error.message; return; }
      apply.disabled = true; const result = await context.commit(next);
      if (context.signal.aborted) return;
      if (!result.ok) error.textContent = result.error.message; else value = structuredClone(next);
    } catch (reason) { if (!context.signal.aborted) error.textContent = String(reason); }
    finally { if (!context.signal.aborted) apply.disabled = context.target.readonly; }
  };
  root.append(colorLabel, heading, vertices, textureLabel, error, apply);
  return () => { apply.onclick = null; root.replaceChildren(); };
} };
const preview: AssetPreviewContribution = { key: id + '/preview', assetType: kind, mount(root, context) {
  const shape = context.variant.typeData?.value as Shape | undefined; if (!shape) throw new Error('Shape type data unavailable');
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512; canvas.style.width = '100%'; canvas.style.maxHeight = '320px'; canvas.style.objectFit = 'contain';
  canvas.setAttribute('role', 'img'); canvas.ariaLabel = context.name; canvas.dataset.shapePreview = '';
  const painter = canvas.getContext('2d'); if (!painter) throw new Error('Canvas unavailable');
  painter.fillStyle = shape.color; painter.beginPath(); shape.vertices.forEach((vertex, index) => { const x = vertex.x / 2, y = vertex.y / 2; index ? painter.lineTo(x, y) : painter.moveTo(x, y); }); painter.closePath(); painter.fill();
  if (!context.signal.aborted) root.append(canvas);
  return () => { canvas.width = canvas.height = 0; canvas.remove(); };
} };
export function createPlugin(): GalCraftPlugin { return { async activate(): Promise<Contributions> { return { commands: [], conditions: [], documents: [], tools: [], resources: [], stages: [], pages: [], components: [], systems: [], platform: [],
  assetEditors: [editor], assetPreviews: [preview], assetThumbnails: [{ ...preview, key: id + '/thumbnail' }] }; }, async deactivate() {} }; }
