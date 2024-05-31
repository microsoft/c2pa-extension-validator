/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { type RIFFChunk, decode as riffDecode } from './riff.js'

export function decode (buffer: Uint8Array): RIFFChunk[] {
  const riff = riffDecode(buffer)

  if (riff.form !== 'WAVE') {
    throw new Error('Invalid WAV signature')
  }

  return riff.chunks
}
