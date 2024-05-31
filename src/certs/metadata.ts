/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { MIME } from '../constants'
import { exportApp11 } from './jpeg'
import { decode as jxtDecode } from './jpegxt.js'
import { parseMP4Header } from './mp4'
import { parseAvifHeader } from './avif'
import { decode as avidDecode } from './avi'
import { decode as wavDecode } from './wav'
import { decode as webpDecode } from './webp'
import { decode as pngDecode } from './png'
import { decode as svgDecode } from './svg'
import { decode as tiffDecode } from './tiff'
import { decode as mp3Decode } from './mp3'

export function getManifestFromMetadata (type: string, buffer: Uint8Array): Uint8Array | null {
  switch (type) {
    /* image                            */
    case MIME.JPEG:
      return jpeg(buffer)
    case MIME.WEBP:
      return webp(buffer)
    case MIME.PNG:
      return png(buffer)
    case MIME.SVG_XML:
      return svg(buffer)
    case MIME.TIFF:
      return tiff(buffer)
    case MIME.AVIF:
      return avif(buffer)
    /* audio                            */
    case MIME.X_WAV:
    case MIME.WAV:
      return wav(buffer)
    case MIME.X_MSVIDEO:
      return avi(buffer)
    case MIME.MPEG:
      return mp3(buffer)
    /* video                            */
    case MIME.MP4:
      return mp4(buffer)
    case MIME.C2PA:
    case MIME.APPLICATION_MP4:
    case MIME.X_C2PA_MANIFEST_STORE:
    case MIME.AUDIO_MP4:
    case MIME.VND_WAVE:
    case MIME.HEIC:
    case MIME.HEIF:
    case MIME.X_ADOBE_DNG:
    case MIME.X_SONY_ARW:
    case MIME.PDF:
    default:
      return null
  }
}

function avi (buffer: Uint8Array): Uint8Array | null {
  const riffChunks = avidDecode(buffer)
  return riffChunks.find((chunk) => chunk.id === 'AVI')?.data ?? null
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function bwf (buffer: Uint8Array): Uint8Array | null {
  const riffChunks = wavDecode(buffer)
  return riffChunks.find((chunk) => chunk.id === 'WAVE')?.data ?? null
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

function avif (buffer: Uint8Array): Uint8Array | null {
  const jumpfBuffer = parseAvifHeader(buffer)
  return jumpfBuffer
}

function webp (buffer: Uint8Array): Uint8Array | null {
  const riffChunks = webpDecode(buffer)
  return riffChunks.find((chunk) => chunk.id === 'C2PA')?.data ?? null
}

function png (buffer: Uint8Array): Uint8Array | null {
  const chunks = pngDecode(buffer)
  const caBx = chunks.find((chunk) => chunk.type === 'caBX')
  if (caBx != null) {
    return caBx.data
  }
  return null
}

function svg (buffer: Uint8Array): Uint8Array | null {
  const c2paBuffer = svgDecode(buffer)
  return c2paBuffer
}

function tiff (buffer: Uint8Array): Uint8Array | null {
  const entries = tiffDecode(buffer)
  const entry = entries.find((entry) => entry.tag === 0xCD41 && entry.type === 7) ?? null
  if (entry == null) {
    return null
  }
  return new Uint8Array(buffer.buffer, entry.value, entry.count)
}

function wav (buffer: Uint8Array): Uint8Array | null {
  const riffChunks = wavDecode(buffer)
  return riffChunks.find((chunk) => chunk.id === 'C2PA')?.data ?? null
}

function mp3 (buffer: Uint8Array): Uint8Array | null {
  return mp3Decode(buffer)
}
