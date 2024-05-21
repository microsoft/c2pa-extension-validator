/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { AUTO_SCAN_DEFAULT, MSG_AUTO_SCAN_UPDATED } from './constants'
import { type MediaElement } from './content'
import { MediaRecord } from './mediaRecord'

console.debug('Media module loaded')

const mediaSelector = MediaRecord.MEDIA_ELEMENT_NODE_TYPES.join(',').toLocaleLowerCase()
let _autoObserve: boolean

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class MediaMonitor {
  private static readonly _mediaRecords = new Map<MediaElement, MediaRecord>()
  private static _monitoring: boolean = false
  private static _onMonitoringStartCallback: ((monitor: MediaMonitor) => void) | null = null
  private static _onMonitoringStopCallback: ((monitor: MediaMonitor) => void) | null = null
  private static _addCallback: ((media: MediaRecord) => void) | null = null
  private static _removeCallback: ((media: MediaRecord) => void) | null = null
  private static mutationObserver: MutationObserver

  static {
    MediaMonitor.mutationObserver = new MutationObserver((mutationsList: MutationRecord[]) => {
      mutationsList.forEach(mutation => {
        if (mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach(node => {
            const mediaElements = MediaMonitor.mediaElementsFromNode(node)
            mediaElements.forEach(mediaElement => {
              MediaMonitor.add(mediaElement)
            })
          })
        }
        if (mutation.removedNodes.length > 0) {
          mutation.removedNodes.forEach(node => {
            const mediaElements = MediaMonitor.mediaElementsFromNode(node)
            mediaElements.forEach(mediaElement => {
              MediaMonitor._remove(mediaElement)
            })
          })
        }
        if (mutation.type !== 'attributes') return
        const node = mutation.target
        if (!MediaRecord.isMediaElement(node)) return
        const media = MediaMonitor.lookup(node)
        if (media == null) {
          // Not previously observed and added
          console.error('%cMediaElement not found', 'color: orange', node)
          return
        }
        const src = MediaRecord.getSrc(node)
        if (src === media.src) { // this can happen when the src is set to the same value
          return
        }
        MediaMonitor._remove(node)
        MediaMonitor.add(node)
      })
    })
  }

  private static _startMonitoring (): void {
    if (MediaMonitor._monitoring) {
      console.error('Monitor already started')
      return
    }

    MediaMonitor._monitoring = true
    if (MediaMonitor._onMonitoringStartCallback != null) {
      MediaMonitor._onMonitoringStartCallback(MediaMonitor)
    }
    const mediaElements = MediaMonitor.mediaElementsFromNode(document.body)
    mediaElements.forEach(mediaElement => {
      MediaMonitor.add(mediaElement)
    })
    MediaMonitor.mutationObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'currentSrc'] })
  }

  private static _stopMonitoring (): void {
    if (!MediaMonitor._monitoring) {
      console.error('Monitor already stopped')
      return
    }
    if (MediaMonitor._onMonitoringStopCallback != null) {
      MediaMonitor._onMonitoringStopCallback(MediaMonitor)
    }

    MediaMonitor.mutationObserver.disconnect()
    MediaMonitor._monitoring = false
  }

  public static add (element: MediaElement): MediaRecord {
    const exitingInstance = MediaMonitor.lookup(element)

    if (exitingInstance != null) {
      return exitingInstance
    }
    const newRecord = new MediaRecord(element)
    MediaMonitor._mediaRecords.set(element, newRecord)
    if (MediaMonitor._addCallback != null) {
      MediaMonitor._addCallback(newRecord)
    }
    return newRecord
  }

  private static _remove (element: MediaElement): void {
    const storedInstance = MediaMonitor._mediaRecords.get(element)

    if (storedInstance == null) {
      console.error('%cMediaElement does not exist:', 'color: orange', MediaRecord.getSrc(element))
      return
    }

    if (MediaMonitor._removeCallback != null) {
      MediaMonitor._removeCallback(storedInstance)
    }

    MediaMonitor._mediaRecords.delete(element)
  }

  // eslint-disable-next-line accessor-pairs
  public static set onMonitoringStart (value: ((monitor: MediaMonitor) => void) | null) {
    MediaMonitor._onMonitoringStartCallback = value
  }

  // eslint-disable-next-line accessor-pairs
  public static set onMonitoringStop (value: ((monitor: MediaMonitor) => void) | null) {
    MediaMonitor._onMonitoringStopCallback = value
  }

  // eslint-disable-next-line accessor-pairs
  public static set onAdd (value: ((media: MediaRecord) => void) | null) {
    MediaMonitor._addCallback = value
  }

  // eslint-disable-next-line accessor-pairs
  public static set onRemove (value: ((media: MediaRecord) => void) | null) {
    MediaMonitor._removeCallback = value
  }

  public static get monitoring (): boolean {
    return MediaMonitor._monitoring
  }

  public static set monitoring (value: boolean) {
    value ? MediaMonitor._startMonitoring() : MediaMonitor._stopMonitoring()
  }

  public static get all (): MediaRecord[] {
    return Array.from(MediaMonitor._mediaRecords.values())
  }

  public static lookup (element: MediaElement): MediaRecord | null {
    return MediaMonitor._mediaRecords.get(element) ?? null
  }

  public static mediaElementsFromNode (node: Node): MediaElement[] {
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

  public static mediaRecordsFromNode (parentNode: Node): MediaRecord[] {
    const mediaElements = MediaMonitor.mediaElementsFromNode(parentNode)
    const mediaOrNullRecords = mediaElements.map<MediaRecord | null>(mediaElement => {
      return MediaMonitor.lookup(mediaElement)
    })
    return mediaOrNullRecords.filter(mediaRecord => mediaRecord != null) as MediaRecord[]
  }
}

function DOMContentLoaded (): void {
  if (_autoObserve != null) {
    MediaMonitor.monitoring = _autoObserve
  }
}

void chrome.storage.local.get('autoScan').then((result) => {
  _autoObserve = result.autoScan ?? AUTO_SCAN_DEFAULT
  if (document.body != null) {
    MediaMonitor.monitoring = _autoObserve
  }
})

chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  const action = message.action
  const data = message.data
  if (action == null) return

  if (message.action === MSG_AUTO_SCAN_UPDATED) {
    MediaMonitor.monitoring = data as boolean
  }
})

document.addEventListener('DOMContentLoaded', DOMContentLoaded)
