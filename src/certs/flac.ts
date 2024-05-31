/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { ByteReader } from './byteReader.js'

export function decode (buffer: Uint8Array): Uint8Array | null {
  const reader = new ByteReader(buffer)

  const flac = reader.string(4)
  if (flac !== 'fLaC') {
    throw new Error('Invalid flaC signature')
  }

  let lastBlock = false

  while (!lastBlock) {
    const blockHead = reader.byte()
    lastBlock = (blockHead >> 7) !== 0
    const blockType = blockHead & 127
    const blockSize = reader.uint24()
    const blockData = reader.Uint8Array(blockSize)
    if (blockType === 4) {
      const decoder = new TextDecoder('utf-8')
      const str = decoder.decode(blockData)
      console.log(str)
    }
  }

  return null
}
