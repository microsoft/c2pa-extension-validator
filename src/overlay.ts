/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { AWAIT_ASYNC_RESPONSE, MSG_UPDATE_FRAME_HEIGHT, type MSG_PAYLOAD } from './constants'

console.debug('Overlay.ts: load')

export class C2paOverlay /* extends HTMLElement */ {
  private static singleInstance: C2paOverlay
  private readonly _iframe: HTMLIFrameElement

  private constructor () {
    const iframe: HTMLIFrameElement = document.createElement('iframe')
    iframe.className = 'c2paDialog'
    iframe.src = `${chrome.runtime.getURL('iframe.html')}`
    iframe.tabIndex = 0
    iframe.style.cssText = `
    position: absolute;
    z-index: 1000;
    visibility: hidden;
    resize: none;
    overflow: hidden;
    background: none;
    border-radius: 5px;
    border: 1px solid #DDDDDD;
    box-shadow: 0px 0px 12px 0px rgba(0, 0, 0, 0.2);
  `.replace(';', '!important;')
    this._iframe = iframe
    this.hide()

    document.addEventListener('DOMContentLoaded', () => {
      document.body.appendChild(iframe)
    })

    /*
      The IFrame cannot resize itself from within the IFrame.
      It needs the parent to resize it.
    */
    chrome.runtime.onMessage.addListener(
      (request: MSG_PAYLOAD, sender, sendResponse) => {
        if (request.action === MSG_UPDATE_FRAME_HEIGHT) {
          this._iframe.style.height = `${request.data as number}px`
          sendResponse({ status: 'OK' })
        }
        return AWAIT_ASYNC_RESPONSE
      }
    )
  }

  public static get overlay (): C2paOverlay {
    if (this.singleInstance == null) {
      this.singleInstance = new C2paOverlay()
    }
    return this.singleInstance
  }

  show (x: number, y: number): void {
    this.position(x, y)
    this._iframe.style.visibility = 'visible'
    this._iframe.focus()
  }

  hide (): void {
    if (this._iframe.style.visibility !== 'hidden') {
      this._iframe.style.visibility = 'hidden'
    }
  }

  position (x: number, y: number): void {
    const margin = 5

    const leftPosition = window.scrollX + x + margin
    const adjustedLeftPosition =
        x + this._iframe.offsetWidth + margin > window.innerWidth
          ? window.innerWidth - this._iframe.offsetWidth + window.scrollX - margin
          : leftPosition

    const topPosition = window.scrollY + y
    const adjustedTopPosition =
        y + this._iframe.offsetHeight + margin > window.innerHeight
          ? window.innerHeight - this._iframe.offsetHeight + window.scrollY - margin
          : topPosition

    this._iframe.style.left = `${adjustedLeftPosition}px`
    this._iframe.style.top = `${adjustedTopPosition}px`
  }
}
