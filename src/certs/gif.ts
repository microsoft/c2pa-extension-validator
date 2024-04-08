/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { ByteReader } from './byteReader.js'

export function decode (buffer: ArrayBuffer): Array<{ type: string, data: Uint8Array }> {
  const reader = new ByteReader(new Uint8Array(buffer))
  const blocks: Array<{ type: string, data: Uint8Array }> = []

  blocks.push({ type: 'header', data: reader.Uint8Array(6) })

  blocks.push({ type: 'logicalScreenDescriptor', data: reader.Uint8Array(7) })

  const globalColorTableFlag = blocks[1].data[4] & 0b10000000
  if (globalColorTableFlag === 1) {
    const globalColorTableSize = 3 * (2 ** ((blocks[1].data[4] & 0b00000111) + 1))
    blocks.push({ type: 'globalColorTable', data: reader.Uint8Array(globalColorTableSize) })
  }

  /*
    TODO: Implement the rest of the PNG decoder
  */

  return blocks
}
