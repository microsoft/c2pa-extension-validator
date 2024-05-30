/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

export function decode (buffer: Uint8Array): Document {
  const decoder = new TextDecoder('utf-8')
  const xmlText = decoder.decode(buffer)
  const parser = new DOMParser()
  const xmlDoc = parser.parseFromString(xmlText, 'application/xml')
  if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Error parsing XML')
  }
  return xmlDoc
}
