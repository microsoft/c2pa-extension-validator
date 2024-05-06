/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { ByteReader } from './byteReader.js'

export function decode (buffer: ArrayBuffer): Record<string, Uint8Array> {
  const reader = new ByteReader(new Uint8Array(buffer))
  const riff = reader.string(4)
  if (riff !== 'RIFF') {
    throw new Error('Invalid RIFF signature')
  }

  const size = reader.uint32(reader.littleEndian)
  if (size !== reader.remaining) {
    throw new Error('Invalid RIFF size')
  }

  const webp = reader.string(4)
  if (webp !== 'WEBP') {
    throw new Error('Invalid WEBP signature')
  }

  const chunks: Record<string, Uint8Array> = {}

  while (reader.remaining > 0) {
    const fourCC = reader.string(4).trim()
    const chunkSize = reader.uint32(reader.littleEndian)
    const data = reader.Uint8Array(chunkSize)
    if (chunkSize % 2 !== 0) { // RIFF chunks are 2-byte aligned using a zero-byte as padding
      const pad = reader.byte()
      if (pad !== 0) {
        throw new Error('Invalid padding byte')
      }
    }
    chunks[fourCC] = data
  }

  return chunks
}
