/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { IS_DEBUG, AUTO_SCAN_DEFAULT, MSG_AUTO_SCAN_UPDATED } from './constants'
import { type MediaElement } from './content'
import { type TabAndFrameId } from './inject'
import { MediaRecord } from './mediaRecord'
import { MediaStore } from './mediaStore'
import { elementToString, getFrameId } from './utils'

console.debug('Media module loaded')

const mediaSelector = MediaRecord.MEDIA_ELEMENT_NODE_TYPES.join(',').toLocaleLowerCase()
let _autoObserve: boolean

/***
 * This class monitors the DOM for the addition, removal, and modification of media elements.
 * It does not store or manage the media elements but instead detects changes and triggers
 * the appropriate callbacks. Storage and management of media elements are handled in the
 * callbacks by the calling code.
 *
 * @class
 * @static
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class MediaMonitor {
  private static _monitoring: boolean = false
  private static _onStartCallback: ((monitor: MediaMonitor) => void) | null = null
  private static _onStopCallback: ((monitor: MediaMonitor) => void) | null = null
  private static _addCallback: ((element: MediaElement) => void) | null = null
  private static _removeCallback: ((element: MediaElement) => void) | null = null
  private static _updateCallback: ((element: MediaElement) => void) | null = null
  private static mutationObserver: MutationObserver
  private static readonly _knownMediaElements = new WeakSet<MediaElement>()
  private static _id = 0
  private static readonly _frameId: TabAndFrameId = { tab: -1, frame: -1 }

  /*
    Static initializer runs when the class initializes
  */
  static {
    /*
      Setup the MutationObserver (this does not actually start the observer)
    */
    MediaMonitor.mutationObserver = new MutationObserver((mutationsList: MutationRecord[]) => {
      mutationsList.forEach(mutation => {
        /*
          Add new media elements
        */
        if (mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach(node => {
            MediaMonitor.mediaElementsFromNode(node)
              /*
                Depending on how elements are added to the page, we may see a node added more than once
                So we prevent adding more than once.
              */
              .filter(mediaElement => !MediaMonitor._knownMediaElements.has(mediaElement))
              .forEach(mediaElement => {
                if (IS_DEBUG) {
                  // Assign a custom attribute to each media elements to track them in the DOM
                  if (mediaElement.getAttribute('c2pa:id') != null) {
                    console.error('Media element already assigned c2pa:id', elementToString(mediaElement))
                  }
                  mediaElement.setAttribute('c2pa:id', (this._id++).toString())
                }
                MediaMonitor._knownMediaElements.add(mediaElement)
                MediaMonitor.add(mediaElement)
              })
          })
        }

        /*
          Remove media elements
        */
        if (mutation.removedNodes.length > 0) {
          mutation.removedNodes.forEach(node => {
            MediaMonitor.mediaElementsFromNode(node)
              .filter(mediaElement => MediaMonitor._knownMediaElements.has(mediaElement))
              .forEach(mediaElement => {
                if (IS_DEBUG) {
                  if (mediaElement.getAttribute('c2pa:id') == null) {
                    console.error('Media element missing c2pa:id', elementToString(mediaElement))
                  }
                  mediaElement.removeAttribute('c2pa:id')
                }
                MediaMonitor._remove(mediaElement)
                MediaMonitor._knownMediaElements.delete(mediaElement)
              })
          })
        }

        /*
          Update media element
          An attribute like src could have changed
        */
        if (mutation.type !== 'attributes') return
        const node = mutation.target
        if (!MediaRecord.isMediaElement(node)) return
        if (this._knownMediaElements.has(node)) {
          MediaMonitor._update(node)
        } else {
          const mediaElement = node
          /*
            TODO: Figure what conditions get us here
            An updated media element that is not in _knownMediaElements?
            We add the node as a new media element in this case
          */
          if (IS_DEBUG) {
            console.warn('Unknown media element being updated', elementToString(mediaElement))
            // Assign a custom attribute to each media elements to track them in the DOM
            mediaElement.setAttribute('c2pa:id', (this._id++).toString())
          }
          MediaMonitor._knownMediaElements.add(mediaElement)
          MediaMonitor.add(mediaElement)
        }
      })
    })
  }

  private static _startMonitoring (): void {
    if (MediaMonitor._monitoring) {
      console.warn('%cMonitor already started', 'color: #606060')
      return
    }

    MediaMonitor._monitoring = true
    if (MediaMonitor._onStartCallback != null) {
      MediaMonitor._onStartCallback(MediaMonitor)
    }

    /*
      Add static media elements
      The MutationObserver will handle dynamically added elements
    */
    MediaMonitor.mediaElementsFromNode(document.body)
      .filter(mediaElement => !MediaMonitor._knownMediaElements.has(mediaElement))
      .forEach(mediaElement => {
        if (IS_DEBUG) {
          mediaElement.setAttribute('c2pa:id', (this._id++).toString())
        }
        MediaMonitor._knownMediaElements.add(mediaElement)
        MediaMonitor.add(mediaElement)
      })

    /*
      Start monitoring the DOM with the MutationObserver
    */
    MediaMonitor.mutationObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'currentSrc'] })
  }

  private static _stopMonitoring (): void {
    if (!MediaMonitor._monitoring) {
      console.warn('Monitor already stopped')
      return
    }
    if (MediaMonitor._onStopCallback != null) {
      MediaMonitor._onStopCallback(MediaMonitor)
    }
    MediaMonitor.mutationObserver.disconnect()
    MediaMonitor._monitoring = false
  }

  /**
   * Called when a new media element is detected in the DOM.
   * The callback is called with the media element.
   * **This does not add the media element to the store**. The callback should handle that.
   * @param element {MediaElement}
   * @returns {void}
   */
  public static add (element: MediaElement): void {
    /*
      TODO: Describe why this method is public?
    */
    if (MediaMonitor._addCallback == null) {
      console.error('MediaMonitor.add callback not set')
      return
    }
    MediaMonitor._addCallback?.(element)
  }

  private static _remove (element: MediaElement): void {
    if (MediaMonitor._removeCallback == null) {
      console.error('MediaMonitor.remove callback not set')
      return
    }
    MediaMonitor._removeCallback?.(element)
  }

  private static _update (element: MediaElement): void {
    if (MediaMonitor._updateCallback == null) {
      console.error('MediaMonitor.update callback not set')
      return
    }
    MediaMonitor._updateCallback?.(element)
  }

  // eslint-disable-next-line accessor-pairs
  public static set onStart (value: ((monitor: MediaMonitor) => void) | null) {
    MediaMonitor._onStartCallback = value
  }

  // eslint-disable-next-line accessor-pairs
  public static set onStop (value: ((monitor: MediaMonitor) => void) | null) {
    MediaMonitor._onStopCallback = value
  }

  // eslint-disable-next-line accessor-pairs
  public static set onAdd (value: ((element: MediaElement) => void) | null) {
    MediaMonitor._addCallback = value
  }

  // eslint-disable-next-line accessor-pairs
  public static set onRemove (value: ((element: MediaElement) => void) | null) {
    MediaMonitor._removeCallback = value
  }

  // eslint-disable-next-line accessor-pairs
  public static set onUpdate (value: ((element: MediaElement) => void) | null) {
    MediaMonitor._updateCallback = value
  }

  public static get monitoring (): boolean {
    return MediaMonitor._monitoring
  }

  public static set monitoring (value: boolean) {
    /*
      The MediaMonitor will start only after initialization is complete
    */
    void ready.then((r: [TabAndFrameId, true, boolean]) => {
      this._frameId.frame = r[0].frame
      this._frameId.tab = r[0].tab
      value ? MediaMonitor._startMonitoring() : MediaMonitor._stopMonitoring()
    })
  }

  /**
   * Returns an array of child media elements from an html node
   * including the parent node itself if it is a media element
   */
  private static mediaElementsFromNode (node: Node): MediaElement[] {
    const mediaElements: MediaElement[] = []
    if (!(node instanceof HTMLElement)) return mediaElements

    if (MediaRecord.isMediaElement(node)) {
      mediaElements.push(node)
    }

    if (node.childElementCount === 0) return mediaElements

    Array.from((node).querySelectorAll<MediaElement>(mediaSelector))
    // eslint-disable-next-line @typescript-eslint/unbound-method
      .filter(MediaRecord.isMediaElement)
      .forEach(mediaElement => {
        mediaElements.push(mediaElement)
      })

    return mediaElements
  }

  /**
   * Returns an array of child MediaRecords from an html node
   * including the parent node itself if it is a media element
   */
  public static mediaRecordsFromNode (parentNode: Node): MediaRecord[] {
    const mediaElements = MediaMonitor.mediaElementsFromNode(parentNode)
    const mediaOrNullRecords = mediaElements.map<MediaRecord | null>(mediaElement => {
      return MediaStore.get(mediaElement)
    })
    return mediaOrNullRecords.filter(mediaRecord => mediaRecord != null) as MediaRecord[]
  }
}

/*
  'ready' is Promise that resolves with page initialization data
  - Frame/tab id is retrieved from background
  - DOMContentLoaded event has fired
  - autoScan setting loaded from local storage
*/
const ready = Promise.all<[Promise<TabAndFrameId>, Promise<true>, Promise<boolean>]>([
  getFrameId(),
  new Promise<true>((resolve) => {
    document.addEventListener('DOMContentLoaded', () => { resolve(true) })
  }),
  chrome.storage.local.get('autoScan').then((result) => {
    return (result.autoScan ?? AUTO_SCAN_DEFAULT) as boolean
  })
]).then((r) => {
  [,,_autoObserve] = r
  MediaMonitor.monitoring = _autoObserve
  return r
})

/*
  Listeners
*/
chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  const action = message.action
  const data = message.data
  if (action == null) return

  /*
    Start/stop the MediaMonitor if auto scan setting is changed
  */
  if (message.action === MSG_AUTO_SCAN_UPDATED) {
    MediaMonitor.monitoring = data as boolean
  }
})
