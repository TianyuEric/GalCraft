import { existsSync, globSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { UserConfig } from 'vite';

const studioDirectory = fileURLToPath(new URL('../', import.meta.url));
interface LocalReviewConfiguration {
  stories?: string[];
  vite?: string;
}

const absolute = (file: string) => resolve(studioDirectory, file).replaceAll('\\', '/');

export function formalStories(): string[] {
  return globSync('renderer/**/*.stories.tsx', {
    cwd: studioDirectory,
    exclude: ['renderer/stories/review/**', 'renderer/stories/candidates/**', 'renderer/review/**'],
  }).map(absolute);
}

// Only the explicit Review entry reads local extensions. Its source and dependencies
// remain outside the default Storybook discovery and Vite configuration.
export function loadReviewConfiguration() {
  const configuredPath = process.env.STORYBOOK_LOCAL_CONFIG;
  const configurationPath = configuredPath ? resolve(studioDirectory, configuredPath) : undefined;
  const local: LocalReviewConfiguration = configurationPath && existsSync(configurationPath)
    ? JSON.parse(readFileSync(configurationPath, 'utf8')) as LocalReviewConfiguration
    : {};
  return {
    stories: [
      ...globSync(['renderer/stories/review/**/*.stories.tsx', 'renderer/stories/candidates/**/*.stories.tsx', 'renderer/review/**/*.stories.tsx'], {
        cwd: studioDirectory,
        exclude: ['**/baseline/**'],
      }).map(absolute),
      ...(local.stories ?? []).map(file => resolve(dirname(configurationPath!), file).replaceAll('\\', '/')),
    ],
    async viteConfig(): Promise<UserConfig> {
      if (!local.vite || !configurationPath) return {};
      const module = await import(pathToFileURL(resolve(dirname(configurationPath), local.vite)).href);
      return typeof module.default === 'function' ? await module.default() : module.default;
    },
  };
}
