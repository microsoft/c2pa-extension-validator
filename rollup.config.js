import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import terser from "@rollup/plugin-terser";
import { config } from "dotenv";
import path, { dirname } from 'path';
import copy from "rollup-plugin-copy";
import typescript from "rollup-plugin-typescript2";
import { fileURLToPath } from 'url';

// function getDirname(url) {
//   return dirname(fileURLToPath(url));
// }

// Usage
const __dirname = dirname(fileURLToPath(import.meta.url))

/*
  - Build 5 bundles in the dist/chrome folder with supporting files:
    - background.js
    - content.js
    - popup.js
    - offscreen.js (conditional, for Chrome v3)
    - options.js (optional)

  - Copy the dist/chrome folder to dist/firefox

  - Copy the browser-specific manifest.json files to their respective folders

  - Set the desired manifest version in the .env file

  Occasionally, when running rollup, you may get an error like this from rollup-plugin-typescript2:
  [!] (plugin rpt2) Error: EPERM: operation not permitted, rename

  Re-running rollup seems to fix it.
  I did not see a cause/solution at https://github.com/ezolenko/rollup-plugin-typescript2/issues

*/

// loads the .env file
config();

const isDebug = process.env.NODE_ENV !== "production";

const MANIFEST_VERSION = parseInt(process.env.MANIFEST_VERSION ?? "2");

const COPYRIGHT = `/*!\n*  Copyright (c) Microsoft Corporation.\n*  Licensed under the MIT license.\n*/`;

/*
  Common output options for all bundles
*/
const commonOutput = {
  // manifest v2 does not support esm imports/exports
  format: MANIFEST_VERSION === 3 ? "esm" : "iife",
  // in debug, we want to see the sourcemap inline to let chrome dev tools debug through the original TS source
  // using separate source map files did not work for me
  sourcemap: isDebug ? "inline" : false,
  // Put the webextension-polyfill code in a separate file
  manualChunks: MANIFEST_VERSION === 3 ? {
    "webextension-polyfill": ["webextension-polyfill"],
  } : {},
  chunkFileNames: "webextension-polyfill.js",
  // put a copyright banner at the top of the bundle
  banner: isDebug ? undefined : COPYRIGHT,
};

const watch = {
  include: ['src/**', '.env'],
  clearScreen: true
}

/*
  Common plugin options for all bundles
  - replace variables from .env with their values since the browser cannot access .env
  - bundle node modules (resolve)
  - convert commonjs modules to esm (commonjs)
  - minify the production bundle (terser)
  - compile typescript to javascript (typescript)
*/
const commonPlugins = [
  replace({
    preventAssignment: true,
    ...Object.keys(process.env).reduce((acc, key) => {
      acc[`process.env.${key}`] = JSON.stringify(process.env[key]);
      return acc;
    }, {}),
  }),
  json(),
  resolve({ browser: true }),
  commonjs(),
  // minify the bundle in production
  !isDebug &&
  terser({
    output: {
      comments: function (node, comment) {
        // remove all comment except those starting with '!'
        return comment.value.startsWith("!");
      },
    },
  }),
  typescript({
    tsconfig: "tsconfig.json",
    clear: false,
  }),
  {
    /*
      This will allow the watch command to recompile the bundle when these files change.
      Rollup, by default, will only watch the entry file and its imports.
      Note: the files below must also be included in the watch.include paths array above
    */
    name: 'watch-json',
    buildStart() {
      ['.env',
        'src/manifest.chrome.v2.json',
        'src/manifest.chrome.v3.json',
        'src/manifest.firefox.v2.json',
        'src/manifest.firefox.v3.json'
      ].forEach((file) => {
        this.addWatchFile(path.resolve(__dirname, file))
      })
    }
  }
];

/*
  Common error handler for all bundles
  - suppress circular dependency warnings in the production bundle
*/
const commonWarningHandler = (warning, warn) => {
  // suppress circular dependency warnings in production
  if (warning.code === "CIRCULAR_DEPENDENCY" && !isDebug) return;
  warn(warning);
};

/*
  background.js
*/
const background = {
  input: "src/background.ts",
  treeshake: {
    moduleSideEffects: [],
  },
  output: {
    dir: "dist/chrome",
    ...commonOutput,
  },
  watch,
  plugins: commonPlugins,
  onwarn: commonWarningHandler,
};

/*
  content.js
*/
const content = {
  input: "src/content.ts",
  treeshake: {
    moduleSideEffects: [],
  },
  output: {
    file: "dist/chrome/content.js",
    ...commonOutput,
    manualChunks: undefined,
    format: "iife", // always iife as this code is injected into the tab and not imported
  },
  watch,
  plugins: commonPlugins,
  onwarn: commonWarningHandler,
};

/*
  popup.js
*/
const popup = {
  input: "src/popup.ts",
  treeshake: {
    moduleSideEffects: [],
  },
  output: {
    dir: "dist/chrome",
    ...commonOutput,
  },
  watch,
  plugins: [
    copy({
      targets: [
        { src: "public/popup.html", dest: "dist/chrome" },
        { src: "public/popup.css", dest: "dist/chrome" },
      ],
    }),
    ...commonPlugins,
  ],
  onwarn: commonWarningHandler,
};

/*
  offscreen.js (for Chrome v3)
*/
const offscreen = {
  input: "src/offscreen.ts",
  treeshake: {
    moduleSideEffects: [],
  },
  output: {
    dir: "dist/chrome",
    ...commonOutput,
  },
  watch,
  plugins: [
    copy({
      targets: [{ src: "public/offscreen.html", dest: "dist/chrome" }],
    }),
    ...commonPlugins,
  ],
  onwarn: commonWarningHandler,
};

/*
  options.js
*/
const options = {
  input: "src/options.ts",
  treeshake: {
    moduleSideEffects: [],
  },
  output: {
    dir: "dist/chrome",
    ...commonOutput,
  },
  watch,
  plugins: [
    copy({
      targets: [
        { src: "public/options.html", dest: "dist/chrome" },
        { src: "public/options.css", dest: "dist/chrome" },
      ],
    }),
    ...commonPlugins,
  ],
  onwarn: commonWarningHandler,
};

/*
  When the chrome extension is built, we want to duplicate the dist/chrome folder and rename it to firefox
  Then we want to copy the browser-specific manifests to each folder
  We append this copy step to the end of the last bundle so all files are available to copy
*/
const duplicateFirefox = copy({
  targets: [
    { src: "public/icons", dest: "dist/chrome" },
    { src: "dist/chrome", dest: "dist", rename: "firefox" },
    {
      src: `src/manifest.chrome.v${MANIFEST_VERSION}.json`,
      dest: "dist/chrome",
      rename: "manifest.json",
    },
    {
      src: `src/manifest.firefox.v${MANIFEST_VERSION}.json`,
      dest: "dist/firefox",
      rename: "manifest.json",
    },
  ],
  // ensures the copy happens after the bundle is written so all files are available to copy
  hook: "writeBundle",
});

// append the duplicateFirefox plugin to the last bundle
options.plugins.push(duplicateFirefox);

// the order matters here
export default MANIFEST_VERSION === 3
  ? [background, content, offscreen, popup, options]
  : [background, content, popup, options];  /* v2 */
