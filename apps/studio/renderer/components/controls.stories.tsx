import { useState, useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Choice, Field, Modal } from './controls.js';
import { Input } from './ui/input.js';
import { useModalState } from './motion.js';
import { ShellHeader } from './shell-header.js';
import '../authoring/workspace.css';
import '../authoring/shell.css';

function LongDialog() {
  const [opened, setOpened] = useModalState(true), [selected, setSelected] = useState('model-2'), [saved, setSaved] = useState(false);
  return <div className="authoring-shell" style={{ padding: 32, minHeight: '100vh', display: 'block' }}>
    <div id="studio-portals" lang="zh-CN" />
    <Button onClick={() => setOpened(true)}>打开长表单</Button>{saved && <p role="status">配置已保存</p>}
    {opened && <Modal title="配置创作服务" close={() => setOpened(false)}><form onSubmit={event => { event.preventDefault(); setSaved(true); setOpened(false); }}>
      <Field label="模型"><Choice label="模型" value={selected} options={Array.from({ length: 18 }, (_, index) => ({ value: `model-${index}`, label: `创作模型 ${index + 1} · 长名称与多语言版本` }))} onChange={setSelected} /></Field>
      {Array.from({ length: 10 }, (_, index) => <Field key={index} label={`配置字段 ${index + 1}`} help="这是用于验证正文滚动与底部操作可达性的配置说明。"><Input defaultValue={`示例 ${index + 1}`} /></Field>)}
      <footer><Button onClick={() => setOpened(false)}>取消</Button><Button tone="primary" type="submit">保存配置</Button></footer>
    </form></Modal>}
  </div>;
}
const meta = { title: 'Components/Shared controls', component: LongDialog, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof LongDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ScrollableDialog: Story = {};

function HelpExample() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return <div data-theme="light">
  <div id="studio-portals" data-theme="light" lang="zh-CN"/>
  <div className="authoring-shell" data-theme="light" style={{ height: '100vh' }}><header className="authoring-header">
    {ready && <ShellHeader locale="zh-CN" theme="light" project="雨夜来信" dirty={false} action={() => {}} preferences={() => {}} collapsed={false} toggleSidebar={() => {}}/>}
  </header></div>
</div>;
}
export const TeachingAndKeyboardHelp: Story = { render: () => <HelpExample/> };
