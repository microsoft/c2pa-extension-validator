/*
*  Copyright (c) Microsoft Corporation.
*  Licensed under the MIT license.
*/

import { c2pa } from './icon.js'

console.debug('content.js: load')

void (async () => {
  const images = document.images
  for (const img of Array.from(images)) {
    await c2pa(img)
  }
})()
