/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { CR_ICON_SIZE, CR_ICON_Z_INDEX, type VALIDATION_STATUS, CR_ICON_MARGIN_RIGHT, CR_ICON_MARGIN_TOP, CR_ICON_AUDIO_MARGIN_TOP, CR_ICON_AUDIO_MARGIN_RIGHT } from './constants'
import { type MediaElement } from './content'

const imageSources: { [key in VALIDATION_STATUS]: string } = {
  success: chrome.runtime.getURL('icons/cr.svg'),
  warning: chrome.runtime.getURL('icons/cr!.svg'),
  error: chrome.runtime.getURL('icons/crx.svg'),
  image: chrome.runtime.getURL('icons/camera.svg'),
  video: chrome.runtime.getURL('icons/video.svg'),
  audio: chrome.runtime.getURL('icons/audio.svg'),
  none: ''
}

const images: { [key in VALIDATION_STATUS]: HTMLImageElement | null } = {
  success: createImg(imageSources.success),
  warning: createImg(imageSources.warning),
  error: createImg(imageSources.error),
  audio: createImg(imageSources.audio),
  image: createImg(imageSources.image),
  video: createImg(imageSources.video),
  none: null
}

function createImg (url: string): HTMLImageElement {
  const img = document.createElement('img')
  img.style.height = CR_ICON_SIZE
  img.style.width = CR_ICON_SIZE
  img.style.position = 'absolute'
  img.style.padding = '0'
  img.style.margin = '0'
  img.style.zIndex = CR_ICON_Z_INDEX.toString()
  img.setAttribute('c2pa-icon', 'c2pa-icon')
  img.setAttribute('src', url)
  img.setAttribute('alt', 'Content Credentials')
  img.setAttribute('title', url)
  return img
}

export class CrIcon {
  private _crImg!: HTMLImageElement | null
  private readonly _parent: MediaElement
  private _status: VALIDATION_STATUS
  private _clickListener: ((this: HTMLImageElement, ev: MouseEvent) => unknown) | undefined

  constructor (parent: MediaElement, status: VALIDATION_STATUS) {
    this._parent = parent
    this._status = status
    const image = images[status]
    if (image != null) {
      this._crImg = image.cloneNode() as HTMLImageElement
      document.body.appendChild(this._crImg)
      this._crImg.title = parent.src
    }
    this.show()
  }

  public dispose (): void {
    if (this._crImg == null) return
    if (this._clickListener != null) this._crImg.removeEventListener('click', this._clickListener)
    this._crImg.remove()
    this._crImg = null
  }

  public get img (): HTMLImageElement {
    if (this._crImg == null) {
      throw new Error('Icon not created')
    }
    return this._crImg
  }

  public hide (): void {
    if (this._crImg == null) {
      throw new Error('Icon not created')
    }
    this._crImg.style.display = 'none'
  }

  public show (): void {
    if (this._crImg == null) {
      throw new Error('Icon not created')
    }
    this._crImg.style.display = ''
    this.position()
  }

  public position (topOffset = this._status === 'audio' ? CR_ICON_AUDIO_MARGIN_TOP : CR_ICON_MARGIN_TOP, rightOffset = this._status === 'audio' ? CR_ICON_AUDIO_MARGIN_RIGHT : CR_ICON_MARGIN_RIGHT): void {
    if (this._crImg == null) {
      throw new Error('Icon not created')
    }
    const rect = this._parent.getBoundingClientRect()
    this._crImg.style.top = `${rect.top + window.scrollY + topOffset}px`
    this._crImg.style.left = `${rect.right + window.scrollX - this._crImg.width - rightOffset}px`
  }

  // eslint-disable-next-line accessor-pairs
  set onClick (listener: (this: HTMLImageElement, ev: MouseEvent) => unknown | null) {
    if (this._crImg == null) {
      throw new Error('Icon not created')
    }
    this._clickListener = listener
    this._crImg.addEventListener('click', listener)
  }

  get status (): VALIDATION_STATUS {
    return this._status
  }

  set status (status: VALIDATION_STATUS) {
    if (this._crImg == null) {
      throw new Error('Icon not created')
    }
    if (!CrIcon.validateStatus(status)) {
      throw new Error('Invalid status')
    }
    this._status = status
    this._crImg.src = imageSources[status]
  }

  private static validateStatus (status: unknown): status is VALIDATION_STATUS {
    return ['success', 'warning', 'error'].includes(status as string)
  }
}
