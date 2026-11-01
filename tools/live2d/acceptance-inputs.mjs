import { resolve } from 'node:path';

/** Real Cubism checks consume explicitly supplied SDKs and compatible licensed models. */
export function live2dAcceptanceInputs() {
  const required = name => {
    if (!process.env[name]) throw new Error(`Set ${name} to the explicitly selected local Live2D acceptance input.`);
    return resolve(process.env[name]);
  };
  return { sdk: required('GALCRAFT_LIVE2D_SDK'), motionSDK: required('GALCRAFT_LIVE2D_MOTION_SDK'),
    motionModel: required('GALCRAFT_LIVE2D_MOTION_MODEL'), expressionModel: required('GALCRAFT_LIVE2D_EXPRESSION_MODEL'),
    voice: required('GALCRAFT_LIVE2D_VOICE') };
}
