/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { base64ToArrayBuffer } from '../utils.js'
import { decode as decodeXML } from './xml.js'

export function decode (buffer: Uint8Array): Uint8Array | null {
  const xmlDoc = decodeXML(buffer)

  const metadataElements = Array.from(xmlDoc.getElementsByTagName('metadata'))

  for (const metadata of metadataElements) {
    const manifestElements = Array.from(metadata.getElementsByTagName('c2pa:manifest'))

    if (manifestElements.length !== 0) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const arrayBuffer = base64ToArrayBuffer(manifestElements[0].textContent!)
      return new Uint8Array(arrayBuffer)
    }
  }

  return null
}
