/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { IS_DEBUG } from './constants'
import { type MediaElement } from './content'
import { MediaMonitor } from './mediaMonitor'
import { type MediaRecord } from './mediaRecord'

const MIN_VISIBLE_WIDTH = 50
const MIN_VISIBLE_HEIGHT = 50
const MIN_OPACITY = 0.2
const MIN_BRIGHTNESS = 0.2

const _intersectionObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    const element = entry.target as HTMLElement
    const mediaRecord = MediaMonitor.lookup(element as MediaElement)
    if (mediaRecord == null) continue
    entry.isIntersecting ? intersecting(mediaRecord) : notIntersecting(mediaRecord)
  }
}, { root: null, rootMargin: '0px', threshold: 0 })

const _documentObserver = new MutationObserver((mutationsList) => {
  for (const mutation of mutationsList) {
    if (mutation.type !== 'attributes') continue
    const mediaRecords = MediaMonitor.mediaRecordsFromNode(mutation.target)
    for (const mediaRecord of mediaRecords) {
      update(mediaRecord, 'parent: attributes')
    }
  }
})

const _resizeObserver = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const element = entry.target as HTMLElement
    if (!(element instanceof HTMLElement)) continue
    const mediaRecord = MediaMonitor.lookup(element as MediaElement)
    if (mediaRecord == null) continue
    update(mediaRecord, 'resize')
  }
})

window.addEventListener('DOMContentLoaded', () => {
  _documentObserver.observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['style', 'class'] })
})

function update (mediaRecord: MediaRecord, type: string): void {
  const visible = isStyleVisible(mediaRecord.element) && isPossitionVisible(mediaRecord.element)
  const visibilityUpdated = mediaRecord.state.visible !== visible
  if (visibilityUpdated) {
    mediaRecord.state.visible = visible
    visible ? isVisible(mediaRecord) : notVisible(mediaRecord)
  }
  if (_onUpdateCallback != null) {
    _onUpdateCallback(mediaRecord, type)
  }
}

function isVisible (mediaRecord: MediaRecord): void {
  if (_onVisibleCallback != null) {
    _onVisibleCallback(mediaRecord)
  }
}

function notVisible (mediaRecord: MediaRecord): void {
  if (_onNotVisibleCallback != null) {
    _onNotVisibleCallback(mediaRecord)
  }
}

function intersecting (mediaRecord: MediaRecord): void {
  if (_onEnterViewportCallback != null) {
    _onEnterViewportCallback(mediaRecord)
  }
  _resizeObserver.observe(mediaRecord.element)
  mediaRecord.state.viewport = true
  const visible = mediaRecord.state.visible
  const newVisibleState = isStyleVisible(mediaRecord.element)
  if (visible === newVisibleState) return // state has already been updated by another handler
  mediaRecord.state.visible = newVisibleState
  newVisibleState ? isVisible(mediaRecord) : notVisible(mediaRecord)
}

function notIntersecting (mediaRecord: MediaRecord): void {
  if (_onLeaveViewportCallback != null) {
    _onLeaveViewportCallback(mediaRecord)
  }
  _resizeObserver.unobserve(mediaRecord.element)
  mediaRecord.state.viewport = false
  if (mediaRecord.state?.visible) {
    mediaRecord.state.visible = false
    notVisible(mediaRecord)
  }
  observe(mediaRecord)
}

export function observe (
  mediaRecord: MediaRecord
): void {
  _intersectionObserver.observe(mediaRecord.element)
}

export function unobserve (mediaRecord: MediaRecord): void {
  _intersectionObserver.unobserve(mediaRecord.element)
}

function isStyleVisible (element: HTMLElement): boolean {
  const computedStyle = window.getComputedStyle(element)
  if (computedStyle.display === 'none') {
    return false
  }
  if (computedStyle.visibility === 'hidden') {
    return false
  }

  if (computedStyle.opacity !== '') {
    const opacity = parseFloat(computedStyle.opacity)
    if (opacity < MIN_OPACITY) {
      return false
    }
  }
  if (computedStyle.filter !== 'none' && computedStyle.filter !== '') {
    const brightness = parseFloat(computedStyle.filter.replace(/brightness\(|\)/g, ''))
    if (brightness < MIN_BRIGHTNESS) {
      return false
    }
  }
  return true
}

function isPossitionVisible (element: HTMLElement): boolean {
  if (element.offsetWidth < MIN_VISIBLE_WIDTH || element.offsetHeight < MIN_VISIBLE_HEIGHT) {
    return false
  }
  const rect = element.getBoundingClientRect()
  const centerX = rect.left + (rect.width / 2)
  const centerY = rect.top + (rect.height / 2)

  IS_DEBUG && mark((element as HTMLImageElement).src, centerX, centerY)

  /*
    There is an issue with this elementsFromPoint check:
    - If an IMG has a Picture element as a parent, the Picture can have a height of 0 while the IMG has a height > 0
    - The IMG will display at its normal size, but the elementsFromPoint call will not detect the Picture element nor the child IMG
      We'll need to a way to detect this type of situation
  */

  const elementsAtCenter = document.elementsFromPoint(centerX, centerY)

  while (elementsAtCenter.length > 0 && elementsAtCenter[0] !== element && isElementTransparent(elementsAtCenter[0] as HTMLElement)) {
    elementsAtCenter.shift()
  }

  if (elementsAtCenter.length === 0) {
    return false
  }

  if (elementsAtCenter[0] !== element) {
    return false
  }

  return true
}

let markDiv: HTMLDivElement | null = null

function mark (src: string, x: number, y: number): void {
  if (markDiv == null) {
    markDiv = document.createElement('div')
    document.body.appendChild(markDiv)
  }
  markDiv.style.position = 'absolute'
  markDiv.style.left = (x - 5) + 'px'
  markDiv.style.top = (y - 5) + 'px'
  markDiv.style.width = '10px'
  markDiv.style.height = '10px'
  markDiv.style.border = '1px solid red'
  markDiv.style.zIndex = '10000'
  markDiv.title = src
}

let _onEnterViewportCallback: (mediaRecord: MediaRecord) => void
export function onEnterViewport (callback: (mediaRecord: MediaRecord) => void): void {
  _onEnterViewportCallback = callback
}

let _onLeaveViewportCallback: (mediaRecord: MediaRecord) => void
export function onLeaveViewport (callback: (mediaRecord: MediaRecord) => void): void {
  _onLeaveViewportCallback = callback
}

let _onVisibleCallback: (mediaRecord: MediaRecord) => void
export function onVisible (callback: (mediaRecord: MediaRecord) => void): void {
  _onVisibleCallback = callback
}

let _onNotVisibleCallback: (mediaRecord: MediaRecord) => void
export function onNotVisible (callback: (mediaRecord: MediaRecord) => void): void {
  _onNotVisibleCallback = callback
}

let _onUpdateCallback: (mediaRecord: MediaRecord, type: string) => void
export function onUpdate (callback: (mediaRecord: MediaRecord, type: string) => void): void {
  _onUpdateCallback = callback
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function debounce<T extends (...args: unknown[]) => void> (func: T, delay: number): (...args: Parameters<T>) => void {
  let timerId: ReturnType<typeof setTimeout> | null = null
  return function (this: unknown, ...args: Parameters<T>) {
    if (timerId !== null) {
      clearTimeout(timerId)
    }
    timerId = setTimeout(() => {
      func.apply(this, args)
    }, delay)
  }
}

function checkOpacity (element: HTMLElement): boolean {
  let target: HTMLElement | null = element
  while (target != null) {
    const style = window.getComputedStyle(target)
    const currentOpacity = parseFloat(style.opacity)
    if (currentOpacity < MIN_OPACITY) {
      return false
    }
    target = target.parentElement
  }
  return true
}

function isElementTransparent (element: HTMLElement): boolean {
  const style = window.getComputedStyle(element)

  // Check background-color for transparency
  const backgroundColor = style.backgroundColor
  const isBackgroundColorTransparent = backgroundColor === 'transparent' ||
        (backgroundColor.includes('rgba') && backgroundColor.endsWith(', 0)'))

  // Check opacity
  const opacity = parseFloat(style.opacity)
  const isOpacityTransparent = opacity < 1

  return isBackgroundColorTransparent || isOpacityTransparent
}

window.addEventListener('resize', () => {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const viewportMediaRecords = MediaMonitor.all.filter((mediaRecord) => mediaRecord.state.viewport)
  viewportMediaRecords.forEach((mediaRecord) => {
    update(mediaRecord, 'resize')
  })
})

window.addEventListener('scroll', function () {
  const viewportMediaRecords = MediaMonitor.all.filter((mediaRecord) => mediaRecord.state.viewport)
  viewportMediaRecords.forEach((mediaRecord) => {
    update(mediaRecord, 'scroll')
  })
})

window.addEventListener('click', function (event) {
  const x = Math.floor(event.pageX)
  const y = Math.floor(event.pageY)
  console.debug('click', x, y)
})
