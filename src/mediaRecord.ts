/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { type C2paResult } from './c2pa'
import { IS_DEBUG } from './constants'
import { type MediaElement } from './content'
import { type CrIcon } from './icon'
import { type TabAndFrameId } from './inject'
import { elementPath, elementToString } from './utils'

console.debug('MediaRecord module loaded')

const SOURCES_TO_IGNORE = ['chrome-extension:', 'moz-extension:', 'data:']

type MediaStateTypes = 'image' | 'video' | 'audio' | 'none'

export interface MediaRecordState {
  type: MediaStateTypes
  viewport: boolean
  visible: boolean
  evaluated: boolean
  c2pa: C2paResult | null
  disposed: boolean
  ready: boolean
  tab: number
  frame: number
}

export interface MediaRecordInfo {
  frame: TabAndFrameId
  src: string
  id: number
  rect: DOMRect
  state: MediaRecordState
  icon?: {
    status: string
    src: string
  }
}

/**
 * MediaRecord is an object representing a media element in the DOM
 */
export class MediaRecord {
  private readonly _state: MediaRecordState = { type: 'none', visible: false, evaluated: false, viewport: false, c2pa: null, disposed: false, ready: false, tab: -1, frame: -1 }
  private _element: MediaElement | null = null
  private _icon: CrIcon | null = null
  private static _i = 0
  private _readyListener: ((ev: Event) => unknown | undefined) | null = null

  public static MEDIA_ELEMENT_NODE_TYPES = ['IMG', 'VIDEO', 'AUDIO']
  public readonly id
  public readonly _log: string[]

  constructor (mediaElement: MediaElement, id: TabAndFrameId) {
    this._log = ['constructor']
    this.id = MediaRecord._i++
    this._element = mediaElement
    this.state.type = MediaRecord.getType(mediaElement)
    this.state.tab = id.tab
    this.state.frame = id.frame
  }

  /**
   * Adds a message to this MediaRecord.
   * This is useful for adding tracing information for debugging.
   */
  public log (message: string): void {
    if (!IS_DEBUG) return
    this._log.push(message)
  }

  /**
   * Returns the overlay icon object for this MediaRecord.
   */
  public get icon (): CrIcon | null {
    return this._icon
  }

  /**
   * Sets the overlay icon object for this MediaRecord.
   * A new icon will replace the existing icon.
   */
  public set icon (icon: CrIcon | null) {
    if (this._icon != null) {
      this._icon.dispose()
    }
    this._icon = icon
  }

  /**
   * Gets the source of this MediaRecord
   * Empty string is returned if no source is defined
   */
  public get src (): string {
    if (IS_DEBUG) {
      if (this._element?.currentSrc == null) {
        console.error('MediaElement currentSrc is empty:', this._element)
      }
    }
    return this._element?.currentSrc ?? ''
  }

  /**
   * Gets the html element for this MediaRecord
   */
  public get element (): MediaElement {
    if (this._element == null) {
      console.debug(this._log)
      throw new Error('MediaRecord element is null')
    }
    return this._element
  }

  /**
   * Gets the state object of this MediaRecord.
   */
  public get state (): MediaRecordState {
    // TODO: put the state into the MediaRecord directly and not its own object
    return this._state
  }

  /**
   * Removes listeners and references to child objects
   */
  public dispose (): void {
    this._log.push('disposed_start')
    if (this._icon != null) {
      this._icon.dispose()
      this._icon = null
    }
    this.removeReadyListener()
    this._element = null
    this._state.disposed = true
    this._state.ready = false
    this._log.push('disposed_end')
  }

  private removeReadyListener (): void {
    if (this._readyListener != null) {
      this._element?.removeEventListener('load', this._readyListener)
      this._element?.removeEventListener('loadeddata', this._readyListener)
      this._readyListener = null
    }
  }

  /**
   * Set the onReady callback for this MediaRecord.
   * The callback is called when the MediaRecord reaches the ready state.
   */
  // eslint-disable-next-line accessor-pairs
  public set onReady (callback: (media: MediaRecord, event?: Event) => void) {
    const imgElement = this._element as HTMLImageElement
    const avElement = this._element as HTMLVideoElement | HTMLAudioElement
    const loaded = (imgElement.complete || avElement.readyState >= 2) && imgElement.naturalWidth !== 0
    if (loaded) {
      this._log.push('onReady: already loaded')
      this.state.ready = true
      callback(this)
      return
    }
    const start = performance.now()
    const onReadyHandler = function (this: { media: MediaRecord, start: number }, ev: Event): void {
      if (this.media._state.disposed) {
        console.debug('%cMediaRecord disposed before onReady', 'color: purple')
        return
      }
      this.media._log.push(`onReady: load/loadeddata ${Math.floor(performance.now() - start)}`)
      this.media.state.ready = true
      this.media.removeReadyListener()
      callback(this.media)
    }.bind({ media: this, start: performance.now() })
    imgElement.addEventListener('load', onReadyHandler)
    imgElement.addEventListener('loadeddata', onReadyHandler)
    this._readyListener = onReadyHandler
  }

  /**
   * Return the source of a media element or null for undefined/null/empty-string
   */
  public static getSrc (element: MediaElement): string | null {
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing
    return element.src || element.currentSrc || null
  }

  /**
   * Determines if a Node is a media element.
   * Media elements produced by the extension itself, such as an overlay icon, are not considered to be MediaElement.
   */
  public static isMediaElement (element: Node): element is MediaElement {
    if (!(element instanceof HTMLElement)) return false
    // We ignore media elements from this extension
    if (SOURCES_TO_IGNORE.some(source => (MediaRecord.getSrc(element as MediaElement) ?? '').startsWith(source))) {
      return false
    }
    return MediaRecord.MEDIA_ELEMENT_NODE_TYPES.includes(element.nodeName)
  }

  /**
   * Returns the type of the media element. 'image', 'video', etc.
   */
  public static getType (element: MediaElement): MediaStateTypes {
    const type = element.nodeName.toLowerCase()
    if (type === 'img') return 'image'
    return type as MediaStateTypes
  }

  /**
   * Returns an curated MediaRecord object for nice JSON.stringify output
   */
  public toJSON (): Record<string, unknown> {
    return {
      tab: this.state.tab,
      frame: this.state.frame,
      id: this.id,
      src: this.src,
      type: this.state.type,
      disposed: this.state.disposed,
      ready: this.state.ready,
      viewport: this.state.viewport,
      visible: this.state.visible,
      evaluated: this.state.evaluated,
      c2pa: this.state.c2pa != null,
      icon: this._icon == null
        ? null
        : {
            status: this._icon.status,
            src: this._icon.img.src
          },
      log: this._log,
      element: this._element != null ? elementToString(this._element) : null,
      path: this._element != null ? elementPath(this._element).split('\n') : null
    }
  }
}
