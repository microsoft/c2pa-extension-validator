/*
*  Copyright (c) Microsoft Corporation.
*  Licensed under the MIT license.
*/
import { MESSAGE_C2PA_INSPECT_URL } from './constants.js'
import { icon } from './icon.js'
import { C2PADialog } from './c2paStatus.js'
import { deserialize } from './serialize.js'
import { sendMessageWithTimeout } from './utils.js'

/*
  This forces rollup --watch to recompile the content script when the manifest changes
  The recompile triggers the copy of the manifest to the dist folder
  TODO: Find a better way to do this
*/
import './manifest.chrome.v3.json'
import './manifest.firefox.v3.json'
import { type C2paError, type C2paResult } from './c2pa.js'

console.debug('Content: Script: start')

type MediaElements = HTMLImageElement | HTMLVideoElement

type MediaAddedHandler = (element: MediaElements[]) => Promise<void>

type MediaRemovedHandler = (element: MediaElements[]) => void

interface MediaRecord {
  media: MediaElements
  url: string
  iFrame: FrameRecord
}

interface FrameRecord {
  frame: HTMLIFrameElement
  url: string
  id: string
}

interface ContentContext {
  observer: MutationObserver
  tabId: number
  mediaElements: MediaRecord[]
}

const _context: ContentContext = {
  observer: createObserver(onMediaElementAdded, onMediaElementRemoved),
  tabId: 0,
  mediaElements: []
}

async function inspectMediaElements (mediaElements: MediaElements[]): Promise<void> {
  for (const img of Array.from(mediaElements)) {
    const source = img.src !== '' ? img.src : img.currentSrc

    if (_context.mediaElements.find((element) => element.media === img) !== undefined) {
      // TODO: We probably shouldn't see this, but we should handle it if we do
      console.warn('Content: Media element already inspected:', source)
      continue
    }

    const c2paManifestData = await c2paValidateImage(source)
    if (c2paManifestData instanceof Error) {
      console.error(c2paManifestData)
      continue
    }

    if (c2paManifestData.manifestStore == null) {
      console.debug('Content: No C2PA manifest found:', source)
      continue
    }

    const c2paDialog = await C2PADialog.create(c2paManifestData, _context.tabId)

    const validationSuccess = c2paManifestData.manifestStore.validationStatus.length === 0

    icon(img, source, validationSuccess, () => {
      c2paDialog.position(img)
      c2paDialog.show()
    })
  }
}

async function c2paValidateImage (url: string): Promise<C2paResult | C2paError> {
  return await sendMessageWithTimeout<C2paResult | C2paError>({ action: MESSAGE_C2PA_INSPECT_URL, data: url })
    .then((result) => {
      if (result instanceof Error) {
        return result
      }
      return deserialize(result) as C2paResult
    })
    .catch((error) => {
      console.error('Error sending message:', error)
      return new Error('Error sending message') as C2paError
    })
}

async function getTabId (): Promise<number> {
  console.debug('Content: tabId requested')
  const tabId = await sendMessageWithTimeout<number>({ action: 'tabid' })
  console.debug('Content: tabId resonse', tabId)
  return tabId
}

function createObserver (add: MediaAddedHandler, remove: MediaRemovedHandler): MutationObserver {
  console.debug('Content: createObserver')
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      if (mutation.addedNodes.length > 0) {
        const addedMedia = Array.from(mutation.addedNodes).filter(node =>
          node.nodeName === 'IMG' || node.nodeName === 'VIDEO'
        )
        if (addedMedia.length > 0) {
          void add(addedMedia as MediaElements[])
        }
      }
      if (mutation.removedNodes.length > 0) {
        const removedMedia = Array.from(mutation.removedNodes).filter(node =>
          node.nodeName === 'IMG' || node.nodeName === 'VIDEO'
        )
        if (removedMedia.length > 0) {
          remove(removedMedia as MediaElements[])
        }
      }
    })
  })
  return observer
}

async function onMediaElementAdded (element: MediaElements[]): Promise<void> {
  for (const media of element) {
    console.debug('New media element added:', media.src)
    await inspectMediaElements([media])
  }
}

function onMediaElementRemoved (element: MediaElements[]): void {
  console.debug('New media element removed:', element)
}

function getStaticMediaElements (): MediaElements[] {
  return Array.from(document.querySelectorAll('img, video'))
}

/*

  Initialize the content script

*/

async function init (): Promise<void> {
  console.debug('Content: Initialization: started')
  console.debug(`Content: Initialization: document.readyState ${document.readyState}`)
  const tabId = await getTabId()
  _context.tabId = tabId
  console.debug(`Content: Initialization: document.readyState ${document.readyState}`)
  try {
    _context.observer.observe(document.body, { childList: true, subtree: true })
  } catch (e) {
    console.error('Content: Initialization: error', document.readyState)
  }
  await onMediaElementAdded(getStaticMediaElements())
  console.debug('Content: Initialization: complete')
}

/*

  Event listeners for debugging
  They help to understand the sequence of events that occur in the content script

*/

/*
    DOMContentLoaded can only occur if "run_at": "document_start" is set in the manifest.
    document_idle/document_end will result in DOMContentLoaded firing before this script runs.
  */
document.addEventListener('DOMContentLoaded', function () {
  console.debug('Content: Event: DOMContentLoaded')
})

window.addEventListener('load', function () {
  console.debug('Content: Event: load')
  void init()
})

console.debug('Content: Script: end')
