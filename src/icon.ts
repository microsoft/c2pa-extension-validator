/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { CR_ICON_SIZE, CR_ICON_Z_INDEX, type VALIDATION_STATUS, CR_ICON_MARGIN_LEFT, CR_ICON_MARGIN_TOP, IS_DEBUG } from './constants'
import { type MediaElement } from './content'

const imageSources: { [key in VALIDATION_STATUS]: string } = {
  success: chrome.runtime.getURL('icons/cr.svg'),
  warning: chrome.runtime.getURL('icons/cr!.svg'),
  error: chrome.runtime.getURL('icons/crx.svg'),
  img: chrome.runtime.getURL('icons/camera.svg'),
  video: chrome.runtime.getURL('icons/video.svg'),
  none: ''
}

const images: { [key in VALIDATION_STATUS]: HTMLImageElement | null } = {
  success: createImg(imageSources.success),
  warning: createImg(imageSources.warning),
  error: createImg(imageSources.error),
  img: createImg(imageSources.img),
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
  img.setAttribute('src', url)
  img.setAttribute('alt', 'Content Credentials')
  img.setAttribute('title', url)
  return img
}

export class CrIcon {
  private readonly _crImg!: HTMLImageElement
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

  public remove (): void {
    this._clickListener != null && this._crImg.removeEventListener('click', this._clickListener)
    console.debug('Removing CrIcon:', this._crImg.src)
    this._crImg.remove()
  }

  public get img (): HTMLImageElement {
    return this._crImg
  }

  public hide (): void {
    this._crImg.style.display = 'none'
  }

  public show (): void {
    this._crImg.style.display = ''
    this.position()
  }

  public position (): void {
    const rect = this._parent.getBoundingClientRect()
    this._crImg.style.top = `${rect.top + window.scrollY + CR_ICON_MARGIN_TOP}px`
    this._crImg.style.left = `${rect.right + window.scrollX - CR_ICON_MARGIN_LEFT}px`
  }

  // eslint-disable-next-line accessor-pairs
  set onClick (listener: (this: HTMLImageElement, ev: MouseEvent) => unknown | null) {
    this._clickListener = listener
    this._crImg.addEventListener('click', listener)
  }

  get status (): VALIDATION_STATUS {
    return this._status
  }

  set status (status: VALIDATION_STATUS) {
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
