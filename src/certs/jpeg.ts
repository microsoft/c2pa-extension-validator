/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { logError } from '../utils.js'
import { ByteReader } from './byteReader.js'

const APP11_MARKER = 0xEB
const SOI_MARKER = 0xD8
const SOS_MARKER = 0xDA
const SECTION_START = 0xFF

/**
 * Parses a Uint8Array buffer containing JPEG data to extract and return an array of APP11 marker segments.
 *
 * @param {Uint8Array} buffer - The Uint8Array buffer containing JPEG data to be processed.
 * @returns {Uint8Array[]} An array of Uint8Array buffers containing the extracted APP11 marker data.
 */
export function exportApp11 (buffer: Uint8Array): Uint8Array[] {
  const reader = new ByteReader(buffer)

  const app11Buffers: Uint8Array[] = []
  if (reader.byte() !== SECTION_START || reader.byte() !== SOI_MARKER) {
    logError('Invalid JPEG format or marker not found.')
    return app11Buffers
  }

  while (!reader.finished) {
    if (reader.byte() !== SECTION_START) {
      logError('Invalid JPEG format or marker not found.')
      return app11Buffers
    }
    const marker = reader.byte()
    if (marker === SOS_MARKER /* end of metadata */) {
      break
    }
    // Skip markers with no length or data
    if ((marker >= 0xD0 && marker <= 0xD9)) {
      continue
    }

    const length = reader.peek.uint16()

    if (marker === APP11_MARKER) {
      const app11Data = reader.Uint8Array(length)
      app11Buffers.push(app11Data)
      continue
    }

    reader.move(length)
  }

  return app11Buffers
}
