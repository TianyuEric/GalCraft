#!/usr/bin/env node
import { resolve } from 'node:path';
import { buildPlugin, checkPlugin, createPluginProject, packPlugin } from './index.js';
import type { PluginTemplate } from './index.js';

const [command, directory = '.', ...args] = process.argv.slice(2);
try {
  if (command === 'create') {
    const id = args[0] ?? 'org.example.plugin', template = args[1] ?? 'author-tool';
    if (!['author-tool', 'game-system', 'resource-stage', 'service-provider', 'complete'].includes(template)) throw new Error('Unknown template');
    console.log(JSON.stringify(await createPluginProject({ directory, id, template: template as PluginTemplate }), null, 2));
  } else if (command === 'build') {
    const result = await buildPlugin(directory); console.log(JSON.stringify(result, null, 2));
    if (result.issues.some(item => item.severity === 'error')) process.exitCode = 1;
  } else if (command === 'check') {
    const issues = await checkPlugin(resolve(directory)); console.log(JSON.stringify({ issues }, null, 2));
    if (issues.some(item => item.severity === 'error')) process.exitCode = 1;
  } else if (command === 'pack') {
    const result = await packPlugin(resolve(directory), resolve(args[0] ?? 'dist')); console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } else throw new Error('Usage: galcraft-plugin create <dir> <pluginId> [template] | build <project> | check <package> | pack <package> [output]');
} catch (error) { console.error(String(error)); process.exitCode = 1; }
