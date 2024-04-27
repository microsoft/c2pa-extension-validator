/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import browser from 'webextension-polyfill'
import { init as initTrustList } from './trustlist'
import { MSG_GET_TAB_ID, MSG_L3_INSPECT_URL, MSG_REMOTE_INSPECT_URL, REMOTE_VALIDATION_LINK } from './constants'

console.debug('Background: Script: start')

browser.webRequest.onBeforeRequest.addListener(
  function (details) {
    console.debug('Background: Intercepted image request: ', details.url, 'color: #2784BC;')
  },
  { urls: ['*://*/*.jpg', '*://*/*.mp4'] }
)

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender?.tab?.id
  const action = message.action
  const data = message.data

  if (tabId == null || !Number.isInteger(tabId)) {
    return
  }

  if (action === MSG_GET_TAB_ID) {
    sendResponse(tabId)
  }

  if (action === MSG_L3_INSPECT_URL) {
    void openOrSwitchToTab(data as string)
      .then(async tab => {
        if (tab.id == null) {
          return
        }
        const id = tab.id
        // TODO: when the tab is newly created, the content script may not be ready to receive the message.
        // This is a temporary workaround to wait for the content script to be ready.
        // We should have the content script send a message to the background script when it is ready. Then we can remove this timeout.
        setTimeout(() => {
          console.debug('sendMessage:', { action: MSG_REMOTE_INSPECT_URL, data })
          void chrome.tabs.sendMessage(id, { action: MSG_REMOTE_INSPECT_URL, data })
        }, 1000)
      })
  }
})

void initTrustList()

async function init (): Promise<void> {
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

  await browser.notifications.create({
    type: 'basic',
    iconUrl: 'icons/cr128.png',
    title: 'Content Credentials',
    message: 'Loaded'
  })
}

async function openOrSwitchToTab (url: string): Promise<browser.Tabs.Tab> {
  const openTabs = await browser.tabs.query({ url: REMOTE_VALIDATION_LINK })

  let tab: browser.Tabs.Tab

  if (openTabs.length > 0) {
    tab = openTabs[0]
    await browser.tabs.update(tab.id, { active: true })
    if (tab.windowId != null) {
      await browser.windows.update(tab.windowId, { focused: true })
    }
  } else {
    tab = await browser.tabs.create({ url: REMOTE_VALIDATION_LINK })
  }

  return tab
}

void init()

console.debug('Background: Script: end')
