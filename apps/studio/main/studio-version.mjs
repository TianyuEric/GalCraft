import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { studioApplicationRoot } from './application-root.mjs';

export const studioVersion = JSON.parse(readFileSync(join(studioApplicationRoot(), 'package.json'), 'utf8')).version;
