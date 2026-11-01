/// <reference types="vite/client" />
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import JsonWorker from 'monaco-editor/language/json/json.worker.js?worker';
import CssWorker from 'monaco-editor/language/css/css.worker.js?worker';
export function configureMonacoWorkers() {
 (self as typeof self & { MonacoEnvironment?: { getWorker(moduleId:string,label:string):Worker } }).MonacoEnvironment = { getWorker: (_moduleId,label) => label === 'json' ? new JsonWorker() : ['css','scss','less'].includes(label) ? new CssWorker() : new EditorWorker() };
}
