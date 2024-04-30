/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { type C2paError, type C2paResult } from './c2pa'
import { type MediaElement } from './content'
import { CrIcon } from './icon'
import { deserialize, serialize } from './serialize'
import { checkTrustListInclusion } from './trustlistProxy'
import { blobToDataURL } from './utils'
import {
  MSG_VALIDATE_URL, MSG_CHILD_REQUEST, MSG_FRAME_CLICK, MSG_GET_CONTAINER_OFFSET, MSG_PARENT_RESPONSE,
  MSG_REQUEST_C2PA_ENTRIES, MSG_RESPONSE_C2PA_ENTRIES, MSG_TRUSTLIST_UPDATE, MSG_OPEN_OVERLAY,
  type VALIDATION_STATUS, MSG_FORWARD_TO_CONTENT
} from './constants'

console.debug('%cFRAME:', 'color: magenta', window.location)

export interface Rect {
  x: number
  y: number
  width: number
  height: number
  top: number
  right: number
  bottom: number
  left: number
}

const topLevelFrame = window === window.top
let messageCounter = 0
const media = new Map<MediaElement, { validation: C2paResult, icon: CrIcon, status: VALIDATION_STATUS }>()

if (window.location.href.startsWith('chrome-extension:') || window.location.href.startsWith('moz-extension:')) {
  throw new Error('Ignoring extension IFrame')
}

window.addEventListener('message', (event) => {
  const message = event.data
  if (message.type === MSG_CHILD_REQUEST) {
    if (event.source == null) {
      throw new Error('event.source is null')
    }
    const sender = findChildFrame(event.source)
    if (sender === null) {
      return // not from a child frame
    }
    const payload = message.data
    if (payload?.type === MSG_GET_CONTAINER_OFFSET) {
      const contentWindow = sender.contentWindow
      if (contentWindow === null) {
        throw new Error('contentWindow is null')
      }
      void getParentOffset().then((parentOffsets) => {
        const senderRect = sender.getBoundingClientRect()
        const combinedOffset = combineOffsets(senderRect, parentOffsets)
        contentWindow.postMessage({ type: MSG_PARENT_RESPONSE, data: combinedOffset, id: message.id }, event.origin)
      })
    }
  }
})

function findChildFrame (sender: MessageEventSource): HTMLIFrameElement | null {
  const childIFrames = Array.from(document.querySelectorAll('iframe'))
  for (const iframe of childIFrames) {
    const contentWindow = iframe.contentWindow
    if (contentWindow === null) {
      throw new Error('contentWindow is null')
    }
    if (sender === contentWindow) {
      return iframe
    }
  }
  // child frames not found, look for shadow roots
  const divs = Array.from(document.getElementsByTagName('div'))
  const shadowRoots = divs.filter(div => div.shadowRoot != null) as HTMLElement[]
  for (const shadowRoot of shadowRoots) {
    const iFrames = Array.from(shadowRoot.shadowRoot?.querySelectorAll('iframe') ?? [])
    for (const iframe of iFrames) {
      const contentWindow = iframe.contentWindow
      if (contentWindow === null) {
        throw new Error('contentWindow is null')
      }
      if (sender === contentWindow) {
        return iframe
      }
    }
  }

  return null
}

async function postWithResponse <T> (message: unknown): Promise<T> {
  return await new Promise((resolve) => {
    const counter = messageCounter++
    const listener = (event: MessageEvent): void => {
      if (event.data.id === counter && event.data.type === MSG_PARENT_RESPONSE && event.source === window.parent) {
        resolve(event.data.data as T)
        window.removeEventListener('message', listener)
      }
    }
    window.addEventListener('message', listener)
    window.parent.postMessage({ type: MSG_CHILD_REQUEST, data: message, id: counter, src: document.location.href }, '*')
  })
}

function addMediaElement (mediaElement: MediaElement): void {
  if (mediaElement.src.startsWith('chrome-extension:') || mediaElement.src.startsWith('moz-extension:')) return
  if (mediaElement instanceof HTMLVideoElement) {
    void validateMediaElement(mediaElement)
  }
  if (mediaElement instanceof HTMLImageElement) {
    // The image my not be loaded yet
    if (mediaElement.complete) {
      void validateMediaElement(mediaElement)
    } else {
      mediaElement.addEventListener('load', () => {
        void validateMediaElement(mediaElement)
      })
    }
  }
}

async function validateMediaElement (mediaElement: MediaElement): Promise<void> {
  const source = mediaElement.currentSrc ?? mediaElement.src
  if (source == null || source === '') {
    console.debug('MediaElement lacks src')
    return
  }
  const c2paResult = await c2paValidateImage(source)
  if (c2paResult instanceof Error) {
    console.error('Error validating image:', c2paResult)
    return
  }
  if (c2paResult.manifestStore == null) {
    console.debug('Content: No C2PA manifest found:', source)
    return
  }
  let validationStatus: VALIDATION_STATUS = 'success'
  if (c2paResult.manifestStore.validationStatus.length > 0) {
    validationStatus = 'error'
  } else if (c2paResult.trustList == null) {
    validationStatus = 'warning'
  }
  const c2paIcon = new CrIcon(mediaElement, validationStatus)
  c2paIcon.onClick = async () => {
    const offsets = await getOffsets(mediaElement)
    sendToContent({
      action: MSG_OPEN_OVERLAY,
      data: { c2paResult: await serialize(c2paResult), position: { x: offsets.x + offsets.width, y: offsets.y } }
    })
  }

  media.set(mediaElement, { validation: c2paResult, icon: c2paIcon, status: validationStatus })
}

function removeMediaElement (mediaElement: MediaElement): void {
  console.debug('%cMedia element removed:', 'color: #FF1010', mediaElement.src)
  const c2paImage = media.get(mediaElement)
  if (c2paImage != null) {
    c2paImage.icon.remove()
    media.delete(mediaElement)
  }
}

function updateMediaElement (mediaElement: MediaElement, oldValue: string): void {
  removeMediaElement(mediaElement)
  addMediaElement(mediaElement)
}

function findMediaElements (parentNode: HTMLElement, handler: (mediaElement: MediaElement) => void): void {
  const mediaElements = Array.from((parentNode).querySelectorAll<MediaElement>('img, video'))
  if (parentNode.nodeName === 'IMG' || parentNode.nodeName === 'VIDEO') {
    mediaElements.unshift(parentNode as MediaElement)
  }
  mediaElements.forEach(mediaElement => {
    handler(mediaElement)
  })
}

function processElements (nodeList: Node[], handler: (mediaElement: MediaElement) => void): void {
  nodeList.forEach(parentNode => {
    if (parentNode.nodeType === Node.ELEMENT_NODE) {
      findMediaElements(parentNode as HTMLElement, handler)
    }
  })
}

async function getParentOffset (): Promise<Rect> {
  if (topLevelFrame) {
    return {
      x: 0,
      y: 0,
      width: window.innerWidth,
      height: window.innerHeight,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
      left: 0
    }
  }
  return await postWithResponse<DOMRect>({ type: MSG_GET_CONTAINER_OFFSET })
}

async function getOffsets (element: HTMLElement): Promise<Rect> {
  const parentOffset = await getParentOffset()
  const mediaElementOffset = element.getBoundingClientRect()
  const combinedOffset = combineOffsets(mediaElementOffset, parentOffset)
  return combinedOffset
}

function combineOffsets (offset: Rect, parent: Rect): Rect {
  try {
    return {
      x: offset.x + parent.x,
      y: offset.y + parent.y,
      width: offset.width,
      height: offset.height,
      top: offset.top + parent.top,
      right: offset.right + parent.right,
      bottom: offset.bottom + parent.bottom,
      left: offset.left + parent.left
    }
  } catch (error) {
    throw new Error('Error combining offsets')
  }
}

async function c2paValidateImage (url: string): Promise<C2paResult | C2paError> {
  const result = await chrome.runtime.sendMessage({ action: MSG_VALIDATE_URL, data: url }).catch((error) => {
    console.error('Error sending message:', error)
    return new Error('Error sending message') as C2paError
  })
  if (result instanceof Error) {
    return result as C2paError
  }
  return deserialize(result) as C2paResult
}

document.addEventListener('DOMContentLoaded', function () {
  console.debug('%cLOAD:', 'color: brown', document)
  findMediaElements(document.body, addMediaElement)
  const observer = new MutationObserver((mutationsList: MutationRecord[]) => {
    mutationsList.forEach(mutation => {
      if (mutation.addedNodes.length > 0) {
        processElements(Array.from(mutation.addedNodes), addMediaElement)
      }
      if (mutation.removedNodes.length > 0) {
        processElements(Array.from(mutation.removedNodes), removeMediaElement)
      }
      if (mutation.type === 'attributes') {
        if (mutation.target.nodeName !== 'IMG' && mutation.target.nodeName !== 'VIDEO') return
        if (mutation.attributeName === 'src') {
          updateMediaElement(mutation.target as MediaElement, mutation.oldValue ?? '')
        }
      }
    })
  })
  observer.observe(
    document.body,
    { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] /*, attributeOldValue: true */ })
})

/*
  Detect clicks within this frame and notify the content script. This is used to hide the overlay.
  When the overlay is displayed, the user can click anywhere on the page to hide the overlay.
  However when the user clicks within an IFrame, no click event occurs in the main window.

  The overlayFrame listens for this message and forwards it to the content script.
*/
document.addEventListener('click', (event) => {
  sendToContent({ action: MSG_FRAME_CLICK, data: null })
})

export interface MSG_RESPONSE_C2PA_ENTRIES_PAYLOAD {
  name: string
  status: VALIDATION_STATUS
  thumbnail: string | null
}

function updateTrustLists (): void {
  for (const [, c2paResult] of media.entries()) {
    if (c2paResult.validation.certChain != null) {
      void checkTrustListInclusion(c2paResult.validation.certChain).then((trustListMatch) => {
        if (c2paResult.validation.manifestStore == null) return
        const c2paStatus = c2paResult.validation.manifestStore.validationStatus.length > 0 ? 'error' : 'success'
        c2paResult.validation.trustList = trustListMatch
        c2paResult.icon.status = c2paStatus === 'error' ? 'error' : trustListMatch === null ? 'warning' : 'success'
      })
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === MSG_REQUEST_C2PA_ENTRIES) {
    void (async () => {
      for (const [, entry] of media.entries()) {
        const blob = entry.validation.source.thumbnail.blob
        const response = {
          name: entry.validation.source.metadata.filename,
          status: entry.status,
          thumbnail: blob != null ? await blobToDataURL(blob) : null
        }
        void chrome.runtime.sendMessage({ action: MSG_RESPONSE_C2PA_ENTRIES, data: response })
      }
    })()
    // multiple frames will act on this message, so we send the response as a separate message
  }
  if (message.action === MSG_TRUSTLIST_UPDATE) {
    updateTrustLists()
  }
})

function sendToContent (message: unknown): void {
  void chrome.runtime.sendMessage({ action: MSG_FORWARD_TO_CONTENT, data: message })
}
