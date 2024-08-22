/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { type C2paError, type C2paResult } from './c2pa'
import { type MediaElement } from './content'
import { CrIcon } from './icon'
import { checkTrustListInclusion, loadTrustLists } from './trustlist'
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
let messageCounter = 0
// const media = new Map<MediaElement, { validation: C2paResult, icon: CrIcon, status: VALIDATION_STATUS }>()
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
    console.error('Error validating image 1:', c2paResult)
    return
  }

  const mediaRecord = MediaMonitor.lookup(mediaElement)
  if (mediaRecord == null) {
    console.error('Media record not found:', mediaElement)
    return
  }

  mediaRecord.state.c2pa = c2paResult

  setIcon(mediaRecord)
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
  return result
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

async function updateTrustLists (): Promise<void> {
  await loadTrustLists()
  MediaMonitor.all.forEach((mediaRecord) => {
    if (mediaRecord.state.c2pa?.certChain == null) return
    mediaRecord.state.c2pa.trustList = checkTrustListInclusion(mediaRecord.state.c2pa.certChain)
    setIcon(mediaRecord)
  })
}

function getC2PAStatus(c2pa: C2paResult): VALIDATION_STATUS {
  // make sure we have a manifest store and validation result
  if (!c2pa.manifestStore.validationStatus) throw new Error('Manifest store not found')
  // if there are validation errors, return the error status
  if (c2pa.manifestStore.validationStatus.length > 0) return 'error'
  // if there is no trust list, return the warning status
  if (c2pa.trustList == null) return 'warning'
  // if the cert is expired, make sure the TSA time stamp is trusted
  // (no easy way to check that, we need to check the cert chain)
  if (c2pa.certChain && new Date(c2pa.certChain[0].validTo) < new Date()) {
    // cert is expired, make sure we have a match in the TSA trust list (if not, timestamp must be ignored)
    if (c2pa.tstTokens == null || c2pa.tsaTrustList == null) {
      // add an error to the validation status
      c2pa.manifestStore.validationStatus.push('certificate is expired and no trusted timestamp found')
      return 'error'
    }
  }
  // otherwise, return the success status
  return 'success'
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const action = message.action
  const data = message.data
  if (action == null || data === undefined) return

  if (message.action === MSG_REQUEST_C2PA_ENTRIES) {
    void (async () => {
      const c2paEntries = MediaMonitor.all.filter((mediaRecord) => mediaRecord.state.c2pa != null)
      c2paEntries.forEach((entry) => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const c2pa = entry.state.c2pa!
        const response = {
          name: c2pa.source.filename,
          status: getC2PAStatus(c2pa),
          thumbnail: c2pa.source.thumbnail.data
        }
        void chrome.runtime.sendMessage({ action: MSG_RESPONSE_C2PA_ENTRIES, data: response })
      })
    })()
    // multiple frames will act on this message, so we send the response as a separate message
  }
  if (message.action === MSG_TRUSTLIST_UPDATE) {
    void updateTrustLists()
  }
  if (message.action === MSG_C2PA_RESULT_FROM_CONTEXT && _id != null) {
    if (data?.frame !== _id.frame || data?.c2paResult == null || data.url == null || _lastContextTarget == null) return
    if (data.url !== _lastContextTarget?.src && data.url !== _lastContextTarget?.currentSrc) {
      return
    }
    const c2paResultOrError = data.c2paResult as C2paResult | C2paError

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
})

MediaMonitor.onAdd = (mediaRecord: MediaRecord): void => {
  console.debug('MediaMonitor.onAdd:', mediaRecord)
  VisibilityMonitor.observe(mediaRecord)
}

MediaMonitor.onRemove = (mediaRecord: MediaRecord): void => {
  if (mediaRecord.icon != null) {
    mediaRecord.icon.remove()
  }
  VisibilityMonitor.unobserve(mediaRecord)
}

MediaMonitor.onMonitoringStart = (): void => {
  console.debug('MediaMonitor.onMonitoringStart')
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
  setIcon(mediaRecord)
})

VisibilityMonitor.onNotVisible((mediaRecord: MediaRecord): void => {
  mediaRecord.icon = null
})

VisibilityMonitor.onEnterViewport((mediaRecord: MediaRecord): void => {
  if (!mediaRecord.state.evaluated && mediaRecord.src !== '') {
    mediaRecord.state.evaluated = true
    void c2paValidateImage(mediaRecord.src)
      .then((c2paResult) => {
        if (c2paResult instanceof Error || c2paResult.manifestStore == null) {
          return // This is not a c2pa element
        }
        mediaRecord.state.c2pa = c2paResult
        setIcon(mediaRecord)
        if (mediaRecord.icon === null) return
        mediaRecord.icon.onClick = async () => {
          const offsets = await getOffsets(mediaRecord.element)
          sendToContent({
            action: MSG_OPEN_OVERLAY,
            data: { c2paResult, position: { x: offsets.x + offsets.width, y: offsets.y } }
          })
        }
      })
      .catch((error) => {
        console.error('Error validating image 3:', error)
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
  // Add placeholder icon when debugging
  if (IS_DEBUG && mediaRecord.state.c2pa == null && mediaRecord.icon == null) {
    mediaRecord.onReady = (mediaRecord) => {
      mediaRecord.icon = new CrIcon(mediaRecord.element, mediaRecord.state.type as VALIDATION_STATUS)
    }
    return
  }

  if (mediaRecord.state.c2pa == null) return

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  let c2paStatus = getC2PAStatus(mediaRecord.state.c2pa)

  if (mediaRecord.icon == null) {
    mediaRecord.onReady = (mediaRecord) => {
      mediaRecord.icon = new CrIcon(mediaRecord.element, c2paStatus as VALIDATION_STATUS)
      mediaRecord.icon.onClick = async () => {
        const offsets = await getOffsets(mediaRecord.element)
        sendToContent({
          action: MSG_OPEN_OVERLAY,
          data: { c2paResult: mediaRecord.state.c2pa, position: { x: offsets.x + offsets.width, y: offsets.y } }
        })
      }
    }

    return
  }
  mediaRecord.icon.status = c2paStatus as VALIDATION_STATUS
}
