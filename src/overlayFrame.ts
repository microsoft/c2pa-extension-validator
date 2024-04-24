/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { type C2paResult } from './c2pa'
import { AWAIT_ASYNC_RESPONSE, MSG_DISPLAY_C2PA_OVERLAY, MSG_FRAME_CLICK, MSG_UPDATE_FRAME_HEIGHT, MSG_VALIDATE_URL } from './constants'
import { deserialize } from './serialize'
import { type C2paOverlay } from './webComponents'

console.debug('%cFRAME:', 'color: blue', window.location.href)

export interface FrameMessage {
  secret: string
  action: string
  data: unknown
}

let _overlay: C2paOverlay
let _tabId = -1

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  /*
    Populate the IFrame with C2PA validation results for a media element.
  */
  _tabId = _tabId === -1 ? (sender.tab?.id ?? -1) : _tabId
  if (_tabId === -1) {
    return AWAIT_ASYNC_RESPONSE
  }

  if (message.action === MSG_FRAME_CLICK) {
    void sendToContent({ action: MSG_FRAME_CLICK, data: null })
    sendResponse({ status: 'OK' })
  }

  if (message.action === MSG_VALIDATE_URL) {
    const c2paResult = deserialize(message.data.c2paResult) as C2paResult
    const position = message.data.position as { x: number, y: number }
    _overlay.c2paResult = c2paResult
    void sendToContent({ action: MSG_DISPLAY_C2PA_OVERLAY, data: { position } })
    sendResponse({ status: 'OK' })
  }

  return AWAIT_ASYNC_RESPONSE
})

document.addEventListener('DOMContentLoaded', () => {
})

// DOMContentLoaded is too early to access c2pa-overlay, so we wait for window.onload
window.onload = () => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  _overlay = document.querySelector('c2pa-overlay')!
  resizeObserver.observe(document.body)
}

const resizeObserver = new ResizeObserver(entries => {
  // We are only observing the body element, so expect only one entry
  for (const entry of entries) {
    const newHeight = Math.floor(entry.contentRect.height)
    void sendToContent({ action: MSG_UPDATE_FRAME_HEIGHT, data: newHeight })
  }
})

async function sendToContent (message: unknown): Promise<unknown> {
  return await chrome.tabs.sendMessage(_tabId, message)
}
