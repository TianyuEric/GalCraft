import { basename, dirname } from 'node:path';

/** Resolve the Studio root from main/ or service/, including local Vite outputs. */
export function studioApplicationRoot(directory = import.meta.dirname) {
  const parent = dirname(directory);
  const developmentOutput = (basename(directory) === 'main' && basename(parent) === 'dist-main')
    || (basename(directory) === 'service' && basename(parent) === 'dist-service');
  return developmentOutput ? dirname(parent) : parent;
}
