/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { parseBmffHeader } from './bmff.js'

export function parseAvifHeader (buffer: Uint8Array): Uint8Array | null {
  return parseBmffHeader(buffer)
}
