import { useState, type AriaAttributes } from 'react';
import { Check, Copy } from 'lucide-react';

/** Read-only prose keeps the typography of the surrounding form. */
export function TextPreview({ text, locale = document.getElementById('studio-portals')?.lang || 'zh-CN', className = '', ...aria }: {
  text: string; locale?: string; className?: string; 'aria-label'?: string;
} & Pick<AriaAttributes, 'aria-describedby' | 'aria-invalid' | 'aria-required'>) {
  const [copied, setCopied] = useState(false), [error, setError] = useState('');
  const label = locale === 'en' ? 'Copy text' : locale === 'ja' ? '本文をコピー' : '复制文本';
  const status = copied ? locale === 'en' ? 'Copied' : locale === 'ja' ? 'コピー済み' : '已复制' : error;
  return <div className={`gc-text-preview ${className}`} {...aria}>
    <button type="button" className="gc-text-copy" title={label} aria-label={label} onClick={() => {
      void navigator.clipboard.writeText(text).then(() => { setCopied(true); setError(''); }, () => {
        setCopied(false); setError(locale === 'en' ? 'Select the text to copy' : locale === 'ja' ? '本文を選択してコピーしてください' : '请选中文字复制');
      });
    }}>{copied ? <Check size={15}/> : <Copy size={15}/>}</button>
    <div className="gc-text-preview-body" tabIndex={0}>{text ? text.split(/(\{\{[a-z_]+\}\})/gi).map((part, index) => /^\{\{[a-z_]+\}\}$/i.test(part) ? <code className="gc-template-variable" key={index}>{part}</code> : part) : <span className="gc-text-empty">{locale === 'en' ? 'Not provided' : locale === 'ja' ? '未設定' : '未填写'}</span>}</div>
    <span className={error ? 'gc-text-copy-error' : 'sr-only'} role="status">{status}</span>
  </div>;
}
