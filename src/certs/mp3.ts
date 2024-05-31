/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { ByteReader } from './byteReader.js'

export function decode (buffer: Uint8Array): Uint8Array | null {
  const reader = new ByteReader(buffer)

  const id3 = reader.string(3)
  if (id3 !== 'ID3') {
    throw new Error('Invalid ID3 signature')
  }
  const version = reader.byte()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const revision = reader.byte()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const flags = reader.byte()
  const size = syncSafeSize(reader)

  const end = reader.offset + size
  while (reader.offset < end) {
    const frameId = reader.string(4)
    const frameSize = getFrameSize(version, reader) // Frame size encoding varies by version
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const frameFlags = reader.uint16()

    if (frameId[0] === '\0') {
      break // Padding, no more frames
    }

    const data = reader.Uint8Array(frameSize)
    if (frameId === 'GEOB') {
      return extractGeobData(data)
    }
  }

  return null
}

function extractGeobData (geob: Uint8Array): Uint8Array | null {
  const reader = new ByteReader(geob)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const type = reader.byte()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const mimeType = reader.string(0)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const filename = reader.string(0)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const description = reader.string(0)
  const data = reader.Uint8Array(reader.length - reader.offset)
  return data
}

function getFrameSize (version: number, reader: ByteReader): number {
  switch (version) {
    case 2:
      return reader.uint24()
    case 3:
      return reader.uint32()
    case 4:
    default:
      return syncSafeSize(reader)
  }
}

function syncSafeSize (reader: ByteReader): number {
  return reader.byte() << 21 | reader.byte() << 14 | reader.byte() << 7 | reader.byte()
}
