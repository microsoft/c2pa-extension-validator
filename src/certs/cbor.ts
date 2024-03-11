/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { ByteReader } from './byteReader.js'

const MAJOR_TYPE_POSITIVE_INTEGER = 0
const MAJOR_TYPE_NEGATIVE_INTEGER = 1
const MAJOR_TYPE_BYTE_STRING = 2
const MAJOR_TYPE_TEXT_STRING = 3
const MAJOR_TYPE_ARRAY = 4
const MAJOR_TYPE_MAP = 5
const MAJOR_TYPE_TAG = 6
const MAJOR_TYPE_SIMPLE_AND_FLOAT = 7

let reader: ByteReader

export type CBORType = number | Record<string, unknown> | string | unknown[] | Uint8Array | boolean | null | undefined

export function decode (buffer: Uint8Array): CBORType {
  reader = new ByteReader(buffer)
  return _decode()
}

function _decode (): CBORType {
  const header = reader.byte()
  const majorType = header >>> 5
  const additionalInformation = header & 0b00011111

  if (majorType === MAJOR_TYPE_POSITIVE_INTEGER) {
    const value = getLength(additionalInformation)
    return value
  }

  if (majorType === MAJOR_TYPE_NEGATIVE_INTEGER) {
    const value = getLength(additionalInformation)
    return -1 - value
  }

  if (majorType === MAJOR_TYPE_TEXT_STRING) {
    const length = getLength(additionalInformation)
    const text = reader.string(length)
    return text
  }

  if (majorType === MAJOR_TYPE_MAP) {
    const pairs = getLength(additionalInformation)
    const map: Record<string, unknown> = {}
    for (let j = 0; j < pairs; j++) {
      const key = _decode() as unknown as string
      const value = _decode()
      map[key] = value
    }
    return map
  }

  if (majorType === MAJOR_TYPE_ARRAY) {
    const length = getLength(additionalInformation)
    const array: unknown[] = []
    for (let j = 0; j < length; j++) {
      array.push(_decode())
    }
    return array
  }

  if (majorType === MAJOR_TYPE_BYTE_STRING) {
    const length = getLength(additionalInformation)
    const byteString = reader.Uint8Array(length)
    return byteString
  }

  if (majorType === MAJOR_TYPE_TAG) {
    let tag: number | string = getLength(additionalInformation)
    tag = KNOWN_TAGS[tag] ?? tag
    const value = _decode()
    return { tag, value }
  }

  if (majorType === MAJOR_TYPE_SIMPLE_AND_FLOAT) {
    switch (additionalInformation) {
      case 20:
        return false
      case 21:
        return true
      case 22:
        return null
      case 23:
        return undefined
      default:
        throw new Error('Unknown simple type')
    }
  }

  throw new Error('Unknown major type')
}

function getLength (additionalInformation: number): number {
  if (additionalInformation < 24) {
    return additionalInformation
  }
  switch (additionalInformation) {
    case 24:
      return reader.byte()
    case 25:
      return reader.uint16()
    case 26:
      return reader.uint32()
    case 27:
      return reader.uint64()
    default:
      return -1
  }
}

const KNOWN_TAGS: Record<number, string> = {
  18: 'COSE_Sign1'
}
