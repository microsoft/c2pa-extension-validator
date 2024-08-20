/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { IS_DEBUG } from './constants'
import { type MediaElement } from './content'
import { type MediaRecord } from './mediaRecord'

console.debug('Media module loaded')

/**
 * Stores MediaRecords for all media elements in the DOM
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class MediaStore {
  private static readonly _mediaRecords = new Map<MediaElement, MediaRecord>()

  /**
   * Add MediaRecord to the MediaStore
   */
  public static add (mediaRecord: MediaRecord): void {
    if (MediaStore._mediaRecords.has(mediaRecord.element)) {
      if (IS_DEBUG) {
        mediaRecord.log('MediaRecord already added')
        console.error('MediaRecord already in MediaStore:', mediaRecord)
      }
      return
    }
    mediaRecord.log('MediaStore add start')
    MediaStore._mediaRecords.set(mediaRecord.element, mediaRecord)
    mediaRecord.log('MediaStore add end')
  }

  /**
   * Retrieve MediaRecord from the MediaStore
   */
  public static get (mediaElement: MediaElement): MediaRecord | null {
    return MediaStore._mediaRecords.get(mediaElement) ?? null
  }

  /**
   * Remove MediaRecord from the MediaStore
   */
  public static remove (mediaElement: MediaElement): MediaRecord | null {
    const mediaRecord = MediaStore.get(mediaElement)
    if (mediaRecord == null) {
      console.error('MediaRecord not found:', mediaElement)
      return null
    }
    mediaRecord.log('MediaStore remove start')
    if (!MediaStore._mediaRecords.delete(mediaElement)) {
      console.error('Failed to remove MediaRecord:', mediaElement)
    } else {
      mediaRecord.log('Removed from MediaStore')
    }
    mediaRecord.log('MediaStore remove end')
    return mediaRecord
  }

  /**
   * Retrieve all MediaRecord from the MediaStore
   */
  public static get all (): MediaRecord[] {
    return Array.from(MediaStore._mediaRecords.values())
  }
}
