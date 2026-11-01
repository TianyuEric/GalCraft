import type { LocalFileDialog } from './renderer/browser-bridge.js';

/** The live Electron preload surface consumed by renderer/main.ts. */
export interface StudioDesktopBridge {
  openExternal(url: string): Promise<void>;
  setAppearance(theme: 'light' | 'dark'): Promise<void>;
  pathsForFiles(files: File[]): string[];
  chooseFiles(input: LocalFileDialog): Promise<{ canceled: boolean; filePaths?: string[]; filePath?: string }>;
  onDetach(callback: () => Promise<void>): () => void;
}
