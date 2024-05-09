/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { type C2paResult } from './c2pa'
import { IS_DEBUG } from './constants'
import { type MediaElement } from './content'
import { type CrIcon } from './icon'

console.debug('MediaRecord module loaded')

const SOURCES_TO_IGNORE = ['chrome-extension:', 'moz-extension:']

type MediaStateTypes = 'image' | 'video' | 'audio' | 'none'

export interface MediaRecordState {
  type: MediaStateTypes
  viewport: boolean
  visible: boolean
  evaluated: boolean
  c2pa: C2paResult | null
}

export class MediaRecord {
  private readonly _state: MediaRecordState = { type: 'none', visible: false, evaluated: false, viewport: false, c2pa: null }
  private readonly _src: string | null = null
  private readonly _element: MediaElement
  private _icon: CrIcon | null = null

  public static MEDIA_ELEMENT_NODE_TYPES = ['IMG', 'VIDEO', 'AUDIO']

  constructor (mediaElement: MediaElement) {
    this._element = mediaElement
    this._src = MediaRecord.getSrc(mediaElement)
    this.state.type = mediaElement.nodeName.toLowerCase() as MediaStateTypes
  }

  public get icon (): CrIcon | null {
    return this._icon
  }

  public set icon (icon: CrIcon | null) {
    if (this._icon != null) {
      this._icon.remove()
    }
    this._icon = icon
  }

  public get src (): string | null {
    return this._src
  }

  public get element (): MediaElement {
    return this._element
  }

  public get state (): MediaRecordState {
    return this._state
  }

  // eslint-disable-next-line accessor-pairs
  public set onReady (callback: (media: MediaRecord) => void) {
    const imgElement = this._element as HTMLImageElement
    const avElement = this._element as HTMLVideoElement | HTMLAudioElement
    let loaded = (imgElement.complete || avElement.readyState >= 2) && imgElement.naturalWidth !== 0
    if (loaded) {
      callback(this)
      return
    }
    const listener = (): void => {
      loaded = true
      callback(this)
      imgElement.removeEventListener('load', listener)
    }
    imgElement.addEventListener('load', listener)
    if (!IS_DEBUG) return
    // If, for some reason, the load event is not fired, we will log an error after 2 seconds
    // We expect the load event to be allways be fired
    setTimeout(() => {
      if (!loaded) {
        console.error('MediaElement ready timeout:', this._element)
      }
    }, 2000)
  }

  public static getSrc (element: MediaElement): string | null {
    // return the source of the media element, null for undefined/null/empty-string
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing
    return element.src || element.currentSrc || null
  }

  public static isMediaElement (element: Node): element is MediaElement {
    if (!(element instanceof HTMLElement)) return false
    // We ingore media elements from this extension
    if (SOURCES_TO_IGNORE.some(source => (MediaRecord.getSrc(element as MediaElement) ?? '').startsWith(source))) {
      return false
    }
    return MediaRecord.MEDIA_ELEMENT_NODE_TYPES.includes(element.nodeName)
  }
}
