import { resolve } from 'node:path';
import { prepareModel, removeBackground } from './matting.mjs';

const [inputPath, outputDirectory, modelDirectory] = process.argv.slice(2).map(path => resolve(path));
if (!inputPath || !outputDirectory || !modelDirectory) throw new Error('Usage: node model-smoke.mjs input.png output-directory model-directory');
const model = await prepareModel(modelDirectory, { onState: state => process.stdout.write(`${JSON.stringify(state)}\n`) });
const output = await removeBackground(inputPath, outputDirectory, modelDirectory);
process.stdout.write(`${JSON.stringify({ model: { inputName: model.inputName, input: model.input,
  outputName: model.outputName, output: model.output, bytes: model.bytes }, output })}\n`);
