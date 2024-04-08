/* eslint-disable @typescript-eslint/no-non-null-assertion */
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import browser from 'webextension-polyfill'
import { type MESSAGE_PAYLOAD } from './types'
import { type C2paResult } from './c2pa'
import { type FrameMessage } from './iframe'

console.debug('c2paStatus.ts: load')

const iframeStore = new Map<string, HTMLIFrameElement>()

export class C2PADialog /* extends HTMLElement */ {
  private constructor (public readonly c2paResult: C2paResult, private readonly c2paElement: HTMLMediaElement, private readonly iframe: HTMLIFrameElement, private readonly _id: string, private readonly frameSecret: string) {
    this.hide()
  }

  static async create (c2paResult: C2paResult, element: HTMLMediaElement, tabId: number): Promise<C2PADialog> {
    const frameId = randomString(16)
    const frameSecret = randomString(16) + ':' + tabId
    await browser.storage.local.set({ [frameId]: frameSecret })

    const iframe: HTMLIFrameElement = document.createElement('iframe')
    iframe.className = 'c2paDialog'
    iframe.id = frameId
    iframe.src = `${chrome.runtime.getURL('iframe.html')}?id=${frameId}`
    iframe.style.cssText = `
    position: absolute;
    z-index: 1000;
    visibility: hidden;
    resize: none;
    overflow: hidden;
    /* border: none; */
    background: none;
    border-radius: 5px;
    /* padding: 10px; */
    border: 1px solid #DDDDDD;
    box-shadow: 0px 0px 12px 0px rgba(0, 0, 0, 0.2);
    /* margin-top: -20px; */
    /* margin-left: -15px; */
  `.replace(';', '!important;')

    iframeStore.set(frameId, iframe)

    return await new Promise((resolve, reject) => {
      iframe.onload = () => {
        console.debug('iframe onload event fired: sending message to iframe.')
        iframe.contentWindow?.postMessage({ action: 'c2paResult', secret: frameSecret, data: c2paResult } satisfies FrameMessage, iframe.src)
        resolve(new C2PADialog(c2paResult, element, iframe, frameId, frameSecret))
      }
      document.body.appendChild(iframe)
    })
  }

  show (): void {
    this.iframe.style.visibility = 'visible'

    // eslint-disable-next-line no-unused-vars
    const closeListener = (event: Event): void => {
      const isClickInsideElement = this.iframe.contains(event.target as Node)
      if (!isClickInsideElement) {
        document.removeEventListener('click', closeListener)
        this.hide()
      }
    }
    // Delay the addition of the listener to avoid the click that just triggered the show()
    setTimeout(() => { document.addEventListener('click', closeListener) }, 0)
  }

  hide (): void {
    // this.iframe.style.display = 'none'
    this.iframe.style.visibility = 'hidden'
    this.iframe.contentWindow?.postMessage({ action: 'close', secret: this.frameSecret, data: null } satisfies FrameMessage, this.iframe.src)
  }

  position (element: HTMLElement): void {
    const boundRect = element.getBoundingClientRect()
    const gap = 5 // Gap between the image and the overlay

    // Calculate left position considering page scroll, viewport width, and the gap
    const leftPosition = window.scrollX + boundRect.right + gap // Add gap to the left position
    const adjustedLeftPosition =
        boundRect.right + this.iframe.offsetWidth + gap > window.innerWidth
          ? window.innerWidth - this.iframe.offsetWidth + window.scrollX - gap // Adjust for gap when aligning to the left
          : leftPosition

    // Calculate top position considering page scroll, viewport height, and potential adjustment
    const topPosition = window.scrollY + boundRect.top
    const adjustedTopPosition =
        boundRect.top + this.iframe.offsetHeight + gap > window.innerHeight
          ? window.innerHeight - this.iframe.offsetHeight + window.scrollY - gap // Adjust to fit within viewport height
          : topPosition

    // Set the style for iframe with the adjusted positions
    this.iframe.style.left = `${adjustedLeftPosition}px`
    this.iframe.style.top = `${adjustedTopPosition}px`
  }

  add (title: string, content: string): HTMLDivElement {
    // Create the main container for the new collapsible section
    const collapsible = document.createElement('div')
    collapsible.className = 'collapsible'

    // Create the header for the new section
    const header = document.createElement('div')
    header.className = 'collapsible-header'
    header.innerHTML = `<span>${title}</span><span class="collapsible-icon">+</span>`

    // Create the content container for the new section
    const contentContainer = document.createElement('div')
    contentContainer.className = 'collapsible-content'
    contentContainer.innerHTML = `<p>${content}</p>`

    // Append the header and content to the main container
    collapsible.appendChild(header)
    collapsible.appendChild(contentContainer)

    // Find the container where the collapsible sections should be added
    const container = document.getElementById('collapsible-container') as HTMLDivElement
    container.appendChild(collapsible)

    // Attach the click event listener to the new header
    header.addEventListener('click', function () {
      const icon = this.querySelector('.collapsible-icon')!
      const nextContent = this.nextElementSibling as HTMLElement

      // Toggle content visibility
      nextContent.style.maxHeight = nextContent.style.maxHeight ?? nextContent.scrollHeight + 'px'
      // Toggle the icon
      icon.textContent = icon.textContent === '+' ? '-' : '+'

      // Optionally toggle an 'expanded' class for more control
      nextContent.classList.toggle('expanded')
    })

    return collapsible
  }

  get id (): string {
    return this._id
  }

  get status (): { trusted: boolean, valid: boolean } {
    return { trusted: this.c2paResult.trustList != null, valid: (this.c2paResult.manifestStore?.validationStatus ?? []).length === 0 }
  }
}

function randomString (length: number): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(length))
  let binary = ''
  for (let i = 0; i < randomBytes.length; i++) {
    binary += String.fromCharCode(randomBytes[i])
  }
  const base64String = btoa(binary)
  return base64String.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/*
  The IFrame cannot resize itself in the tab's document, so it sends a message to the
  content script, and the content script resizes the IFrame.

*/
browser.runtime.onMessage.addListener(
  (request: MESSAGE_PAYLOAD, _sender) => {
    if (request.action === 'updateFrame' && request.data != null && request.frame != null) {
      const iframe = iframeStore.get(request.frame)
      if (iframe != null) {
        console.debug('c2paStatus: updateFrame: ', request.data as number)
        iframe.style.height = `${request.data as number}px`
      }
    }
  }
)
