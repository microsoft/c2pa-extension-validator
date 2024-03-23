/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */
import browser from 'webextension-polyfill'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { type MESSAGE_PAYLOAD } from './types'
import { logDebug, logError, logWarn } from './utils'
import { loadTrustList } from './trustlist'

logDebug('Background: Script: start')

browser.runtime.onInstalled.addListener((details) => {
  logDebug('Background: Event: onInstalled: ', details.reason)
})

browser.webRequest.onBeforeRequest.addListener(
  function (details) {
    logDebug('Background: Intercepted image request: ', details.url)
    // You can perform actions here based on the request URL or other details.
    // For example, redirect the request, block it, etc.
  },
  { urls: ['*://*/*.jpg', '*://*/*.mp4'] }
)

/*
  Having multiple listeners in the background script requires special handling.
  When using the webextension-polyfill with multiple listeners, we must use the following form:
  (Don't use the async keyword in the listener function.)

  browser.runtime.onMessage.addListener(
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    (request: MESSAGE_PAYLOAD, _sender) => {
      if (request.action === 'test2') {
        return Promise.resolve(123) // must return a promise
      }
      return true // do not handle this request; allow the next listener to handle it
    }
  )
*/

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
        logError('Failed to create offscreen document', error)
      })
  }
  await browser.notifications.create({
    type: 'basic',
    iconUrl: 'icons/cr128.png',
    title: 'Content Credentials',
    message: 'Loaded'
  })
  await loadTrustList()
})()

// async function loadData (): Promise<void> {
//   try {
//     let data = await browser.storage.local.get('myData')
//     if (data === undefined) {
//       data = { myData: 'Hello, World!' }
//       await browser.storage.local.set(data)
//     }
//     await browser.notifications.create({
//       type: 'basic',
//       iconUrl: 'icons/cr128.png',
//       title: 'Data',
//       message: `Your data is: ${data.myData}`
//     })
//   } catch (error) {
//     logError(`An error occurred while reloading tabs: ${(error as Error)?.message}`)
//   }
// }

/*

  Below are examples of other event listeners that can be used in the background script.

*/

// Requires "tabs"
browser.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  logDebug(`Background: Event: tabs.onUpdated.addListener: Tab ${tabId} update: ${JSON.stringify(changeInfo)}`)
})

// Requires "tabs"
browser.tabs.onCreated.addListener(function (tab) {
  logDebug(`Background: Event: tabs.onCreated.addListener: Tab ${tab.id} created`)
})

// Requires "webNavigation" permission and host permissions for the specified URL patterns.
// Requires "tabs"
browser.webNavigation.onCompleted.addListener(function (details) {
  browser.tabs.get(details.tabId).then(tab => {
    logDebug(`Background: Event: webNavigation.onCompleted: Tab ${details.tabId} has fully loaded. URL: ${tab.url}`)
  }).catch(error => {
    logWarn(`Error fetching tab details: ${error}`, details.url)
  })
}, { url: [{ urlMatches: 'http://*/*' }, { urlMatches: 'https://*/*' }] })

// Requires "tabs"
browser.tabs.onActivated.addListener(activeInfo => {
  browser.tabs.get(activeInfo.tabId).then(tab => {
    logDebug(`Background: Event: tabs.onActivated: Tab ${tab.id} in the active tab. URL: ${tab.url}`)
  }).catch(error => {
    logError(`Error fetching tab details: ${error}`)
  })
})

logDebug('Background: Script: end')
