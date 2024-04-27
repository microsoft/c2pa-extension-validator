/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { type C2paResult } from './c2pa'
import { MSG_DISPLAY_C2PA_OVERLAY, MSG_FRAME_CLICK, MSG_FORWARD_TO_CONTENT, MSG_UPDATE_FRAME_HEIGHT, MSG_VALIDATE_URL } from './constants'
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
    return
  }

  if (message.action === MSG_FRAME_CLICK) {
    sendToContent({ action: MSG_FRAME_CLICK, data: null })
  }

  if (message.action === MSG_VALIDATE_URL) {
    const c2paResult = deserialize(message.data.c2paResult) as C2paResult
    const position = message.data.position as { x: number, y: number }
    _overlay.c2paResult = c2paResult
    sendToContent({ action: MSG_DISPLAY_C2PA_OVERLAY, data: { position } })
  }
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
    sendToContent({ action: MSG_UPDATE_FRAME_HEIGHT, data: newHeight })
  }
})

function sendToContent (message: unknown): void {
  if (_tabId === -1 || typeof chrome.tabs === 'undefined') {
    void chrome.runtime.sendMessage({ action: MSG_FORWARD_TO_CONTENT, data: message })
    return
  }
  void chrome.tabs.sendMessage(_tabId, message)
}
