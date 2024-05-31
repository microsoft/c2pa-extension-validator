/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { ByteReader } from './byteReader.js'

export interface IFDEntry {
  tag: number
  type: number
  count: number
  value: number
}

export function decode (buffer: Uint8Array): IFDEntry[] {
  const reader = new ByteReader(new Uint8Array(buffer))
  const byteOrder = reader.string(2)
  if (byteOrder !== 'II' && byteOrder !== 'MM') {
    throw new Error('Invalid TIFF byte order')
  }
  const littleEndian = byteOrder === 'II'
  const version = reader.uint16(littleEndian)
  if (version !== 42) {
    throw new Error('Invalid TIFF version')
  }
  const entries: IFDEntry[] = []
  let offset = reader.uint32(littleEndian)

  while (offset !== 0) {
    reader.absolute(offset)
    const entryCount = reader.uint16(littleEndian)
    for (let i = 0; i < entryCount; i++) {
      entries.push({
        tag: reader.uint16(littleEndian),
        type: reader.uint16(littleEndian),
        count: reader.uint32(littleEndian),
        value: reader.uint32(littleEndian)
      })
    }
    offset = reader.uint32(littleEndian)
  }
  return entries
}
