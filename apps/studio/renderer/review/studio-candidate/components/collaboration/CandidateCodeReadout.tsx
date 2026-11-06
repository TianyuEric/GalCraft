import { useState } from 'react';
import { Copy } from 'lucide-react';
import { CandidateButton } from '../controls/index.js';
import './candidate-code-readout.css';

export function CandidateCodeReadout({ code, locale, language }: { code: string; locale: string; language?: string }) {
  const [feedback, setFeedback] = useState<'copied' | 'error'>();
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  return <div className="candidate-code-readout">
    <div className="candidate-code-tools">
      {language && <span>{language}</span>}
      {feedback && <span role={feedback === 'error' ? 'alert' : 'status'}>{feedback === 'copied'
        ? t('已复制', 'Copied', 'コピー済み') : t('无法复制，请选中文本后手动复制。', 'Select the text and copy it manually.', 'テキストを選択してコピーしてください。')}</span>}
      <CandidateButton onClick={async () => {
        try { await navigator.clipboard.writeText(code); setFeedback('copied'); }
        catch { setFeedback('error'); }
      }}><Copy size={13} aria-hidden="true"/>{t('复制代码', 'Copy code', 'コードをコピー')}</CandidateButton>
    </div>
    <pre tabIndex={0}><code>{code}</code></pre>
  </div>;
}
