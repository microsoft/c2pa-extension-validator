/*
*  Copyright (c) Microsoft Corporation.
*  Licensed under the MIT license.
*/
import { MESSAGE_C2PA_INSPECT_URL } from './constants.js'
import { icon, type VALIDATION_STATUS } from './icon.js'
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

const additionalObservers: MutationObserver[] = []

async function inspectMediaElements (mediaElements: MediaElements[]): Promise<void> {
  for (const img of Array.from(mediaElements)) {
    const source = img.src !== '' ? img.src : img.currentSrc

    if (img.nodeName === 'IFRAME') {
      console.debug('IFRAME:', (img as unknown as HTMLIFrameElement).src)
    }

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

    // set the validation status: valid, warning if signer is not trusted, error if validation fails
    let validationStatus: VALIDATION_STATUS = 'success'
    if (c2paManifestData.manifestStore.validationStatus.length > 0) {
      validationStatus = 'error'
    } else if (c2paManifestData.trustList == null) {
      validationStatus = 'warning'
    }

    icon(img, source, validationStatus, () => {
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
  console.debug('Content: tabId response', tabId)
  return tabId
}

function createObserver (add: MediaAddedHandler, remove: MediaRemovedHandler): MutationObserver {
  console.debug('Content: createObserver')
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      // Handle added nodes
      if (mutation.addedNodes.length > 0) {
        const addedMedia = Array.from(mutation.addedNodes).filter(node => {
          return node.nodeName === 'IMG' ||
                 node.nodeName === 'VIDEO' ||
                 (node.nodeName === 'DIV' && (node as HTMLDivElement).shadowRoot !== null)
        })
        if (addedMedia.length > 0) {
          void add(addedMedia as MediaElements[])
        }
      }

      // Handle removed nodes
      if (mutation.removedNodes.length > 0) {
        const removedMedia = Array.from(mutation.removedNodes).filter(node => {
          return node.nodeName === 'IMG' ||
                 node.nodeName === 'VIDEO' ||
                 (node.nodeName === 'IFRAME' && /\.mp4(\?.*)?$/i.test((node as HTMLIFrameElement).src))
        })
        if (removedMedia.length > 0) {
          remove(removedMedia as MediaElements[])
        }
      }
    })
  })
  return observer
}

function createObserver2 (add: MediaAddedHandler, remove: MediaRemovedHandler): MutationObserver {
  console.debug('Content: createObserver')
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      // Handle added nodes
      if (mutation.addedNodes.length > 0) {
        const addedMedia = Array.from(mutation.addedNodes).filter(node => {
          return true
        })
        if (addedMedia.length > 0) {
          void add(addedMedia as MediaElements[])
        }
      }

      // Handle removed nodes
      if (mutation.removedNodes.length > 0) {
        const removedMedia = Array.from(mutation.removedNodes).filter(node => {
          return node.nodeName === 'IMG' ||
                 node.nodeName === 'VIDEO' ||
                 (node.nodeName === 'IFRAME' && /\.mp4(\?.*)?$/i.test((node as HTMLIFrameElement).src))
        })
        if (removedMedia.length > 0) {
          remove(removedMedia as MediaElements[])
        }
      }
    })
  })
  return observer
}

async function shadowRootObserverResult (element: MediaElements[]): Promise<void> {
  console.debug('SHADOWROOT: OBSERVER RESULT:', element)
  // await onMediaElementAdded(element)
}

async function onMediaElementAdded (element: MediaElements[]): Promise<void> {
  for (const media of element) {
    if (media.tagName === 'DIV') {
      console.debug('SHADOWROOT:', media.shadowRoot)
      const shadowRoot = media.shadowRoot
      if (shadowRoot !== null) {
        const observer = createObserver2(shadowRootObserverResult, onMediaElementRemoved)
        additionalObservers.push(observer)
        observer.observe(shadowRoot, { childList: true, subtree: true })
        // additionalObservers.push(createObserver(onMediaElementAdded, onMediaElementRemoved).observe(shadowRoot, { childList: true, subtree: true }))
        await shadowRootObserverResult(getStaticMediaElements2(shadowRoot))
      }
    }
    console.debug('New media element added:', media.src)
    await inspectMediaElements([media])
  }
}

function onMediaElementRemoved (element: MediaElements[]): void {
  console.debug('New media element removed:', element)
}

function getStaticMediaElements (dom: Document | ShadowRoot): MediaElements[] {
  // Fetch all img, video, and iframe elements
  const mediaElements = Array.from(dom.querySelectorAll('img, video, iframe'))

  // Filter the list to include iframes with a .mp4 source
  const filteredMediaElements = mediaElements.filter(el => {
    // Directly return img and video elements

    if (el.tagName === 'IFRAME') {
      console.debug('IFRAME:', (el as HTMLIFrameElement).src)
    }

    if (el.tagName !== 'IFRAME') {
      return true
    }
    // For iframe elements, check if the src attribute ends with .mp4
    // Note: You may need to adjust the regex to handle different URL structures or query parameters
    return /\.mp4(\?.*)?$/i.test((el as HTMLIFrameElement).src)
  })

  return filteredMediaElements as MediaElements[]
}

function getStaticMediaElements2 (dom: Document | ShadowRoot): MediaElements[] {
  const mediaElements = Array.from(dom.querySelectorAll('div, img, video, iframe'))
  return mediaElements as MediaElements[]
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
  await onMediaElementAdded(getStaticMediaElements(document))
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function findAllDivsWithShadowRoot (): Element[] {
  // Get all <div> elements in the document
  const allDivs = document.querySelectorAll('div')

  // Filter <div> elements to find those with an open shadowRoot
  const divsWithShadowRoot = Array.from(allDivs).filter((div: Element) => div.shadowRoot !== null)

  return divsWithShadowRoot
}
