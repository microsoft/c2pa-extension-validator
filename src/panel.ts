/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { MediaInfo } from './components/mediaInfo'
import {
  MSG_ACTIVE_TAB_CHANGED,
  MSG_CLOSE_SIDE_PANEL,
  MSG_MEDIA_RECORDS_CLEAR,
  MSG_MEDIA_RECORD_UPDATE,
  MSG_REQUEST_MEDIA_RECORDS,
  MSG_RESPONSE_MEDIA_RECORDS
} from './constants'
import { type MediaRecordInfo } from './mediaRecord'
import { getActiveTabId } from './utils'

console.debug('Panel.ts loaded')

/**
 * Send a request to the main tab to content script to retrieve all the MediaRecordInfos.
 * This does not handle the response.
 */
async function requestMediaRecords (): Promise<void> {
  const tabId = await getActiveTabId()
  if (tabId == null) {
    console.error('Failed to get active tab ID')
    return
  }
  void chrome.tabs.sendMessage(tabId, { action: MSG_REQUEST_MEDIA_RECORDS, data: null })
}

/**
 * Adds a MediaRecordInfo entry to the side-panel list
 */
function addMediaInfo (mediaRecord: MediaRecordInfo): MediaInfo {
  const div = document.getElementById('parent')
  if (div == null) {
    console.error('Failed to get parent element')
  }
  const existingMediaInfo = getMediaInfo(mediaRecord)
  if (existingMediaInfo != null) {
    console.warn('Media already exists:', mediaRecord)
    updateMediaInfo(mediaRecord)
    return existingMediaInfo
  }
  const mediaInfo = new MediaInfo(mediaRecord)
  div?.appendChild(mediaInfo)
  return mediaInfo
}

/**
 * Removes a MediaRecordInfo from the side-panel list
 */
function removeMediaInfo (mediaRecord: MediaRecordInfo): void {
  const mediaInfo = getMediaInfo(mediaRecord)
  if (mediaInfo == null) {
    console.error('Media not found:', mediaRecord)
    return
  }
  mediaInfo.remove()
}

/**
 * Looks up a MediaInfo entry from the side-panel list
 */
function getMediaInfo (mediaRecord: MediaRecordInfo): MediaInfo | null {
  const div = document.getElementById('parent')
  if (div == null) {
    console.error('Failed to get parent element')
    return null
  }
  const mediaInfos = Array.from(div.getElementsByTagName('media-info')) as MediaInfo[]
  for (const mediaInfo of mediaInfos) {
    if (mediaInfo.mediaRecordInfo.id === mediaRecord.id) {
      return mediaInfo
    }
  }
  return null
}

/**
 * Updates a side-panel entry
 */
function updateMediaInfo (mediaRecord: MediaRecordInfo): void {
  const mediaInfo = getMediaInfo(mediaRecord)
  if (mediaInfo == null) {
    console.warn('Media not found:', mediaRecord)
    return
  }
  mediaInfo.mediaRecordInfo = mediaRecord
  mediaInfo.requestUpdate()
}

/**
 * Determines how the side-panel list should be updated from a MediaRecordInfo
 * passed in MSG_MEDIA_RECORD_UPDATE message.
 */
function mediaUpdate (mediaRecord: MediaRecordInfo, type: string): void {
  switch (type) {
    case 'ADD':
      addMediaInfo(mediaRecord)
      break
    case 'REMOVE':
      removeMediaInfo(mediaRecord)
      break
    case 'C2PA_RESULT':
    case 'VIEWPORT_ENTER':
    case 'VIEWPORT_LEAVE':
    case 'VISIBLE':
    case 'HIDDEN':
      updateMediaInfo(mediaRecord)
      break
    default:
      console.error('Unknown media record update type:', type)
  }
}

/**
 * Removes side-panel entries from a specific frame.
 * All entries are removed if no frame is specified.
 */
function clearMediaInfo (frameId?: number): void {
  // TODO: Determine why we do this per frame?
  const div = document.getElementById('parent')
  if (div == null) {
    console.error('Failed to get parent element')
    return
  }
  if (frameId == null /* remove all */) {
    div.replaceChildren()
    return
  }
  const mediaInfos = Array.from(div.getElementsByTagName('media-info')) as MediaInfo[]
  for (const mediaInfo of mediaInfos) {
    if (mediaInfo.mediaRecordInfo.frame.frame === frameId) {
      mediaInfo.remove()
    }
  }
}

/**
 * Sorts the entries in the side-panel list placing visible entries at the top.
 */
function sortMediaInfo (): void {
  const div = document.getElementById('parent')
  if (div == null) {
    console.error('Failed to get parent element')
    return
  }
  const mediaInfos = Array.from(div.getElementsByTagName('media-info')) as MediaInfo[]
  mediaInfos.sort((elementA, elementB) => {
    const a = elementA.mediaRecordInfo
    const b = elementB.mediaRecordInfo

    if (a.state.visible !== b.state.visible) {
      return a.state.visible ? -1 : 1
    }

    if (a.state.viewport !== b.state.viewport) {
      return a.state.viewport ? -1 : 1
    }

    if (a.rect.y !== b.rect.y) {
      return a.rect.y - b.rect.y
    }

    return a.rect.x - b.rect.x
  })
  for (const mediaInfo of mediaInfos) {
    div.appendChild(mediaInfo)
  }
}

void requestMediaRecords()

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === MSG_RESPONSE_MEDIA_RECORDS) {
    const mediaRecords = request.data as MediaRecordInfo[]
    console.debug('Received media records:', mediaRecords)

    const div = document.getElementById('parent')
    if (div == null) {
      console.error('Failed to get parent element')
    }

    mediaRecords.forEach((mediaRecord) => {
      div?.appendChild(new MediaInfo(mediaRecord))
    })

    sortMediaInfo()
  }

  if (request.action === MSG_MEDIA_RECORD_UPDATE) {
    console.debug('Media record update:', request.data.type, request.data.mediaInfo)
    mediaUpdate(request.data.mediaInfo as MediaRecordInfo, request.data.type as string)
    sortMediaInfo()
  }

  if (request.action === MSG_ACTIVE_TAB_CHANGED) {
    clearMediaInfo()
    void requestMediaRecords()
  }

  if (request.action === MSG_MEDIA_RECORDS_CLEAR) {
    console.debug('Media record clear:', request.data)
    clearMediaInfo(request.data as number | undefined)
  }

  if (request.action === MSG_CLOSE_SIDE_PANEL) {
    window.close()
  }
})
