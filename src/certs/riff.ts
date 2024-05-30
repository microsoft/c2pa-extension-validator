/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { ByteReader } from './byteReader.js'

export interface RIFFChunk {
  id: string
  size: number
  data: Uint8Array
}

export interface RIFF {
  id: 'RIFF'
  size: number
  form: string
  chunks: RIFFChunk[]
}

export function decode (buffer: ArrayBuffer): RIFF {
  const reader = new ByteReader(new Uint8Array(buffer))
  const riffId = reader.string(4)
  if (riffId !== 'RIFF') {
    throw new Error('Invalid RIFF signature')
  }

  const size = reader.uint32(true)
  if (size !== reader.remaining) {
    throw new Error('Invalid RIFF size')
  }

  const form = reader.string(4)

  const riff: RIFF = {
    id: 'RIFF',
    size,
    form,
    chunks: []
  }

  while (reader.remaining > 0) {
    const fourCC = reader.string(4).trim()
    const chunkSize = reader.uint32(true)
    const data = reader.Uint8Array(chunkSize)
    if (chunkSize % 2 !== 0) { // RIFF chunks are 2-byte aligned using a zero-byte as padding
      const pad = reader.byte()
      if (pad !== 0) {
        throw new Error('Invalid padding byte')
      }
    }
    riff.chunks.push({ id: fourCC, size: chunkSize, data })
  }

  return riff
}
