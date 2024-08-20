/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { type C2paError, type C2paResult } from './c2pa'
import { type MediaElement } from './content'
import { CrIcon } from './icon'
import { checkTrustListInclusion, loadTrustLists } from './trustlist'
import { MediaRecord, type MediaRecordInfo } from './mediaRecord'
import { MediaMonitor } from './mediaMonitor' // requires treeshake: { moduleSideEffects: [path.resolve('src/mediaMonitor.ts')] }, in rollup.config.js
import {
  MSG_CHILD_REQUEST, MSG_FRAME_CLICK, MSG_GET_CONTAINER_OFFSET, MSG_PARENT_RESPONSE,
  MSG_REQUEST_C2PA_ENTRIES, MSG_RESPONSE_C2PA_ENTRIES, MSG_TRUSTLIST_UPDATE, MSG_OPEN_OVERLAY,
  type VALIDATION_STATUS, MSG_FORWARD_TO_CONTENT, MSG_C2PA_RESULT_FROM_CONTEXT, MSG_GET_ID,
  MSG_VALIDATE_URL, IS_DEBUG, MSG_REQUEST_MEDIA_RECORDS, MSG_RESPONSE_MEDIA_RECORDS,
  MSG_MEDIA_RECORD_UPDATE, MSG_MEDIA_RECORDS_CLEAR,
  MSG_INSPECT_MEDIA_RECORD
} from './constants'
import { MediaStore } from './mediaStore'
import { VisibilityMonitor } from './visible'
import { elementToString } from './utils'

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

export interface TabAndFrameId {
  tab: number
  frame: number
}

export interface MSG_RESPONSE_C2PA_ENTRIES_PAYLOAD {
  name: string
  status: VALIDATION_STATUS
  thumbnail: string | null
}

const topLevelFrame = window === window.top
let messageCounter = 0
let _tabAndFrameId: TabAndFrameId

/*
  Request the tab and frame ids from the background script.
  We cannot determine these ids locally.
*/
void chrome.runtime.sendMessage({ action: MSG_GET_ID }).then((id: TabAndFrameId) => {
  _tabAndFrameId = id
  console.debug('Frame ID:', _tabAndFrameId)
})

if (window.location.href.startsWith('chrome-extension:') || window.location.href.startsWith('moz-extension:')) {
  throw new Error('Ignoring extension IFrame')
}

/*
  window.postMessage listener for messages from child frames
*/
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

    /*
      Handle the offsets request
    */
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

window.addEventListener('unload', (event) => {
  clearSidePanel()
})

/**
 * When this frame/tab receives a message via window.postMessage, determine the child frame that sent it.
 * This can detect if the child frame was in a shadowRoot.
 */
function findChildFrame (sender: MessageEventSource): HTMLIFrameElement | null {
  // TODO: remove the duplication here.
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
  // child frame not found, look in shadow roots
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

/**
 * This enables Frame->ParentFrame messages with an async response.
 * This uses window.postMessage and not extension messaging.
 * This way we don't have to map the frame/tab hierarchy and determine frame-ids before messaging.
 */
async function postWithResponse <T> (message: unknown): Promise<T> {
  return await new Promise((resolve) => {
    const counter = messageCounter++
    // TODO: What is the counter for?
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

/**
 * This is called when a c2pa validation result is return via the background script.
 * It sets the C2pa state of the MediaRecord and updates the overlay icon.
 */
async function handleValidationResult (mediaElement: MediaElement, c2paResult: C2paResult | C2paError): Promise<void> {
  if (c2paResult instanceof Error || c2paResult.manifestStore == null) {
    console.error('Error validating image 1:', c2paResult)
    return
  }

  const mediaRecord = MediaStore.get(mediaElement)
  if (mediaRecord == null) {
    console.error('Media record not found:', mediaElement)
    return
  }

  mediaRecord.state.c2pa = c2paResult

  setIcon(mediaRecord)
}

/**
 * Gets the offsets of the parent frame/tab
 */
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

/**
 * Recursively retrieves offsets from parent frames to give absolute offsets of a media element.
 */
export async function getOffsets (element: HTMLElement): Promise<Rect> {
  const parentOffset = await getParentOffset()
  const mediaElementOffset = element.getBoundingClientRect()
  const combinedOffset = combineOffsets(mediaElementOffset, parentOffset)
  return combinedOffset
}

/**
 * This combines offsets from within a frame with to offsets of the frame itself into.
 * Now we have the absolute offsets of the child media element.
 */
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

/**
 * Evaluates the url with the c2pa library in the background.
 * Either a valid C2paResult will be returned or an a C2paError
 */
export async function c2paValidateImage (url: string): Promise<C2paResult | C2paError> {
  /*
    Chrome does not allow retrieving the byte data from a blob URL
    TODO: leave this to explore solution later
  */
  // const result =
  // url.startsWith('blob:')
  //   ? await chrome.runtime.sendMessage({ action: MSG_VALIDATE_BYTES, data: getArrayBufferFromBlobUrl(url) }).catch((error) => {
  //     console.error('Error sending message:', error)
  //     return new Error('Error sending message') as C2paError
  //   })
  //   : await chrome.runtime.sendMessage({ action: MSG_VALIDATE_URL, data: url }).catch((error) => {
  //     console.error('Error sending message:', error)
  //     return new Error('Error sending message') as C2paError
  //   })

  const result = await chrome.runtime.sendMessage({ action: MSG_VALIDATE_URL, data: url }).catch((error) => {
    console.error('Error sending message:', error)
    return new Error('Error sending message') as C2paError
  })

  if (result instanceof Error || result?.error === true) {
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

/**
 * Updates the trust lists for all c2pa media.
 */
async function updateTrustLists (): Promise<void> {
  await loadTrustLists()
  MediaStore.all.forEach((mediaRecord) => {
    if (mediaRecord.state.c2pa?.certChain == null) return
    mediaRecord.state.c2pa.trustList = checkTrustListInclusion(mediaRecord.state.c2pa.certChain)
    setIcon(mediaRecord)
  })
}

/*
  Listeners for message to the content script
*/
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const action = message.action
  const data = message.data
  if (action == null || data === undefined) return

  if (action === MSG_REQUEST_C2PA_ENTRIES) {
    void (async () => {
      const c2paEntries = MediaStore.all.filter((mediaRecord) => mediaRecord.state.c2pa != null)
      c2paEntries.forEach((entry) => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const c2pa = entry.state.c2pa!
        const response = {
          name: c2pa.source.filename,
          status: c2pa.manifestStore.validationStatus.length > 0 ? 'error' : c2pa.trustList == null ? 'warning' : 'success',
          thumbnail: c2pa.source.thumbnail.data
        }
        void chrome.runtime.sendMessage({ action: MSG_RESPONSE_C2PA_ENTRIES, data: response })
      })
    })()
    // multiple frames will act on this message, so we send the response as a separate message
  }

  if (action === MSG_REQUEST_MEDIA_RECORDS) {
    void (async () => {
      const allMediaRecords = MediaStore.all.map((mediaRecord) => {
        return getMediaInfo(mediaRecord)
      })
      void chrome.runtime.sendMessage({ action: MSG_RESPONSE_MEDIA_RECORDS, data: allMediaRecords })
    })()
    // multiple frames will respond to this message, so we send the response as a separate message
  }

  if (action === MSG_TRUSTLIST_UPDATE) {
    void updateTrustLists()
  }

  if (action === MSG_C2PA_RESULT_FROM_CONTEXT && _tabAndFrameId != null) {
    if (data?.frame !== _tabAndFrameId.frame || data?.c2paResult == null || data.url == null || _lastContextTarget == null) return
    if (data.url !== _lastContextTarget?.src && data.url !== _lastContextTarget?.currentSrc) {
      return
    }
    const c2paResultOrError = data.c2paResult as C2paResult | C2paError

    MediaMonitor.add(_lastContextTarget)
    void handleValidationResult(_lastContextTarget, c2paResultOrError)
  }

  if (action === MSG_INSPECT_MEDIA_RECORD && data.frame === _tabAndFrameId.frame) {
    const mediaRecord = MediaStore.all.find((mediaRecord) => mediaRecord.id === data.id)
    if (mediaRecord == null) return
    console.groupCollapsed('Media Record >')
    console.debug(JSON.stringify(mediaRecord, null, 2))
    console.groupEnd()
  }
})

/**
 * Sends a message to content scripts, possibly in other frames, routed through background.
 * Chrome allows messages from content->content but Firefox does not, so we use
 * content->background->content for all content->content messages.
 */
export function sendToContent (message: unknown): void {
  void chrome.runtime.sendMessage({ action: MSG_FORWARD_TO_CONTENT, data: message })
}

/**
 * Sets the overlay icon for a media element. The type of icon is determined from the
 * MediaRecord state.
 */
export function setIcon (mediaRecord: MediaRecord): void {
  // Add placeholder icon when debugging
  if (IS_DEBUG && mediaRecord.state.c2pa == null && mediaRecord.icon == null) {
    // mediaRecord.onReady = (mediaRecord) => {
    if (mediaRecord?.state?.type == null) {
      // eslint-disable-next-line no-debugger
      debugger
    }

    mediaRecord.icon = new CrIcon(mediaRecord.element, mediaRecord.state.type as VALIDATION_STATUS)

    mediaRecord.icon.onClick = async () => {
      console.groupCollapsed('Media Record >')
      console.debug(JSON.stringify(mediaRecord, null, 2))
      console.groupEnd()
    }

    return
  }

  if (mediaRecord.state.c2pa?.manifestStore == null) return

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  let c2paStatus = mediaRecord.state.c2pa.manifestStore.validationStatus.length > 0 ? 'error' : 'success'
  if (mediaRecord.state.c2pa.trustList == null) {
    c2paStatus = 'warning'
  }

  if (mediaRecord.icon == null) {
    mediaRecord.icon = new CrIcon(mediaRecord.element, c2paStatus as VALIDATION_STATUS)
    mediaRecord.icon.onClick = async () => {
      const offsets = await getOffsets(mediaRecord.element)
      sendToContent({
        action: MSG_OPEN_OVERLAY,
        data: { c2paResult: mediaRecord.state.c2pa, position: { x: offsets.x + offsets.width, y: offsets.y } }
      })
    }
    return
  }

  mediaRecord.icon.status = c2paStatus as VALIDATION_STATUS
}

/*
  When a left-click opens a context menu, store the element that was left-clicked.
  When we later receive a context-menu response from background, we'll know what element it pertains to.
*/
let _lastContextTarget: MediaElement | null = null
document.addEventListener('contextmenu', event => {
  _lastContextTarget = event.target as MediaElement
})

// #region Monitor Callback Handlers

MediaMonitor.onStart = (): void => {
  console.debug('MediaMonitor.onMonitoringStart')
  MediaStore.all.forEach((mediaRecord) => {
    if (IS_DEBUG) {
      /*
        When in debug mode, set an icon on every media element.
        Then we have a visual cue that a media element has been detected.
      */
      setIcon(mediaRecord)
    }
    VisibilityMonitor.observe(mediaRecord)
  })
}

MediaMonitor.onStop = (): void => {
  MediaStore.all.forEach((mediaRecord) => {
    mediaRecord.icon = null
    VisibilityMonitor.unobserve(mediaRecord)
  })
}

/*
  onAdd called when a new media element is detected on the page.
  Either statically or dynamically added.
*/
MediaMonitor.onAdd = (element: MediaElement): void => {
  const mediaRecord = new MediaRecord(element, _tabAndFrameId)
  mediaRecord.log(elementToString(element))
  MediaStore.add(mediaRecord)
  mediaRecord.onReady = (record, event) => {
    if (record.state.disposed) {
      console.error('Disposed MediaRecord added')
      return
    }
    VisibilityMonitor.observe(record)
    notifySidePanel('ADD', record)
  }
}

/*
  onRemove called when a media element is removed from the page.
*/
MediaMonitor.onRemove = (element: MediaElement): void => {
  // element.removeAttribute('c2pa:id')
  const mediaRecord = MediaStore.remove(element)
  if (mediaRecord == null) return
  VisibilityMonitor.unobserve(mediaRecord)
  notifySidePanel('REMOVE', mediaRecord)
  mediaRecord?.dispose()
}

/*
  onUpdate called when a media element's attributes have changed.
*/
MediaMonitor.onUpdate = (element: MediaElement): void => {
  const mediaRecord = MediaStore.get(element)
  // eslint-disable-next-line no-useless-return
  if (mediaRecord == null) return

  if (mediaRecord.src !== element.currentSrc) {
    mediaRecord.log(`MediaMonitor.onUpdate src change old:${mediaRecord.src} new:${element.currentSrc}`)
    VisibilityMonitor.unobserve(mediaRecord)
    notifySidePanel('REMOVE', mediaRecord)
    mediaRecord?.dispose()

    const newMediaRecord = new MediaRecord(element, _tabAndFrameId)

    mediaRecord._log.forEach((log) => {
      newMediaRecord.log(log)
    })
    newMediaRecord.log('----------------------------------')

    MediaStore.add(newMediaRecord)
    VisibilityMonitor.observe(newMediaRecord)
    notifySidePanel('ADD', newMediaRecord)
  }
}

/*
  onEnterViewport called when a media element enters the viewport.
  We inspect the media element and validate it with C2PA the first time it enters the viewport.
*/
VisibilityMonitor.onEnterViewport = async (mediaRecord: MediaRecord): Promise<void> => {
  notifySidePanel('VIEWPORT_ENTER', mediaRecord)

  if (mediaRecord.state.visible) {
    // eslint-disable-next-line no-debugger
    debugger
  }

  mediaRecord.log('VisibilityMonitor.onEnterViewport')
  if (mediaRecord.state.evaluated || mediaRecord.src === '') return

  mediaRecord.state.evaluated = true
  const c2paResult = await c2paValidateImage(mediaRecord.src)
  if ((c2paResult as C2paError).error) {
    return // This is not a c2pa element
  }

  if (mediaRecord.state.disposed) {
    // The media record was removed while waiting for the c2pa result
    console.debug('Media record disposed:', mediaRecord)
    return
  }

  notifySidePanel('C2PA_RESULT', mediaRecord)

  mediaRecord.state.c2pa = c2paResult as C2paResult

  setIcon(mediaRecord)
  if (mediaRecord.icon === null) return

  mediaRecord.icon.onClick = async () => {
    const offsets = await getOffsets(mediaRecord.element)
    sendToContent({
      action: MSG_OPEN_OVERLAY,
      data: { c2paResult, position: { x: offsets.x + offsets.width, y: offsets.y } }
    })
  }
}

/*
  onLeaveViewport called when a media element leaves the viewport.
*/
VisibilityMonitor.onLeaveViewport = (mediaRecord: MediaRecord): void => {
  mediaRecord.log('VisibilityMonitor.onLeaveViewport')
  // do nothing
  notifySidePanel('VIEWPORT_LEAVE', mediaRecord)
}

/*
  Some attribute/property has changed, but its visibility state has not necissarily has changed.
*/
VisibilityMonitor.onUpdate = (mediaRecord: MediaRecord): void => {
  mediaRecord?.icon?.position()
}

/*
  onVisible called when a media element visibility state changes to visible.
  it does not fire if the element was already visible.
*/
VisibilityMonitor.onVisible = (mediaRecord: MediaRecord): void => {
  if (!mediaRecord.state.viewport) {
    console.error('MediaRecord is \'visible\' without being in the viewport')
  }
  mediaRecord.log('VisibilityMonitor.onVisible')
  setIcon(mediaRecord)
  notifySidePanel('VISIBLE', mediaRecord)
}

/*
  onVisible called when a media element visibility state changes to not-visible.
  it does not fire if the element was already not-visible.
*/
VisibilityMonitor.onNotVisible = (mediaRecord: MediaRecord): void => {
  mediaRecord.log('VisibilityMonitor.onNotVisible')
  mediaRecord.icon = null // .icon setter will dispose
  notifySidePanel('HIDDEN', mediaRecord)
}

// #endregion

/**
 * Sends an a MediaInfo for this MediaRecord to the side-panel so that it may update dynamically.
 */
function notifySidePanel (type: string, record?: MediaRecord): void {
  const mediaInfo = record != null ? getMediaInfo(record) : null
  void chrome.runtime.sendMessage({ action: MSG_MEDIA_RECORD_UPDATE, data: { mediaInfo, type } })
}

/**
 * Sends message to the side-panel to clear its entries
 */
function clearSidePanel (): void {
  void chrome.runtime.sendMessage({ action: MSG_MEDIA_RECORDS_CLEAR, data: _tabAndFrameId.frame })
}

/**
 * MediaRecordInfo is a subset of MediaRecord.
 * We use this to send information about a MediaRecord to the side-panel without sending the entire
 * MediaRecord.
 */
function getMediaInfo (record: MediaRecord): MediaRecordInfo {
  return {
    frame: _tabAndFrameId,
    src: record.src,
    id: record.id,
    rect: record.element.getBoundingClientRect(),
    state: record.state,
    icon: {
      status: record.icon?.status ?? 'none',
      src: record.icon?.img?.src ?? ''
    }
  }
}

/**
 * Attempts to extract the data bytes from a blob url.
 * This is not allowed on Chrome.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function getArrayBufferFromBlobUrl (blobUrl: string): Promise<ArrayBuffer> {
  // TODO: Keep this for now to explore the a solution later
  return await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', blobUrl, true)
    xhr.responseType = 'blob'
    xhr.onload = function (e) {
      if (this.status === 200) {
        const myBlob = this.response
        resolve(myBlob as ArrayBuffer)
      // myBlob is now the blob that the object URL pointed to.
      }
    }
    xhr.send()
  })
}
