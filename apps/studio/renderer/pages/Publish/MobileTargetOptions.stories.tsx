import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import type { WorkbenchBridge } from '../Production/bridge.js';
import { MobileTargetOptions, initialMobileOptions, type MobileBuildDraft } from './MobileTargetOptions.js';
import '../../authoring/shell.css';
const ok = <T,>(value: T) => ({ ok: true as const, value, warnings: [] });
function Example({ target = 'android', theme = 'light', missing = false, output }: { target?: 'android' | 'ios'; theme?: 'light' | 'dark'; missing?: boolean;output?:string }) {
  const identity = { key: `org.galcraft.${target}/build`, pluginId: `org.galcraft.${target}`, version: '0.1.0' };
  const [value, setValue] = useState<MobileBuildDraft>({ builder: missing ? null : identity, options: {...initialMobileOptions(target, 'Game01'),...(output?{output,signingMode:output==='aab'?'author':'test'}:{})} });
  const builds = { targets: async () => ok(missing ? [] : [{ builder: identity, description: { key: identity.key, version: '0.1.0', name: target === 'android' ? 'Android' : 'iOS', target, architectures: ['arm64'], tools: [], environments: [], entry: 'services/services.mjs', optionsSchema: {}, availability: { available: true, issues: [] } } }]),
    detectToolchain: async () => ok({ directory: 'D:/创作工具', javaHome: 'D:/创作工具/JDK', sdkRoot: 'D:/创作工具/SDK', cacheDirectory: 'D:/创作工具/Gradle' }),
    prepareToolchain: async () => ok({ directory: 'D:/创作工具', javaHome: 'D:/创作工具/JDK', sdkRoot: 'D:/创作工具/SDK', cacheDirectory: 'D:/创作工具/Gradle' }), cancelToolchain: async () => ok({ cancelled: true }),
  } as unknown as WorkbenchBridge['builds'];
  return <div id="app" className="authoring-shell" data-theme={theme} style={{ position:'relative',inset:'auto',minHeight: '100vh', height: 'auto', overflow: 'visible', padding: 24 }}><div style={{ width: 'min(480px, 100%)' }}><MobileTargetOptions target={target} value={value} onChange={setValue} builds={builds} chooseDirectory={async () => 'D:/创作工具'}/></div></div>;
}
const meta = { title: 'Product/Studio/Publish/Mobile targets', component: Example, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof Example>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Android: Story = { play: async ({ canvas }) => {
  await userEvent.click(await canvas.findByRole('button', { name: '选择工具目录' }));
  await expect(canvas.getByLabelText('工具下载位置')).toHaveValue('D:/创作工具');
  await expect(canvas.getByRole('button', { name: '准备环境' })).toBeDisabled();
  await userEvent.click(canvas.getByRole('checkbox'));
  await userEvent.click(canvas.getByRole('button', { name: '准备环境' }));
  await expect(canvas.findByText('环境可用')).resolves.toBeVisible();
} };
export const AndroidDark: Story = { args: { theme: 'dark' } };
export const AndroidProject:Story={args:{output:'androidProject'}};
export const AndroidProjectDark:Story={args:{output:'androidProject',theme:'dark'}};
export const AAB:Story={args:{output:'aab'}};
export const AABDark:Story={args:{output:'aab',theme:'dark'}};
export const IOS: Story = { args: { target: 'ios' } };
export const MissingBuilder: Story = { args: { missing: true } };
