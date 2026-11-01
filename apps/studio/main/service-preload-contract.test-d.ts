import desktop from './service-preload.cjs';
import type { StudioDesktopBridge } from '../desktop-shell.js';

const consumer: StudioDesktopBridge = desktop;
void consumer;
// @ts-expect-error The actual preload accepts the supported Studio themes only.
desktop.setAppearance('sepia');
// @ts-expect-error The actual preload requires a help URL string.
desktop.openExternal();
// @ts-expect-error A method cannot return an incompatible result to the renderer.
const wrong: typeof desktop.openExternal = async () => 42;
void wrong;
