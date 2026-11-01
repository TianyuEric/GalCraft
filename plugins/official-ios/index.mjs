import { fileURLToPath } from 'node:url';
export const packageDirectory = fileURLToPath(new URL('./package/', import.meta.url));
