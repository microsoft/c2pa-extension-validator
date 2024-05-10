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
import { type MediaRecord } from './mediaRecord'
import * as VisibilityMonitor from './visible'
import { MediaMonitor } from './mediaMonitor' // requires treeshake: { moduleSideEffects: [path.resolve('src/mediaMonitor.ts')] }, in rollup.config.js
import {
  MSG_CHILD_REQUEST, MSG_FRAME_CLICK, MSG_GET_CONTAINER_OFFSET, MSG_PARENT_RESPONSE,
  MSG_REQUEST_C2PA_ENTRIES, MSG_RESPONSE_C2PA_ENTRIES, MSG_TRUSTLIST_UPDATE, MSG_OPEN_OVERLAY,
  type VALIDATION_STATUS, MSG_FORWARD_TO_CONTENT, MSG_C2PA_RESULT_FROM_CONTEXT, MSG_GET_ID,
  MSG_VALIDATE_URL,
  IS_DEBUG
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

interface TabAndFrameId {
  tab: number
  frame: number
}

const topLevelFrame = window === window.top
// let _autoObserve = AUTO_SCAN_DEFAULT
let messageCounter = 0
const media = new Map<MediaElement, { validation: C2paResult, icon: CrIcon, status: VALIDATION_STATUS }>()
let _id: TabAndFrameId

void chrome.runtime.sendMessage({ action: MSG_GET_ID }).then((id) => {
  _id = id
})

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

async function handleValidationResult (mediaElement: MediaElement, c2paResult: C2paResult | C2paError): Promise<void> {
  if (c2paResult instanceof Error || c2paResult.manifestStore == null) {
    console.error('Error validating image:', c2paResult)
    return
  }

  const mediaRecord = MediaMonitor.lookup(mediaElement)
  if (mediaRecord == null) {
    console.error('Media record not found:', mediaElement)
    return
  }

  mediaRecord.state.c2pa = c2paResult

  setIcon(mediaRecord)

  if (mediaRecord.icon === null) return
  mediaRecord.icon.onClick = async () => {
    const offsets = await getOffsets(mediaElement)
    sendToContent({
      action: MSG_OPEN_OVERLAY,
      data: { c2paResult: await serialize(c2paResult), position: { x: offsets.x + offsets.width, y: offsets.y } }
    })
  }
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
  MediaMonitor.all.forEach((mediaRecord) => {
    if (mediaRecord.state.c2pa?.certChain == null) return
    void checkTrustListInclusion(mediaRecord.state.c2pa.certChain).then((trustListMatch) => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      mediaRecord.state.c2pa!.trustList = trustListMatch
      setIcon(mediaRecord)
    })
  })
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const action = message.action
  const data = message.data
  if (action == null || data === undefined) return

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
  if (message.action === MSG_C2PA_RESULT_FROM_CONTEXT && _id != null) {
    if (data?.frame !== _id.frame || data?.c2paResult == null || data.url == null || _lastContextTarget == null) return
    if (data.url !== _lastContextTarget?.src && data.url !== _lastContextTarget?.currentSrc) {
      console.debug('Context menu result URL mismatch:', data.url, _lastContextTarget?.src)
      return
    }
    const c2paResultOrError = data.c2paResult as C2paResult | C2paError
    console.debug('MSG_C2PA_RESULT_FROM_CONTEXT:', _lastContextTarget, data.c2paResult)
    MediaMonitor.add(_lastContextTarget)
    void handleValidationResult(_lastContextTarget, c2paResultOrError)
  }
})

function sendToContent (message: unknown): void {
  void chrome.runtime.sendMessage({ action: MSG_FORWARD_TO_CONTENT, data: message })
}

let _lastContextTarget: MediaElement | null = null

document.addEventListener('contextmenu', event => {
  _lastContextTarget = event.target as MediaElement
  console.debug('CONTEXT MENU:', event)
})

MediaMonitor.onAdd = (mediaRecord: MediaRecord): void => {
  console.debug('%cMedia element added:', 'color: #707070', mediaRecord.src)
  setIcon(mediaRecord)
  VisibilityMonitor.observe(mediaRecord)
}

MediaMonitor.onRemove = (mediaRecord: MediaRecord): void => {
  console.debug('%cMedia element removed:', 'color: #808060', mediaRecord.src)
  mediaRecord.icon = null
  VisibilityMonitor.unobserve(mediaRecord)
}

MediaMonitor.onMonitoringStart = (): void => {
  console.debug('%cMonitoring started:', 'color: #60A080')
  MediaMonitor.all.forEach((mediaRecord) => {
    setIcon(mediaRecord)
    VisibilityMonitor.observe(mediaRecord)
  })
}

MediaMonitor.onMonitoringStop = (): void => {
  MediaMonitor.all.forEach((mediaRecord) => {
    mediaRecord.icon = null
    VisibilityMonitor.unobserve(mediaRecord)
  })
}

VisibilityMonitor.onVisible((mediaRecord: MediaRecord): void => {
  // setIcon(mediaRecord)
  console.debug('%cVisible:', 'color: #75FA8D', mediaRecord.element.src.split('/').pop())
})

VisibilityMonitor.onNotVisible((mediaRecord: MediaRecord): void => {
  console.debug('%cNot Visible:', 'color: #C9716F', mediaRecord.element.src.split('/').pop())
  mediaRecord.icon = null
})

VisibilityMonitor.onEnterViewport((mediaRecord: MediaRecord): void => {
  if (!mediaRecord.state.evaluated && mediaRecord.src != null) {
    mediaRecord.state.evaluated = true
    void c2paValidateImage(mediaRecord.src).then((c2paResult) => {
      console.debug(`%cresult received: ${Date.now()}`, 'color:yellow')
      console.debug('C2PA Result:', c2paResult)
      if (c2paResult instanceof Error || c2paResult.manifestStore == null) {
        console.error('Error validating image:', c2paResult)
        return
      }
      mediaRecord.state.c2pa = c2paResult
      setIcon(mediaRecord)
      if (mediaRecord.icon === null) return
      mediaRecord.icon.onClick = async () => {
        const offsets = await getOffsets(mediaRecord.element)
        sendToContent({
          action: MSG_OPEN_OVERLAY,
          data: { c2paResult: await serialize(c2paResult), position: { x: offsets.x + offsets.width, y: offsets.y } }
        })
      }
    })
  }
})

VisibilityMonitor.onLeaveViewport((mediaRecord: MediaRecord): void => {
  // do nothing
})

VisibilityMonitor.onUpdate((mediaRecord: MediaRecord): void => {
  mediaRecord.icon?.position()
})

function setIcon (mediaRecord: MediaRecord): void {
  if (IS_DEBUG && mediaRecord.state.c2pa == null && mediaRecord.icon == null) {
    mediaRecord.onReady = (mediaRecord) => {
      mediaRecord.icon = new CrIcon(mediaRecord.element, mediaRecord.state.type as VALIDATION_STATUS)
    }
    return
  }
  if (mediaRecord.state.c2pa == null) return

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  let c2paStatus = mediaRecord.state.c2pa.manifestStore!.validationStatus.length > 0 ? 'error' : 'success'
  if (mediaRecord.state.c2pa.trustList == null) {
    c2paStatus = 'warning'
  }
  if (mediaRecord.icon == null) {
    mediaRecord.onReady = (mediaRecord) => {
      mediaRecord.icon = new CrIcon(mediaRecord.element, c2paStatus as VALIDATION_STATUS)
    }
    return
  }
  mediaRecord.icon.status = c2paStatus as VALIDATION_STATUS
}
