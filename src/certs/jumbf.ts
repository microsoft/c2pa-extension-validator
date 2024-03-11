/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { ByteReader } from './byteReader.js'

export interface DescriptionBox {
  label: string | undefined
  uuid: string
  uuidStr: string
  toggles: Toggles
  id: number | undefined
  signature?: Uint8Array
}

export interface JumbfBox extends DescriptionBox {
  type: string
  length: number
  boxes: Array<JumbfBox | ContentBox>
}

export interface ContentBox {
  type: string
  data: Uint8Array
}

export interface Toggles {
  request: boolean
  label: boolean
  id: boolean
  signature: boolean
}

export interface JumbfResult extends JumbfBox {
  labels: Record<string, JumbfBox>
}

let _labels: Record<string, JumbfBox>
let reader: ByteReader

export function decode (buffer: Uint8Array): JumbfResult {
  reader = new ByteReader(buffer)
  _labels = {}
  return { labels: _labels, ..._decode() as JumbfBox }
}

function _decode (): JumbfBox | DescriptionBox | ContentBox {
  let length = reader.uint32()
  const type: string = reader.string(4)

  if (type === 'jumb') {
    if (length === 0 /* 0 = unknown length; use remaining buffer */) {
      length = reader.remaining
    }
    if (length === 1 /* 1 = extended length */) {
      length = reader.uint64()
    }
    const boxes: Array<JumbfBox | ContentBox> = []
    const end = reader.offset + length - 8
    // The first box is a jumd box
    const description = _decode() as DescriptionBox

    while (reader.offset < end) {
      const child = _decode() as JumbfBox | ContentBox
      boxes.push(child)
    }

    const result = {
      ...description,
      type,
      length,
      boxes
    }

    if (description.label != null) {
      _labels[description.label] = result
    }

    return result
  }

  if (type === 'jumd') {
    return jumbd()
  }

  const dataBox = { type, data: reader.Uint8Array(length - 8) }

  return dataBox
}

function jumbd (): DescriptionBox {
  const uuid = bytesToHex(reader.peek.Uint8Array(16))
  const uuidStr = reader.peek.string(0)
  reader.move(16)
  const togglesByte = reader.byte()
  const toggles = getToggles(togglesByte)
  if (toggles.request && !toggles.label) {
    throw new Error('Request flag set without label flag')
  }
  const id = toggles.id ? reader.uint32() : undefined
  const result: DescriptionBox = {
    uuid: formatUUID(uuid),
    uuidStr,
    toggles,
    label: toggles.label ? reader.string(0) : undefined,
    id
  }
  return result
}

function bytesToHex (uint8Array: Uint8Array): string {
  return Array.from(uint8Array).map(b => b.toString(16).padStart(2, '0')).join('')
}

function getToggles (byte: number): Toggles {
  return {
    request: (byte & 0x01) > 0,
    label: (byte & 0x02) > 0,
    id: (byte & 0x04) > 0,
    signature: (byte & 0x08) > 0
  }
}

function formatUUID (uuid: string): string {
  return `${uuid.substring(0, 8)}-${uuid.substring(8, 12)}-${uuid.substring(12, 16)}-${uuid.substring(16, 20)}-${uuid.substring(20)}`
}
