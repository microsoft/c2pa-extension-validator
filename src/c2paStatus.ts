/* eslint-disable @typescript-eslint/no-non-null-assertion */
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import browser from 'webextension-polyfill'
import { type C2paReadResult } from 'c2pa'
import { type MESSAGE_PAYLOAD, type C2paResult } from './types'
import { logDebug } from './utils'

logDebug('c2paStatus.ts: load')

const iframeStore = new Map<string, HTMLIFrameElement>()

export class C2PADialog /* extends HTMLElement */ {
  private constructor (private readonly c2paImage: C2paReadResult, private readonly iframe: HTMLIFrameElement) {
    this.hide()
  }

  static async create (c2paResult: C2paResult, tabId: number): Promise<C2PADialog> {
    const random1 = randomString(16)
    const random2 = randomString(16) + ':' + tabId
    await browser.storage.local.set({ [random1]: random2 })
    const iframe: HTMLIFrameElement = document.createElement('iframe')
    iframe.className = 'c2paDialog'
    iframe.id = random1
    iframe.src = `${chrome.runtime.getURL('iframe.html')}?id=${random1}`
    iframe.style.position = 'absolute'
    iframe.style.zIndex = '1000'
    iframe.style.visibility = 'hidden'
    iframe.style.resize = 'none'
    iframe.style.overflow = 'hidden'
    iframe.style.border = 'none'
    iframe.style.background = 'none'

    iframeStore.set(random1, iframe)

    return await new Promise((resolve, reject) => {
      iframe.onload = () => {
        logDebug('iframe onload event fired: sending message to iframe.')
        setTimeout(() => {
          iframe.contentWindow?.postMessage({ id: random2, data: c2paResult }, iframe.src)
          resolve(new C2PADialog(c2paResult, iframe))
        }, 0)
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
  }

  position (element: HTMLElement): void {
    const boundRect = element.getBoundingClientRect()

    // check if the fixed element will go off the right edge of the screen
    this.iframe.style.left =
            boundRect.right + this.iframe.offsetWidth > window.innerWidth
              ? `${window.innerWidth - this.iframe.offsetWidth - 10}px`
              : `${boundRect.right}px`

    // check if the fixed element will go off the bottom edge of the screen
    this.iframe.style.top = `${boundRect.top}px`
    // boundRect.bottom + this.iframe.offsetHeight > window.innerHeight
    //   ? `${window.innerHeight - this.iframe.offsetHeight - 10}px`
    //   : (this.iframe.style.top = `${boundRect.bottom}px`)
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
  async (request: MESSAGE_PAYLOAD, _sender) => {
    if (request.action === 'updateFrame' && request.data != null && request.frame != null) {
      const iframe = iframeStore.get(request.frame)
      if (iframe != null) {
        iframe.style.height = `${request.data as number}px`
      }
    }
  }
)
