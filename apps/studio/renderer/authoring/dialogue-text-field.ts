import { DialogueContentSchema, dialoguePlainText, dialogueSegments, replaceDialogueText, styleDialogueRange, type DialogueContent, type DialogueSegment } from '@galcraft/contracts';
import type { FieldCommit } from './portrait-model.js';
import './dialogue-text-field.css';

/** The Inspector edits literal prose and writes controlled segments only after a style action. */
export function dialogueTextField(value: unknown, locale: string, commit: FieldCommit): HTMLElement {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  let content: DialogueContent = DialogueContentSchema.safeParse(value).data ?? '';
  let selection = { start: 0, end: 0 };
  const root = document.createElement('section'); root.className = 'dialogue-text-editor';
  const text = document.createElement('textarea'); text.value = dialoguePlainText(content); text.rows = 5;
  text.ariaLabel = t('正文与片段选择', 'Text and fragment selection', '本文と範囲選択'); root.append(text);
  const help = document.createElement('p'); help.className = 'field-help'; help.textContent = t('在正文中选取片段，再设置注音或样式。普通文字保留原样。', 'Select text, then apply a reading or style. Plain text stays literal.', '本文の範囲を選んでルビやスタイルを適用します。'); root.append(help);
  const selected = document.createElement('p'); selected.className = 'field-help'; root.append(selected);
  const capture = () => { selection = { start: text.selectionStart, end: text.selectionEnd }; selected.textContent = selection.start < selection.end ? text.value.slice(selection.start, selection.end) : t('尚未选择片段', 'No fragment selected', '範囲を選択してください'); };
  text.addEventListener('select', capture); text.addEventListener('keyup', capture); text.addEventListener('pointerup', capture);
  text.addEventListener('input', () => { content = replaceDialogueText(content, text.value); capture(); draw(); });
  text.addEventListener('change', () => { void commit(content); });
  const fields = document.createElement('div'); fields.className = 'dialogue-text-controls'; root.append(fields);
  const field = (label: string, type: string) => { const node = document.createElement('label'); node.textContent = label; const input = document.createElement('input'); input.type = type; input.ariaLabel = label; node.append(input); fields.append(node); return input; };
  const ruby = field(t('注音', 'Ruby', 'ルビ'), 'text'), color = field(t('片段颜色', 'Fragment color', '文字色'), 'color'); color.value = '#ffffff';
  const size = field(t('片段字号', 'Fragment font size', '文字サイズ'), 'number'); size.min = '1'; size.placeholder = t('模板默认', 'Template default', 'テンプレート');
  const bold = field(t('粗体', 'Bold', '太字'), 'checkbox'), italic = field(t('斜体', 'Italic', '斜体'), 'checkbox');
  const error = document.createElement('p'); error.setAttribute('role', 'alert'); root.append(error);
  const apply = (style: Omit<Partial<DialogueSegment>, 'text'>) => {
    if (selection.start === selection.end) { error.textContent = t('请先在正文中选择片段。', 'Select a fragment in the text first.', '本文の範囲を選択してください。'); text.focus(); return; }
    const next = styleDialogueRange(content, selection.start, selection.end, style), checked = DialogueContentSchema.safeParse(next);
    if (!checked.success) { error.textContent = t('请填写有效的字号与样式。', 'Enter a valid font size and style.', '有効なサイズとスタイルを入力してください。'); return; }
    content = checked.data; error.textContent = ''; draw(); void commit(content);
  };
  const button = (label: string, action: () => void) => { const node = document.createElement('button'); node.type = 'button'; node.textContent = label; node.onclick = action; fields.append(node); };
  button(t('应用到所选片段', 'Apply to selection', '選択範囲に適用'), () => apply({ ruby: ruby.value || undefined, color: color.value, fontSize: size.value ? Number(size.value) : undefined, bold: bold.checked, italic: italic.checked }));
  button(t('恢复片段默认', 'Reset selection style', 'スタイルをリセット'), () => apply({ ruby: undefined, color: undefined, fontSize: undefined, bold: undefined, italic: undefined }));
  const preview = document.createElement('p'); preview.className = 'dialogue-text-preview'; preview.ariaLabel = t('文字样式预览', 'Text style preview', '文字スタイルのプレビュー'); root.append(preview);
  function draw() { preview.replaceChildren(...dialogueSegments(content).map(segment => {
    const span = document.createElement('span'); span.style.color = segment.color ?? ''; span.style.fontSize = segment.fontSize ? `${segment.fontSize}px` : ''; span.style.fontWeight = segment.bold ? '700' : ''; span.style.fontStyle = segment.italic ? 'italic' : '';
    if (segment.ruby) { const ruby = document.createElement('ruby'), rt = document.createElement('rt'); ruby.append(document.createTextNode(segment.text)); rt.textContent = segment.ruby; ruby.append(rt); span.append(ruby); } else span.textContent = segment.text; return span;
  })); }
  capture(); draw(); return root;
}
