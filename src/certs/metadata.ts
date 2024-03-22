/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { exportApp11 } from './jpeg'
import { decode as jxtDecode } from './jpegxt.js'
import { parseMP4Header } from './mp4'

export function getManifestFromMetadata (type: string, buffer: Uint8Array): Uint8Array | null {
  switch (type) {
    case 'image/jpeg':
      return jpeg(buffer)
    case 'mp4':
      return mp4(buffer)
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
