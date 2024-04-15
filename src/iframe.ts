/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import browser from 'webextension-polyfill'
import { type C2paResult } from './c2pa'
import { type C2paOverlay } from './webComponents'

export interface FrameMessage {
  secret: string
  action: string
  data: unknown
}

export interface ContentMessage {
  action: string
  data: unknown
}

export interface Parameters {
  name: string
}

const urlParams = new URLSearchParams(window.location.search)

console.debug('IFrame page load start')

let _tabId: number
let _frameId: string = '???'
let _frameSecret: string
let _initialized = false

const messageQueue: FrameMessage[] = []

window.addEventListener('message', function (event) {
  messageQueue.push(event.data as FrameMessage)
  console.debug(`IFrame: ${_frameId}: Message received:`, event.data)
  processMessageQueue()
})

function processMessageQueue (): void {
  if (!_initialized) {
    return
  }

  while (messageQueue.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const message = messageQueue.shift()!
    if (message.secret !== _frameSecret) {
      return
    }
    if (message.action === 'c2paResult') {
      const c2paResult: C2paResult = message.data as C2paResult

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const overlay: C2paOverlay = document.querySelector('c2pa-overlay')!
      overlay.c2paResult = c2paResult
      void sendMessageToContent({ action: 'updateFrame', data: document.documentElement.scrollHeight }, _tabId)
      console.debug(`IFrame ${_frameId} message received:`, c2paResult)
    }
    if (message.action === 'close') {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const overlay: C2paOverlay = document.querySelector('c2pa-overlay')!
      overlay.close()
    }
  }
}

async function init (): Promise<void> {
  _frameId = urlParams.get('id') ?? ''
  if (_frameId === null) {
    console.error('No id found')
    throw new Error('No id found')
  }
  const { [_frameId]: ids } = await browser.storage.local.get(_frameId)
  const [id, tabId] = ids.split(':') as [string, string]
  _frameSecret = ids
  _tabId = parseInt(tabId)
  console.debug('id currently is ' + id)
  await browser.storage.local.remove(_frameId)

  console.debug(`IFrame: ${id}: Message listener added`)
  _initialized = true
  processMessageQueue()
}

async function sendMessageToContent (message: ContentMessage, tabId: number): Promise<void> {
  console.debug('sendMessageToContent:', { ...message, frame: _frameId })
  await browser.tabs.sendMessage(tabId, { ...message, frame: _frameId })
}

document.addEventListener('DOMContentLoaded', () => {
  const collapsibleHeaders = document.querySelectorAll('.collapsible-header')

  collapsibleHeaders.forEach((header: Element) => {
    header.addEventListener('click', () => {
      const content = header.nextElementSibling as HTMLDivElement
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const icon = header.querySelector('.collapsible-icon')!

      // Collapse all sections except the one that was clicked
      collapsibleHeaders.forEach((otherHeader: Element) => {
        if (otherHeader !== header) {
          const otherContent = otherHeader.nextElementSibling as HTMLDivElement
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const otherIcon = otherHeader.querySelector('.collapsible-icon')!
          otherContent.style.maxHeight = ''
          otherIcon.textContent = '+'
          otherContent.classList.remove('expanded')
        }
      })

      // Toggle content visibility of the clicked header
      if (content.style.maxHeight.length > 0) {
        content.style.maxHeight = ''
        icon.textContent = '+'
      } else {
        content.style.maxHeight = `${content.scrollHeight}px`
        icon.textContent = '-'
      }
      content.classList.toggle('expanded')

      // Assuming _tabId is defined somewhere else in your TypeScript code.
      // Ensure the type and value of _tabId are correctly defined.
      // This function should also be defined elsewhere in your TypeScript code with proper typing.
      void sendMessageToContent({ action: 'updateFrame', data: document.documentElement.scrollHeight }, _tabId)
    })
  })
})

// Initialize ResizeObserver
const resizeObserver = new ResizeObserver(entries => {
  for (const entry of entries) {
    // Assuming we are only observing one element, the first entry is our target element
    // If entry.contentRect.height is different from your last known height, you can call onHeightChange
    // You may want to store the last known height if you only want to call the function on actual changes
    // onHeightChange(entry.target as HTMLElement)
    const newHeight = Math.floor(entry.contentRect.height)// + 5
    void sendMessageToContent({ action: 'updateFrame', data: newHeight }, _tabId)
  }
})

// Start observing an element
const elementToObserve = document.body
resizeObserver.observe(elementToObserve)

void init()

console.debug('IFrame page load end')
