import { existsSync, globSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { UserConfig } from 'vite';

const studioDirectory = fileURLToPath(new URL('../', import.meta.url));
interface LocalReviewConfiguration {
  stories?: string[];
  vite?: string;
}

// Optional local review extensions own their dependencies and source material.
// A normal checkout never imports or scans an extension's implementation.
const configuredPath = process.env.STORYBOOK_LOCAL_CONFIG;
const configurationPath = configuredPath ? resolve(studioDirectory, configuredPath) : undefined;
const local: LocalReviewConfiguration = configurationPath && existsSync(configurationPath)
  ? JSON.parse(readFileSync(configurationPath, 'utf8')) as LocalReviewConfiguration
  : {};

export const reviewStories = [
  ...globSync('renderer/**/*.stories.tsx', {
    cwd: studioDirectory,
    exclude: ['renderer/stories/review/**/baseline/**', '**/PropertyComparison.stories.tsx', '**/TreeComparison.stories.tsx'],
  }).map(file => resolve(studioDirectory, file).replaceAll('\\', '/')),
  ...(local.stories ?? []).map(file => resolve(dirname(configurationPath!), file).replaceAll('\\', '/')),
];

export async function localReviewViteConfig(): Promise<UserConfig> {
  if (!local.vite || !configurationPath) return {};
  const module = await import(pathToFileURL(resolve(dirname(configurationPath), local.vite)).href);
  return typeof module.default === 'function' ? await module.default() : module.default;
}
