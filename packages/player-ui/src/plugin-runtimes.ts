import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import * as jsxDevRuntime from 'react/jsx-dev-runtime';
import * as reactDom from 'react-dom';
import * as reactDomClient from 'react-dom/client';
import { sharedPixi } from '@galcraft/stage';

/** Install the application's shared instances before importing external runtime entries. */
export function installPluginRuntimes() {
  Object.assign(globalThis, { __GalCraftPixi__: sharedPixi, __GalCraftReact__: React, __GalCraftReactJsxRuntime__: jsxRuntime,
    __GalCraftReactJsxDevRuntime__: jsxDevRuntime, __GalCraftReactDom__: reactDom, __GalCraftReactDomClient__: reactDomClient });
}
