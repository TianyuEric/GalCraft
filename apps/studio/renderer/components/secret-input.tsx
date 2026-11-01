import { useEffect, useState } from 'react';
import type { InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from './controls.js';
import { Input } from './ui/input.js';
import './secret-input.css';

export function SecretInput({ resetKey, locale = 'zh-CN', ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  resetKey: string; locale?: string;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => setVisible(false), [resetKey]);
  const label = locale === 'en' ? visible ? 'Hide key' : 'Show key' : locale === 'ja' ? visible ? 'キーを隠す' : 'キーを表示' : visible ? '隐藏密钥' : '显示密钥';
  return <div className="gc-secret-input">
    <Input {...props} type={visible ? 'text' : 'password'} autoComplete="off" spellCheck={false}/>
    <Button tone="quiet" disabled={props.disabled} aria-label={label} title={label} aria-pressed={visible} onClick={() => setVisible(value => !value)}>
      {visible ? <EyeOff size={16}/> : <Eye size={16}/>}
    </Button>
  </div>;
}
