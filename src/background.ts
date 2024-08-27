/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import 'c2pa'

import { validateUrl as c2paValidateUrl, validateBytes as c2paValidateBytes } from './c2paProxy'
import { init as initTrustlist, checkTrustListInclusion, refreshTrustLists, checkTSATrustListInclusion } from './trustlist'
import { type C2paError, type C2paResult } from './c2pa'
import {
  MSG_GET_ID, MSG_L3_INSPECT_URL, MSG_REMOTE_INSPECT_URL, MSG_FORWARD_TO_CONTENT, REMOTE_VALIDATION_LINK,
  MSG_VALIDATE_URL, AWAIT_ASYNC_RESPONSE, MSG_C2PA_RESULT_FROM_CONTEXT, AUTO_SCAN_DEFAULT, MSG_AUTO_SCAN_UPDATED,
  TRUSTLIST_UPDATE_INTERVAL,
  MSG_ACTIVE_TAB_CHANGED,
  MSG_VALIDATE_BYTES
} from './constants'
import { sendMessageToAllTabs } from './utils'

console.debug('Background: Script: start')

void initTrustlist()

chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason === 'install') {
    console.debug('This is a first-time install!')
    void chrome.storage.local.set({ autoScan: AUTO_SCAN_DEFAULT })
  } else if (details.reason === 'update') {
    console.debug('The extension has been updated to version:', chrome.runtime.getManifest().version)
  } else if (details.reason === 'chrome_update') {
    console.debug('Chrome has been updated.')
  }
  createContextMenu()
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const url = info.srcUrl
  if (url == null) {
    return
  }

  void validateUrl(url).then(c2paResult => {
    if (c2paResult instanceof Error) {
      console.error('Error validating URL:', c2paResult)
      return
    }
    const message = { action: MSG_C2PA_RESULT_FROM_CONTEXT, data: { url, c2paResult, frame: info.frameId } }
    if (tab?.id != null) {
      void chrome.tabs.sendMessage(tab.id, message)
    }
  })
})

chrome.webRequest.onBeforeRequest.addListener(
  function (details) {
    console.debug(`%cBackground: Intercepted image request: ${details.url}`, 'color: #2784BC;')
  },
  { urls: ['*://*/*.*'] }
)

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender?.tab?.id
  const action = message.action
  const data = message.data

  if (action === MSG_GET_ID) {
    sendResponse({ tab: tabId, frame: sender.frameId })
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
          void chrome.tabs.sendMessage(id, { action: MSG_REMOTE_INSPECT_URL, data })
        }, 1000)
      })
  }

  if (action === MSG_FORWARD_TO_CONTENT && tabId != null) {
    void chrome.tabs.sendMessage(tabId, data)
  }

  if (action === MSG_VALIDATE_URL) {
    void validateUrl(data as string).then(sendResponse)
    return AWAIT_ASYNC_RESPONSE
  }

  if (action === MSG_VALIDATE_BYTES) {
    void validateBytes(data as ArrayBuffer).then(sendResponse)
    return AWAIT_ASYNC_RESPONSE
  }

  if (action === MSG_AUTO_SCAN_UPDATED) {
    void chrome.storage.local.set({ autoScan: data })
    void sendMessageToAllTabs({ action: MSG_AUTO_SCAN_UPDATED, data })
  }

  // if (action === MSG_OPEN_SIDE_PANEL) {
  //   chrome.sidePanel.open({ tabId: 0 }, () => {
  //     console.log('Side panel opened.')
  //   })
  // }
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'trustListRefreshAlarm') {
    refreshTrustLists()
      .then(() => { console.debug('Trust lists refresh completed successfully.') })
      .catch((error) => { console.error('Error refreshing trust lists:', error) })
  }
})

chrome.runtime.onInstalled.addListener(() => {
  console.debug('Extension installed. Setting up trust list refresh alarm.')
  setupTrustListRefreshAlarm()
})

chrome.runtime.onStartup.addListener(() => {
  console.debug('Browser started. Ensuring trust list refresh alarm is active.')
  setupTrustListRefreshAlarm()
})

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    void chrome.runtime.sendMessage({ action: MSG_ACTIVE_TAB_CHANGED })
  })
})

function createContextMenu (): void {
  chrome.contextMenus.create({
    id: 'validateMediaElement',
    title: 'Inspect Content Credentials',
    contexts: ['audio', 'image', 'video'],
    documentUrlPatterns: ['<all_urls>']
  })
}

async function validateUrl (url: string): Promise<C2paResult | C2paError> {
  const c2paResult = await c2paValidateUrl(url)
  if (c2paResult instanceof Error) {
    return c2paResult
  }
  c2paResult.trustList = checkTrustListInclusion(c2paResult.certChain ?? [])

  if (c2paResult.tstTokens != null && c2paResult.tstTokens.length > 0) {
    const tstToken = c2paResult.tstTokens[0] // TODO: for each token
    c2paResult.tsaTrustList = checkTSATrustListInclusion(tstToken.certChain ?? [])
  }

  return c2paResult
}

async function validateBytes (bytes: ArrayBuffer): Promise<C2paResult | C2paError> {
  const c2paResult = await c2paValidateBytes(bytes)
  if (c2paResult instanceof Error) {
    return c2paResult
  }
  c2paResult.trustList = checkTrustListInclusion(c2paResult.certChain ?? [])
  return c2paResult
}

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

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/cr128.png',
    title: 'Content Credentials',
    message: 'Loaded'
  })
}

async function openOrSwitchToTab (url: string): Promise<chrome.tabs.Tab> {
  const openTabs = await chrome.tabs.query({ url: REMOTE_VALIDATION_LINK })

  let tab: chrome.tabs.Tab

  if (openTabs.length > 0) {
    tab = openTabs[0]
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await chrome.tabs.update(tab.id!, { active: true })
    if (tab.windowId != null) {
      await chrome.windows.update(tab.windowId, { focused: true })
    }
  } else {
    tab = await chrome.tabs.create({ url: REMOTE_VALIDATION_LINK })
  }

  return tab
}

// trust list refresh alarm (run once a day) TODO: create an option
function setupTrustListRefreshAlarm (): void {
  void chrome.alarms.create('trustListRefreshAlarm', { delayInMinutes: 1, periodInMinutes: TRUSTLIST_UPDATE_INTERVAL })
}

void init()

console.debug('Background: Script: end')
