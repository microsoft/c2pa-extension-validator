/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */
import Browser from 'webextension-polyfill'
import { MESSAGE_SAMPLE } from './constants.js'

console.debug('background.js: load')

Browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.debug('background.js: install')
  } else if (details.reason === 'update') {
    console.debug('background.js: update')
  }
})

/*

  Having multiple listeners for the same event is not recommended.
  If we have a listener in offscreen.ts, we should remove this one.
  Whichever listener responds first will prevent receiving a response from the other.

*/
// Browser.runtime.onMessage.addListener(
//   async (request: MESSAGE_PAYLOAD, _sender) => {
//     if (request.action === MESSAGE_SAMPLE && request.data != null) {
//       console.debug(request.data)
//       return 'background.js: response'
//     }
//   }
// )

void (async () => {
  if (chrome.offscreen !== undefined) {
    if (await chrome.offscreen.hasDocument()) {
      return
    }

    await chrome.offscreen
      .createDocument({
        url: 'offscreen.html',
        reasons: [chrome.offscreen.Reason.DOM_PARSER],
        justification: 'Private DOM access to parse HTML'
      })
      .catch((error) => {
        console.error('Failed to create offscreen document', error)
      })
  }

  await loadData()
})()

async function loadData (): Promise<void> {
  try {
    let data = await Browser.storage.local.get('myData')

    if (data === undefined) {
      data = { myData: 'Hello, World!' }
      await Browser.storage.local.set(data)
    }
    await Browser.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Data',
      message: `Your data is: ${data.myData}`
    })
  } catch (error) {
    console.error(`An error occurred while reloading tabs: ${(error as Error)?.message}`)
  }
}
