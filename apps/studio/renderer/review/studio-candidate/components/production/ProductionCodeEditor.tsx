/// <reference types="vite/client" />
import { useEffect, useRef, useState } from 'react';
import * as monaco from 'monaco-editor';
import { configureMonacoWorkers } from '../../../../components/monaco-workers.js';
import { CandidateButton, CandidateToolbar } from '../controls/index.js';
import { productionText } from './ProductionControls.js';

export function ProductionCodeEditor({ value, onChange, label, language = 'json', locale = 'zh-CN' }: {
  value: string; onChange(value: string): void; label: string; language?: string; locale?: string;
}) {
  const host = useRef<HTMLDivElement>(null), editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null), callback = useRef(onChange);
  const [error, setError] = useState('');
  callback.current = onChange;
  useEffect(() => {
    configureMonacoWorkers();
    const instance = monaco.editor.create(host.current!, {
      value, language, ariaLabel: label, automaticLayout: true, minimap: { enabled: false }, wordWrap: 'on', fontSize: 13,
      fontFamily: "Consolas, 'Cascadia Code', 'Microsoft YaHei', monospace", scrollBeyondLastLine: false,
      theme: host.current?.closest<HTMLElement>('[data-theme]')?.dataset.theme === 'dark' ? 'vs-dark' : 'vs',
    });
    editor.current = instance;
    const change = instance.onDidChangeModelContent(() => { setError(''); callback.current(instance.getValue()); });
    return () => { change.dispose(); const model = instance.getModel(); instance.dispose(); model?.dispose(); editor.current = null; };
  }, [language, label]);
  useEffect(() => { if (editor.current && editor.current.getValue() !== value) editor.current.setValue(value); }, [value]);
  const format = () => {
    try { callback.current(JSON.stringify(JSON.parse(editor.current?.getValue() ?? value), null, 2)); setError(''); }
    catch { setError(productionText(locale, 'JSON 格式有误，请检查引号、逗号和括号。', 'Invalid JSON. Check quotes, commas and brackets.', 'JSON の引用符・カンマ・括弧を確認してください。')); }
  };
  return <section className="candidate-production-code-editor">
    <CandidateToolbar label={label}>
      <span>{label}</span>
      {language === 'json' && <CandidateButton variant="ghost" onClick={format}>{productionText(locale, '格式化 JSON', 'Format JSON', 'JSON を整形')}</CandidateButton>}
    </CandidateToolbar>
    <div ref={host} className="candidate-production-monaco"/>
    {error && <p role="alert" className="candidate-production-error">{error}</p>}
  </section>;
}
