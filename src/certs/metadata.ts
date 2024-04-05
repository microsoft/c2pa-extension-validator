/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { MIME } from '../constants'
import { exportApp11 } from './jpeg'
import { decode as jxtDecode } from './jpegxt.js'
import { parseMP4Header } from './mp4'
import { decode as webpDecode } from './webp'
import { decode as pngDecode } from './png'

export function getManifestFromMetadata (type: string, buffer: Uint8Array): Uint8Array | null {
  switch (type) {
    case MIME.JPEG:
      return jpeg(buffer)
    case MIME.MP4:
      return mp4(buffer)
    case MIME.WEBP:
      return webp(buffer)
    case MIME.PNG:
      return png(buffer)
    default:
      return null
  }
}

function jpeg (buffer: Uint8Array): Uint8Array | null {
  const arrayOfApp11Buffers = exportApp11(buffer)
  if (arrayOfApp11Buffers.length === 0) {
    return null
  }
  const combinedJumbfBuffer = jxtDecode(arrayOfApp11Buffers)
  return combinedJumbfBuffer
}

function mp4 (buffer: Uint8Array): Uint8Array | null {
  const jumpfBuffer = parseMP4Header(buffer)
  return jumpfBuffer
}

function webp (buffer: Uint8Array): Uint8Array | null {
  const riffContainers = webpDecode(buffer)
  return riffContainers.C2PA
}

function png (buffer: Uint8Array): Uint8Array | null {
  const chunks = pngDecode(buffer)
  const caBx = chunks.find((chunk) => chunk.type === 'caBX')
  if (caBx != null) {
    return caBx.data
  }
  return null
}
