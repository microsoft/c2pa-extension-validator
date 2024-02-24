/*
*  Copyright (c) Microsoft Corporation.
*  Licensed under the MIT license.
*/

import Browser from 'webextension-polyfill'
import { MESSAGE_C2PA_INSPECT_URL } from './constants.js'

console.debug('content.js: load')

setTimeout(() => {
  const images = document.images
  const imageUrls = Array.from(images).map((img) => img.src)

  Browser.runtime.sendMessage({ action: MESSAGE_C2PA_INSPECT_URL, data: imageUrls[0] })
    .then((result) => {
      if (result != null) {
        console.log(JSON.stringify(result.manifestStore?.activeManifest, null, 2))
      } else {
        console.log('Null result')
      }
    })
    .catch((error) => {
      console.error('Error sending message:', error)
    })
}, 1000)
