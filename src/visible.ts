/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { type MediaElement } from './content'
import { MediaMonitor } from './mediaMonitor'
import { type MediaRecord } from './mediaRecord'
import { MediaStore } from './mediaStore'

const MIN_VISIBLE_WIDTH = 50
const MIN_VISIBLE_HEIGHT = 50
const MIN_OPACITY = 0.2
const MIN_BRIGHTNESS = 0.2

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class VisibilityMonitor {
  private static _intersectionObserver: IntersectionObserver
  private static _attributeMutaionObserver: MutationObserver
  private static _resizeObserver: ResizeObserver
  private static _onEnterViewportCallback: ((mediaRecord: MediaRecord) => Promise<void>) | null = null
  private static _onLeaveViewportCallback: ((mediaRecord: MediaRecord) => void) | null = null
  private static _onUpdateCallback: ((mediaRecord: MediaRecord) => void) | null = null
  private static _onVisibleCallback: ((mediaRecord: MediaRecord) => void) | null = null
  private static _onNotVisibleCallback: ((mediaRecord: MediaRecord) => void) | null = null

  private static readonly ignoreStyleUpdates: HTMLElement[] = []

  static {
    this._intersectionObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const element = entry.target as HTMLElement
        const mediaRecord = MediaStore.get(element as MediaElement)

        if (mediaRecord?.state.disposed === true) {
          // eslint-disable-next-line no-debugger
          debugger // How are disposed elements still in the store?
        }

        if (mediaRecord == null) continue // Ignore elements that are not in the store
        if (entry.isIntersecting) {
          this.intersecting(mediaRecord)
        } else {
          this.notIntersecting(mediaRecord)
        }
      }
    }, { root: null, rootMargin: '0px', threshold: 0 })

    this._attributeMutaionObserver = new MutationObserver((mutationsList) => {
      for (const mutation of mutationsList) {
        if (mutation.type !== 'attributes') continue
        const mediaRecords = MediaMonitor.mediaRecordsFromNode(mutation.target).filter((mediaRecord) => {
          const ignore = this.ignoreStyleUpdates.includes(mediaRecord.element)
          return !ignore
        })
        for (const mediaRecord of mediaRecords) {
          this.checkVisibility(mediaRecord, 'parent: attributes')
        }
      }
      // this.ignoreStyleUpdates.length = 0
    })

    this._resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const element = entry.target as HTMLElement
        if (!(element instanceof HTMLElement)) continue
        const mediaRecord = MediaStore.get(element as MediaElement)
        if (mediaRecord == null) continue
        this.checkVisibility(mediaRecord, 'resize')
      }
    })

    window.addEventListener('scroll', function () {
      const viewportMediaRecords = VisibilityMonitor.inViewport
      viewportMediaRecords.forEach((mediaRecord) => {
        VisibilityMonitor.checkVisibility(mediaRecord, 'scroll')
      })
    })

    window.addEventListener('DOMContentLoaded', () => {
      this._attributeMutaionObserver.observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['style', 'class'], attributeOldValue: true })
    })
  }

  private static intersecting (mediaRecord: MediaRecord): void {
    mediaRecord.state.viewport = true
    mediaRecord.log('VisibilityMonitor.intersecting')
    void this._onEnterViewportCallback?.(mediaRecord)
    this.checkVisibility(mediaRecord, 'intersecting')
    this._resizeObserver.observe(mediaRecord.element)
  }

  private static isStyleVisible (element: HTMLElement): boolean {
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

  /*
    This function is used to check if an element is visible on the screen.
    It checks if the element has a width and height greater than 0, and if the center of the element is visible on the screen.
    The function will return false if the element is not visible on the screen, or true if it is.
  */
  private static isPositionVisible (element: HTMLElement): boolean {
    if (element.offsetWidth < MIN_VISIBLE_WIDTH || element.offsetHeight < MIN_VISIBLE_HEIGHT) {
      return false
    }

    // if (element.parentElement?.nodeName === 'PICTURE') {
    //   if (element.parentElement?.parentElement != null && VisibilityMonitor.isPositionVisible(element.parentElement?.parentElement)) {
    //     return true
    //   }
    // }

    const rect = element.getBoundingClientRect()
    const centerX = rect.left + (rect.width / 2)
    const centerY = rect.top + (rect.height / 2)

    /*
      There is an issue with this elementsFromPoint check:
      - If an IMG has a Picture element as a parent, the Picture can have a height of 0 while the IMG has a height > 0
      - The IMG will display at its normal size, but the elementsFromPoint call will not detect the Picture element nor the child IMG
        We'll need to a way to detect this type of situation
    */

    /*
      elementsFromPoint() returns a stack of elements at the given coordinates, with the topmost element being the first element in the stack.
    */

    this.ignoreStyleUpdates.push(element)

    const pe = element.style.pointerEvents
    element.style.pointerEvents = 'auto'

    const elementsAtCenter = document.elementsFromPoint(centerX, centerY)

    element.style.pointerEvents = pe

    // this.ignoreStyleUpdates.pop()

    /*
      If there no elements are returned, the element cannot be visible on the screen at that point.
      If the topmost element is not the element we are checking, it may potentially be covering the element we are checking.
      So we check it for transparency and remove it from the stack if it is transparent.
    */
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

  private static isVisible (mediaRecord: MediaRecord): void {
    this._onVisibleCallback?.(mediaRecord)
  }

  private static notVisible (mediaRecord: MediaRecord): void {
    this._onNotVisibleCallback?.(mediaRecord)
  }

  static notIntersecting (mediaRecord: MediaRecord): void {
    this._resizeObserver.unobserve(mediaRecord.element)
    mediaRecord.state.viewport = false
    if (mediaRecord.state?.visible) {
      mediaRecord.state.visible = false
      this.notVisible(mediaRecord)
    }
    this.observe(mediaRecord)
    this._onLeaveViewportCallback?.(mediaRecord)
  }

  static checkVisibility (mediaRecord: MediaRecord, type: string): void {
    // If the element is not in the viewport, we don't need to check visibility
    if (!mediaRecord.state.viewport) {
      return
    }

    const elementIsVisible = this.isStyleVisible(mediaRecord.element) && this.isPositionVisible(mediaRecord.element)
    if (mediaRecord.state.visible !== elementIsVisible) {
      mediaRecord.state.visible = elementIsVisible
      elementIsVisible ? this.isVisible(mediaRecord) : this.notVisible(mediaRecord)
    } else {
      this._onUpdateCallback?.(mediaRecord)
    }
  }

  static observe (mediaRecord: MediaRecord): void {
    mediaRecord.log('VisibilityMonitor.observe')

    if (!mediaRecord.state.ready) {
      // eslint-disable-next-line no-debugger
      debugger // Should not observer before ready
    }

    this._intersectionObserver.observe(mediaRecord.element)
  }

  static unobserve (mediaRecord: MediaRecord): void {
    mediaRecord.log('VisibilityMonitor.unobserve')
    this._intersectionObserver.unobserve(mediaRecord.element)
  }

  static get onEnterViewport (): ((mediaRecord: MediaRecord) => Promise<void>) | null {
    return this._onEnterViewportCallback
  }

  static set onEnterViewport (callback: (mediaRecord: MediaRecord) => Promise<void>) {
    this._onEnterViewportCallback = callback
  }

  static get onLeaveViewport (): ((mediaRecord: MediaRecord) => void) | null {
    return this._onLeaveViewportCallback
  }

  static set onLeaveViewport (callback: (mediaRecord: MediaRecord) => void) {
    this._onLeaveViewportCallback = callback
  }

  static get onUpdate (): ((mediaRecord: MediaRecord) => void) | null {
    return this._onUpdateCallback
  }

  static set onUpdate (callback: (mediaRecord: MediaRecord) => void) {
    this._onUpdateCallback = callback
  }

  static get onVisible (): ((mediaRecord: MediaRecord) => void) | null {
    return this._onVisibleCallback
  }

  static set onVisible (callback: (mediaRecord: MediaRecord) => void) {
    this._onVisibleCallback = callback
  }

  static get onNotVisible (): ((mediaRecord: MediaRecord) => void) | null {
    return this._onNotVisibleCallback
  }

  static set onNotVisible (callback: (mediaRecord: MediaRecord) => void) {
    this._onNotVisibleCallback = callback
  }

  static get inViewport (): MediaRecord[] {
    return MediaStore.all.filter((mediaRecord) => mediaRecord.state.viewport)
  }

  static get visible (): MediaRecord[] {
    return MediaStore.all.filter((mediaRecord) => mediaRecord.state.visible)
  }
}

// let _onUpdateCallback: (mediaRecord: MediaRecord, type: string) => void
// export function onUpdate (callback: (mediaRecord: MediaRecord, type: string) => void): void {
//   _onUpdateCallback = callback
// }

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  VisibilityMonitor.inViewport.forEach((mediaRecord) => {
    VisibilityMonitor.checkVisibility(mediaRecord, 'resize')
    mediaRecord.icon?.position()
  })
})

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function orphanMediaRecords (): MediaRecord[] {
  return MediaStore.all.filter((mediaRecord) => !mediaRecord.element.isConnected)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function orphanIconImages (): MediaRecord[] {
  return MediaStore.all.filter((mediaRecord) => mediaRecord.icon?.img != null && !mediaRecord.icon.img.isConnected)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function iconWhileOutOfViewport (): MediaRecord[] {
  return MediaStore.all.filter((mediaRecord) => mediaRecord.icon != null && !mediaRecord.state.viewport)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function iconWhileNotVisible (): MediaRecord[] {
  return MediaStore.all.filter((mediaRecord) => mediaRecord.icon != null && !mediaRecord.state.viewport)
}
