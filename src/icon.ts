/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import Browser from 'webextension-polyfill'
import { MESSAGE_C2PA_INSPECT_URL } from './constants.js'
import { type C2paReadResult } from 'c2pa'
import { type Certificate } from '@fidm/x509'
import { ContentPopup } from './c2paStatus.js'

const CR_ICON: string = chrome.runtime.getURL('icons/cr.svg')
const CRX_ICON: string = chrome.runtime.getURL('icons/crx.svg')
const MINICONSIZE = 40

const store = new Map<HTMLImageElement, c2paImage>()

interface c2paResultWithChain extends C2paReadResult {
  certChain: Certificate[] | null
}

interface c2paImage {
  img: HTMLImageElement
  parent: HTMLImageElement
  url: string
  c2paResult: c2paResultWithChain
}

export async function c2pa (parentImage: HTMLImageElement): Promise<c2paImage | null> {
  const url = parentImage.src
  const c2paResult = await c2aValidateImage(url)
  if (c2paResult.manifestStore?.activeManifest == null) {
    console.warn(`No manifest store found for ${url}`)
    return null
  }
  const activeManifest = c2paResult.manifestStore.activeManifest
  const signature = activeManifest.signature
  const assertions = activeManifest.assertions
  const ingredients = activeManifest.ingredients
  const main = {
    title: activeManifest.title,
    format: activeManifest.format
  }

  const failure = (c2paResult.manifestStore?.validationStatus ?? []).length > 0
  const img = createImg(failure ? CRX_ICON : CR_ICON)
  const c2paImage: c2paImage = { img, parent: parentImage, url, c2paResult }
  const c2paStatus = new ContentPopup(c2paImage.c2paResult)
  c2paStatus.panel()
  c2paStatus.panel()
  c2paStatus.panel()
  img.addEventListener('click', (event) => {
    c2paStatus.position(img)
    c2paStatus.show()
  })
  store.set(parentImage, c2paImage)
  setIcon(c2paImage)
  return c2paImage
}

function createImg (url: string): HTMLImageElement {
  const img = document.createElement('img')
  img.style.height = '2em'
  img.style.width = '2em'
  img.setAttribute('src', url)
  img.setAttribute('alt', 'Content Credentials')
  img.setAttribute('title', 'Content Credentials')
  return img
}

function updateIconPosition (icon: c2paImage): void {
  const img = icon.img
  const rect = icon.parent.getBoundingClientRect()
  const width = Math.max((rect.width * 0.1) | 0, MINICONSIZE)
  const height = Math.max((rect.height * 0.1) | 0, MINICONSIZE)
  img.style.width = `${width}px`
  img.style.height = `${height}px`
  img.style.top = `${rect.y + window.scrollY + rect.height - height - 5}px`
  img.style.left = `${rect.x + window.scrollX + rect.width - width}px`
}

function setIcon (icon: c2paImage): void {
  const node = icon.parent
  const img = icon.img
  img.style.position = 'absolute'
  // make sure the zIndex is higher than that of the target element
  const zIndex = window.getComputedStyle(node).getPropertyValue('z-index')
  img.style.zIndex = `${Number.parseInt(zIndex) + 1}`
  document.body.appendChild(img)
  updateIconPosition(icon)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function c2aValidateImage (url: string): Promise<c2paResultWithChain> {
  return await Browser.runtime.sendMessage({ action: MESSAGE_C2PA_INSPECT_URL, data: url })
    .then((result) => {
      if (result != null) {
        return result
      } else {
        console.log('Null result')
      }
    })
    .catch((error) => {
      console.error('Error sending message:', error)
    })
}

window.addEventListener('resize', function () {
  store.forEach((icon) => {
    updateIconPosition(icon)
  })
})
