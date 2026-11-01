import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// main/ and the bundled service/ both sit beside the actual application manifest.
export const studioVersion = JSON.parse(readFileSync(join(import.meta.dirname, '../package.json'), 'utf8')).version;
