/*
*  Copyright (c) Microsoft Corporation.
*  Licensed under the MIT license.
*/

import browser from 'webextension-polyfill'
import { MESSAGE_C2PA_INSPECT_URL } from './constants.js'
import { type MESSAGE_PAYLOAD } from './types.js'
import { validateUrl } from './c2pa.js'
import { logDebug } from './utils.js'

logDebug('Offscreen: Script: start')

browser.runtime.onMessage.addListener(
  // eslint-disable-next-line @typescript-eslint/promise-function-async
  (request: MESSAGE_PAYLOAD, _sender) => {
    if (request.action === 'tabid') {
      return Promise.resolve(_sender.tab?.id)
    }

    if (request.action === MESSAGE_C2PA_INSPECT_URL && request.data != null) {
      const url = request.data as string
      return validateUrl(url)
    }

    if (request.action === 'ping') {
      logDebug('Offscreen: ping ', _sender)
      return Promise.resolve()
    }

    return true // do not handle this request
  }
)

logDebug('Offscreen: Script: end')
