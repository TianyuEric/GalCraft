/// <reference types="vite/client" />
import { useEffect, useRef, useState } from 'react';
import * as monaco from 'monaco-editor';
import { configureMonacoWorkers } from './monaco-workers.js';
import { Button } from './controls.js';
export function CodeEditor({ value, onChange, label, language = 'json', locale = 'zh-CN' }: { value: string; onChange(value: string): void; label: string; language?: string; locale?: string }) {
 const host = useRef<HTMLDivElement>(null), editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null), callback = useRef(onChange);
 const [error, setError] = useState(''); callback.current = onChange;
 useEffect(() => {
  configureMonacoWorkers();
  const instance = monaco.editor.create(host.current!, { value, language, ariaLabel: label, automaticLayout: true, minimap: { enabled: false }, wordWrap: 'on', fontSize: 13, fontFamily: "Consolas, 'Cascadia Code', 'Microsoft YaHei', monospace", scrollBeyondLastLine: false, theme: document.getElementById('studio-portals')?.dataset.theme === 'dark' ? 'vs-dark' : 'vs' });
  editor.current = instance;
  const changed = instance.onDidChangeModelContent(() => { setError(''); callback.current(instance.getValue()); });
  return () => { changed.dispose(); const model = instance.getModel(); instance.dispose(); model?.dispose(); editor.current = null; };
 }, [language, label]);
 useEffect(() => { if (editor.current && editor.current.getValue() !== value) editor.current.setValue(value); }, [value]);
 return <section className="gc-code-editor"><header><span>{label}</span>{language === 'json' && <Button tone="quiet" onClick={() => { try { callback.current(JSON.stringify(JSON.parse(editor.current?.getValue() ?? value), null, 2)); } catch { setError(locale === 'en' ? 'Invalid JSON. Check quotes, commas and brackets.' : locale === 'ja' ? 'JSON の引用符・カンマ・括弧を確認してください。' : 'JSON 格式有误，请检查引号、逗号和括号。'); } }}>{locale === 'en' ? 'Format JSON' : locale === 'ja' ? 'JSON を整形' : '格式化 JSON'}</Button>}</header><div ref={host}/>{error && <p role="alert" className="field-error">{error}</p>}</section>;
}
