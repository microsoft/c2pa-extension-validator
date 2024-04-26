/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { CR_ICON_SIZE, CR_ICON_Z_INDEX, type VALIDATION_STATUS, CR_ICON_MARGIN_LEFT, CR_ICON_MARGIN_TOP } from './constants'
import { type MediaElement } from './content'

const imageSources: { [key in VALIDATION_STATUS]: string } = {
  success: chrome.runtime.getURL('icons/cr.svg'),
  warning: chrome.runtime.getURL('icons/cr!.svg'),
  error: chrome.runtime.getURL('icons/crx.svg')
}

const images: { [key in VALIDATION_STATUS]: HTMLImageElement } = {
  success: createImg(imageSources.success),
  warning: createImg(imageSources.warning),
  error: createImg(imageSources.error)
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
  img.setAttribute('title', 'Content Credentials')
  return img
}

/*
  When the web page is resized, the parent images can shift in ways that make the CR icon no longer line up with the parent image.
  To address this, we need to listen for the resize event and reposition the CR icons.
*/
window.addEventListener('resize', function () {
  CrIcon.updateAll()
})

export class CrIcon {
  private static readonly _store = new Set<CrIcon>()
  private readonly _crImg: HTMLImageElement
  private readonly _parent: MediaElement
  private _status: VALIDATION_STATUS
  private _clickListener: ((this: HTMLImageElement, ev: MouseEvent) => unknown) | undefined

  constructor (parent: MediaElement, status: VALIDATION_STATUS) {
    this._parent = parent
    this._status = status
    this._crImg = images[status].cloneNode() as HTMLImageElement
    document.body.appendChild(this._crImg)
    this.position()
    CrIcon._store.add(this)
  }

  public remove (): void {
    this._clickListener != null && this._crImg.removeEventListener('click', this._clickListener)
    this._crImg.remove()
    CrIcon._store.delete(this)
  }

  public hide (): void {
    this._crImg.style.display = 'none'
  }

  public show (): void {
    this._crImg.style.display = 'absolute'
  }

  public position (): void {
    const rect = this._parent.getBoundingClientRect()
    this._crImg.style.top = `${rect.top + window.scrollY + CR_ICON_MARGIN_TOP}px`
    this._crImg.style.left = `${rect.right + window.scrollX - CR_ICON_MARGIN_LEFT}px` // TODO: what is 30?
  }

  // eslint-disable-next-line accessor-pairs
  set onClick (listener: (this: HTMLImageElement, ev: MouseEvent) => unknown) {
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

  public static updateAll (): void {
    CrIcon._store.forEach((icon) => {
      icon.position()
    })
  }
}
