import { memo, useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import { actionIcon } from './action-icon.js';
import hljs from 'highlight.js/lib/core';
import json from 'highlight.js/lib/languages/json';
import css from 'highlight.js/lib/languages/css';
hljs.registerLanguage('json', json); hljs.registerLanguage('css', css);

const labels = (locale: string) => locale === 'en' ? ['Copy', 'Copied', 'Wrap lines', 'Expand', 'Collapse', 'Copy failed; select text to copy'] : locale === 'ja' ? ['コピー', 'コピー済み', '折り返し', '展開', '折りたたむ', 'コピーできません。本文を選択してください'] : ['复制', '已复制', '自动换行', '展开', '收起', '复制失败，请选中文字复制'];
const markup = (code: string, language: string) => hljs.getLanguage(language) ? hljs.highlight(code, { language }).value : null;
const pageLines = 160;
export const CodeBlock = memo(function CodeBlock({ code, language = 'json', locale = document.getElementById('studio-portals')?.lang || 'zh-CN', copyOnly = false }: { code: string; language?: string; locale?: string; copyOnly?: boolean }) {
  const [wrap, setWrap] = useState(true), [expanded, setExpanded] = useState(false), [message, setMessage] = useState('');
  const [page, setPage] = useState(0), lines = useMemo(() => code.split('\n'), [code]);
  const pages = Math.ceil(lines.length / pageLines), current = Math.min(page, pages - 1);
  const visible = useMemo(() => lines.slice(current * pageLines, (current + 1) * pageLines).join('\n'), [lines, current]);
  // A single very long line remains fully readable, without synchronous token expansion.
  const html = useMemo(() => visible.length <= 24000 ? markup(visible, language) : null, [visible, language]), t = labels(locale);
  const zh = locale !== 'en' && locale !== 'ja';
  return <section className={`gc-code-block ${wrap ? 'wrap' : ''} ${expanded ? 'expanded' : ''}`}>
    <header><span>{language.toUpperCase()}</span><span role="status">{message}</span>
      {!copyOnly && <button type="button" aria-pressed={wrap} onClick={() => setWrap(!wrap)}>{t[2]}</button>}
      {!copyOnly && <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? t[4] : t[3]}</button>}
      <button type="button" data-slot="button" aria-label={t[0]} title={t[0]} onClick={() => { void navigator.clipboard.writeText(code).then(() => setMessage(t[1]!), () => setMessage(t[5]!)); }}><Copy size={15}/></button></header>
    {pages > 1 && <nav className="gc-code-pages" aria-label={zh ? '代码分页' : locale === 'en' ? 'Code pages' : 'コードのページ'}>
      <button type="button" disabled={current === 0} onClick={() => setPage(current - 1)}>{zh ? '上一页' : locale === 'en' ? 'Previous' : '前へ'}</button>
      <span role="status">{current + 1} / {pages} · {current * pageLines + 1}–{Math.min((current + 1) * pageLines, lines.length)} / {lines.length} {zh ? '行' : locale === 'en' ? 'lines' : '行'}</span>
      <button type="button" disabled={current === pages - 1} onClick={() => setPage(current + 1)}>{zh ? '下一页' : locale === 'en' ? 'Next' : '次へ'}</button>
    </nav>}
    <pre tabIndex={0} aria-label={language.toUpperCase()} key={current}>{html === null ? <code>{visible}</code> : <code dangerouslySetInnerHTML={{ __html: html }} />}</pre>
  </section>;
});
export function codeBlock(code: string, language = 'json', locale = 'zh-CN'): HTMLElement {
  const root = document.createElement('section'); root.className = 'gc-code-block wrap';
  const header = document.createElement('header'), name = document.createElement('span'), status = document.createElement('span'); name.textContent = language.toUpperCase(); status.setAttribute('role', 'status'); header.append(name, status);
  const t = labels(locale), pre = document.createElement('pre'), content = document.createElement('code'); pre.tabIndex = 0;
  const lines = code.split('\n'), pages = Math.ceil(lines.length / pageLines); let page = 0;
  const draw = () => { const visible = lines.slice(page * pageLines, (page + 1) * pageLines).join('\n'); const html = visible.length <= 24000 ? markup(visible, language) : null;
    if (html === null) content.textContent = visible; else content.innerHTML = html; pre.scrollTop = 0; };
  draw();
  pre.append(content);
  pre.ariaLabel = language.toUpperCase();
  const wrap = document.createElement('button'), expand = document.createElement('button'), copy = document.createElement('button');
  const refresh = () => { wrap.textContent = t[2]!; wrap.ariaPressed = String(root.classList.contains('wrap'));
    expand.textContent = t[root.classList.contains('expanded') ? 4 : 3]!; expand.ariaExpanded = String(root.classList.contains('expanded')); };
  wrap.onclick = () => { root.classList.toggle('wrap'); refresh(); };
  expand.onclick = () => { root.classList.toggle('expanded'); refresh(); };
  copy.dataset.slot = 'button'; copy.ariaLabel = t[0]!; copy.title = t[0]!; copy.append(actionIcon('copy')); copy.onclick = () => { void navigator.clipboard.writeText(code).then(() => { status.textContent = t[1]!; }, () => { status.textContent = t[5]!; }); };
  for (const button of [wrap, expand, copy]) { button.type = 'button'; header.append(button); } refresh();
  root.append(header);
  if (pages > 1) {
    const nav = document.createElement('nav'), previous = document.createElement('button'), next = document.createElement('button'), position = document.createElement('span');
    nav.className = 'gc-code-pages'; nav.ariaLabel = locale === 'en' ? 'Code pages' : locale === 'ja' ? 'コードのページ' : '代码分页'; position.setAttribute('role', 'status');
    previous.type = next.type = 'button'; previous.textContent = locale === 'en' ? 'Previous' : locale === 'ja' ? '前へ' : '上一页'; next.textContent = locale === 'en' ? 'Next' : locale === 'ja' ? '次へ' : '下一页';
    const paging = () => { previous.disabled = page === 0; next.disabled = page === pages - 1; position.textContent = `${page + 1} / ${pages} · ${page * pageLines + 1}–${Math.min((page + 1) * pageLines, lines.length)} / ${lines.length}`; };
    previous.onclick = () => { page--; draw(); paging(); }; next.onclick = () => { page++; draw(); paging(); }; paging(); nav.append(previous, position, next); root.append(nav);
  }
  root.append(pre); return root;
}
