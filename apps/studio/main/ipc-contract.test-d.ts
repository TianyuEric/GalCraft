import { createStudioHandlers } from './ipc-handlers.mjs';
import type { StudioHandlerContext } from './ipc-context.js';
declare const host: StudioHandlerContext;
const handlers = createStudioHandlers(host);
// @ts-expect-error Actual processing map rejects misspelled methods.
handlers.connections.tset({});
// @ts-expect-error The selected purpose and connection are required.
handlers.connections.test();
// @ts-expect-error A connection check cannot return a string Result.
handlers.connections.test = async () => ({ ok: true, value: 'wrong', warnings: [] });
// @ts-expect-error Missing required processing methods cannot satisfy the actual map.
const missing: typeof handlers.connections = { save: handlers.connections.save, list: handlers.connections.list };
void missing;
