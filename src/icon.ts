/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { type MediaElement } from './content'

const CR_VALID_ICON: string = chrome.runtime.getURL('icons/cr.svg')
const CR_ERROR_ICON: string = chrome.runtime.getURL('icons/crx.svg')
const CR_WARNING_ICON: string = chrome.runtime.getURL('icons/cr!.svg')

const store = new Map<HTMLElement, C2paImage>()

export type VALIDATION_STATUS = 'success' | 'warning' | 'error'
const statusIcon = (status: VALIDATION_STATUS): string => {
  switch (status) {
    case 'success':
      return CR_VALID_ICON
    case 'warning':
      return CR_WARNING_ICON
    case 'error':
      return CR_ERROR_ICON
  }
}

export interface C2paImage {
  img: HTMLImageElement
  parent: HTMLElement
  url: string
}

export function icon (parent: MediaElement, url: string, status: VALIDATION_STATUS, listener: (this: HTMLImageElement, ev: MouseEvent) => unknown): C2paImage {
  const img = createImg(statusIcon(status))
  const c2paImage: C2paImage = { img, parent, url }

  img.addEventListener('click', listener)
  store.set(parent, c2paImage)
  setIcon(c2paImage)
  return c2paImage
}

function createImg (url: string): HTMLImageElement {
  const img = document.createElement('img')
  img.style.height = '2em'
  img.style.width = '2em'
  img.style.border = 'none'
  img.setAttribute('src', url)
  img.setAttribute('alt', 'Content Credentials')
  img.setAttribute('title', 'Content Credentials')
  return img
}

function updateIconPosition (icon: C2paImage, MINICONSIZE: number, MAXICONSIZE: number): void {
  const img = icon.img
  const rect = icon.parent.getBoundingClientRect()

  // Calculate width and height as 10% of the parent's size, but constrain within min and max sizes
  const scaleSize = Math.min(rect.width, rect.height) * 0.1 // 10% of the smaller dimension of parent
  const size = Math.max(Math.min(scaleSize, MAXICONSIZE), MINICONSIZE) // Constrain between MIN and MAX

  img.style.width = `${size}px`
  img.style.height = `${size}px` // Keep the icon square
  img.style.position = 'absolute' // Ensure position is absolute to place it correctly
  img.style.padding = '0'
  img.style.margin = '0'

  // Position the icon in the top right corner of the parent
  img.style.top = `${rect.top + window.scrollY + 5}px` // Use rect.top for vertical positioning
  img.style.left = `${rect.right + window.scrollX - size - 5}px` // Adjusted to keep the icon in the right
}

function setIcon (icon: C2paImage): void {
  const node = icon.parent
  const img = icon.img
  img.style.position = 'absolute'
  // make sure the zIndex is higher than that of the target element
  const zIndex = window.getComputedStyle(node).getPropertyValue('z-index')
  img.style.zIndex = `${Number.parseInt(zIndex) + 1}`
  document.body.appendChild(img)
  updateIconPosition(icon, 30, 60)
}

window.addEventListener('resize', function () {
  store.forEach((icon) => {
    updateIconPosition(icon, 30, 60)
  })
})
