/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import resolve from '@rollup/plugin-node-resolve'
import replace from '@rollup/plugin-replace'
import terser from '@rollup/plugin-terser'
import 'dotenv/config'
import { ESLint } from 'eslint'
import path, { dirname } from 'path'
import copy from 'rollup-plugin-copy'
import nodePolyfills from 'rollup-plugin-node-polyfills'
import typescript from 'rollup-plugin-typescript2'
import { fileURLToPath } from 'url'

// Get the directory name when using ESM
// eslint-disable-next-line @typescript-eslint/naming-convention
const __dirname = dirname(fileURLToPath(import.meta.url))

/*
  - Build 2 bundles in the dist/chrome folder with supporting files:
    - background.js
    - content.js
    - popup.js
    - offscreen.js (conditional, for Chrome v3)
    - options.js (optional)

  - Copy the dist/chrome folder to dist/firefox

  - Copy the browser-specific manifest.json files to their respective folders

  Occasionally, when running rollup, you may get an error like this from rollup-plugin-typescript2:
  [!] (plugin rpt2) Error: EPERM: operation not permitted, rename

  Re-running rollup seems to fix it.
  I did not see a cause/solution at https://github.com/ezolenko/rollup-plugin-typescript2/issues

*/

const DEBUG = process.env.NODE_ENV?.toUpperCase() !== 'PRODUCTION'

const COPYRIGHT = `/*!
*  Copyright (c) Microsoft Corporation.
*  Licensed under the MIT license.
*/`

/*
  Common output options for each bundle
*/
const output = {
  // in debug, we want to see the sourcemap inline to let chrome dev tools debug through the original TS source
  // using separate source map files is blocked by chrome for some reason and requires user interaction to enable
  sourcemap: DEBUG ? 'inline' : false,
  // Put the webextension-polyfill code in a separate file
  // manualChunks: { "webextension-polyfill": ["webextension-polyfill"], },

  // TODO: don't add copyright to webextension-polyfill.js
  // TODO: for now this separate bundle will be webextension-polyfill, in the future it may contain additional polyfills
  chunkFileNames: 'chunk-[name]-[hash].js',

  // put a copyright banner at the top of the bundle
  banner: DEBUG ? undefined : COPYRIGHT
}

/*
  Files to watch for changes and recompile the bundle
*/
const watch = {
  include: ['src/**', '.env', 'public/**'],
  clearScreen: true
}

/*
  Common plugin options for each bundle
  - replace variables from .env with their values since the browser cannot access .env
  - bundle node modules (resolve)
  - convert commonjs modules to esm (commonjs)
  - minify the production bundle (terser)
  - compile typescript to javascript (typescript)
*/
const plugins = [
  replace({
    preventAssignment: true,
    ...Object.keys(process.env).reduce((acc, key) => {
      acc[`process.env.${key}`] = JSON.stringify(process.env[key])
      return acc
    }, {})
  }),
  json(),
  resolve({ browser: true }),
  commonjs(),
  nodePolyfills(),
  // minify the bundle in production
  !DEBUG &&
  terser({
    output: {
      comments: function (node, comment) {
        // remove all comment except those starting with '!'
        return comment.value.startsWith('!')
      }
    }
  }),
  typescript({ tsconfig: 'tsconfig.json' }),
  {
    /*
      This will allow the watch command to recompile the bundle when these files change.
      Rollup, by default, will only watch the entry file and its imports.
      Note: the files below must also be included in the watch.include paths array above
    */
    /** TODO: Add public folder */
    name: 'watch-json',
    buildStart () {
      [
        '.env',
        'src/manifest.chrome.v3.json',
        'src/manifest.firefox.v3.json',
        'public/offscreen.css',
        'public/offscreen.html',
        'public/options.css',
        'public/options.html',
        'public/popup.css',
        'public/popup.html'
      ].forEach((file) => {
        this.addWatchFile(path.resolve(__dirname, file))
      })
    }
  }
  // eslint()
]

/*
  Common error handler for each bundle
*/
const onwarn = (warning, warn) => {
  // suppress circular dependency warnings in production
  if (warning.code === 'CIRCULAR_DEPENDENCY' && !DEBUG) return
  warn(warning)
}

/*
  background.js
*/
const background = {
  input: ['src/background.ts', 'src/popup.ts', 'src/options.ts', 'src/offscreen.ts', 'src/overlayFrame.ts', 'src/webComponents.ts'],
  treeshake: { moduleSideEffects: [] },
  output: {
    dir: 'dist/chrome',
    format: 'esm',
    ...output
  },
  watch,
  plugins: [
    copy({
      targets: [
        { src: 'public/*', dest: 'dist/chrome' },
        { src: `node_modules/c2pa/dist/c2pa.worker${DEBUG ? '' : '.min'}.js`, dest: 'dist/chrome', rename: 'c2pa.worker.js' },
        { src: 'node_modules/c2pa/dist/assets/wasm/toolkit_bg.wasm', dest: 'dist/chrome' },
        { src: 'dist/chrome', dest: 'dist', rename: 'firefox' },
        { src: 'src/manifest.chrome.v3.json', dest: 'dist/chrome', rename: 'manifest.json' },
        { src: 'src/manifest.firefox.v3.json', dest: 'dist/firefox', rename: 'manifest.json' }
      ],
      // Wait for the bundle to be written to disk before copying the files, otherwise the firefox folder will be empty
      hook: 'writeBundle'
    }),
    ...plugins
  ],
  onwarn
}

/*
  content.js
*/
const content = {
  input: 'src/content.ts',
  treeshake: { moduleSideEffects: [] },
  output: {
    file: 'dist/chrome/content.js',
    format: 'iife', // always iife as this code is injected into the tab and not imported
    ...output
  },
  watch,
  plugins,
  onwarn
}

/*
  inject.js
*/
const inject = {
  input: 'src/inject.ts',
  treeshake: { moduleSideEffects: [] },
  output: {
    file: 'dist/chrome/inject.js',
    name: 'inject',
    format: 'iife', // always iife as this code is injected into the tab and not imported
    ...output
  },
  watch,
  plugins,
  onwarn
}

export default [background, content, inject]

// eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
function eslint (options = {}) {
  const eslint = new ESLint({ fix: true, ignore: false, ...options })
  return {
    name: 'rollup-plugin-eslint',
    async writeBundle () {
      const results = await eslint.lintFiles(['dist/chrome/**/*.js']) // Adjust the glob pattern to match your files
      await ESLint.outputFixes(results)
    }
  }
}
