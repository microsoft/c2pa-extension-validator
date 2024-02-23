/*
*  Copyright (c) Microsoft Corporation.
*  Licensed under the MIT license.
*/

import Browser from 'webextension-polyfill'
import { MESSAGE_SAMPLE } from './constants.js'

console.debug('content.js: load')

void (async () => {
  const response: unknown = await Browser.runtime.sendMessage({ action: MESSAGE_SAMPLE, data: 'content.js: message' })
  console.debug(response)
})()
