/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { MSG_OPEN_OVERLAY } from './constants'
import { type MediaElement } from './content'
import { c2paValidateImage, getOffsets, sendToContent, setIcon } from './inject'
import { MediaMonitor } from './mediaMonitor'
import { MediaRecord } from './mediaRecord'
import { MediaStore } from './mediaStore'
import { VisibilityMonitor } from './visible'

MediaMonitor.onStart = (): void => {
  console.debug('MediaMonitor.onMonitoringStart')
  MediaStore.all.forEach((mediaRecord) => {
    setIcon(mediaRecord)
    VisibilityMonitor.observe(mediaRecord)
  })
}

MediaMonitor.onStop = (): void => {
  MediaStore.all.forEach((mediaRecord) => {
    mediaRecord.icon = null
    VisibilityMonitor.unobserve(mediaRecord)
  })
}

MediaMonitor.onAdd = (element: MediaElement): void => {
  const mediaRecord = new MediaRecord(element, { frame: 0, tab: 0 })
  MediaStore.add(mediaRecord)
  VisibilityMonitor.observe(mediaRecord)
}

MediaMonitor.onRemove = (element: MediaElement): void => {
  const mediaRecord = MediaStore.remove(element)
  if (mediaRecord == null) return
  VisibilityMonitor.unobserve(mediaRecord)
  mediaRecord?.dispose()
}

MediaMonitor.onUpdate = (element: MediaElement): void => {
  const mediaRecord = MediaStore.get(element)
  // eslint-disable-next-line no-useless-return
  if (mediaRecord == null) return
  /* do stuff */
}

VisibilityMonitor.onEnterViewport = async (mediaRecord: MediaRecord): Promise<void> => {
  if (mediaRecord.state.evaluated) return

  mediaRecord.state.evaluated = true
  const c2paResult = await c2paValidateImage(mediaRecord.src)
  if (c2paResult instanceof Error) {
    return // This is not a c2pa element
  }
  mediaRecord.state.c2pa = c2paResult

  setIcon(mediaRecord)
  if (mediaRecord.icon === null) return

  mediaRecord.icon.onClick = async () => {
    const offsets = await getOffsets(mediaRecord.element)
    sendToContent({
      action: MSG_OPEN_OVERLAY,
      data: { c2paResult, position: { x: offsets.x + offsets.width, y: offsets.y } }
    })
  }
}

VisibilityMonitor.onLeaveViewport = (mediaRecord: MediaRecord): void => {
  // do nothing
}

VisibilityMonitor.onVisible = (mediaRecord: MediaRecord): void => {
  setIcon(mediaRecord)
}

VisibilityMonitor.onNotVisible = (mediaRecord: MediaRecord): void => {
  mediaRecord.icon = null
}

// VisibilityMonitor.onUpdate = (mediaRecord: MediaRecord): void => {
//   mediaRecord.icon?.position()
// }
