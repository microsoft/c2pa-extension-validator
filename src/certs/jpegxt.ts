/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { ByteReader } from './byteReader.js'

export interface JumbfBuffer {
  segmentLength: number
  commonIdentifier: number
  boxInstanceNumber: number
  packetSequenceNumber: number
  boxLength: number
  boxType: number
  jumbf: Uint8Array
}

export function decode (apt11Buffers: Uint8Array[]): Uint8Array {
  const jumbfSections = parseXLBuffers(apt11Buffers)
  const grouped = group(jumbfSections)
  const jumbf = merge(grouped[0]) // TODO: handle multiple groups (if possible)
  return jumbf
}

function parseXLBuffers (apt11Buffers: Uint8Array[]): JumbfBuffer[] {
  const jumbfSections = apt11Buffers.map((buffer: Uint8Array): JumbfBuffer => {
    const reader = new ByteReader(buffer)
    const segmentLength = reader.uint16()
    const commonIdentifier = reader.uint16()
    const boxInstanceNumber = reader.uint16()
    const packetSequenceNumber = reader.uint32()
    let boxLength = reader.peek.uint32()
    const boxType = reader.peek.uint32()

    if (segmentLength !== reader.length) {
      throw new Error('Invalid segment length')
    }

    if (commonIdentifier !== 0x4A50) {
      throw new Error('Invalid common identifier')
    }

    // boxLength will be greater than this buffer length when multiple sections are concatenated
    if (boxLength === 0) {
      boxLength = reader.remaining
    }
    if (boxLength === 1) {
      boxLength = reader.peek.uint64()
    }

    const jumbf = reader.Uint8Array(/* remaining buffer */)
    return {
      segmentLength,
      commonIdentifier,
      boxInstanceNumber,
      packetSequenceNumber,
      boxLength,
      boxType,
      jumbf
    }
  })
  return jumbfSections
}

function group (jumbfSections: JumbfBuffer[]): JumbfBuffer[][] {
  const grouped = jumbfSections.reduce<Record<number, JumbfBuffer[]>>((acc, item) => {
    const key = item.boxInstanceNumber
    if (acc[key] === undefined) {
      acc[key] = []
    }
    acc[key].push(item)
    return acc
  }, {})
  const values = Object.values(grouped).map((instanceGroup) => instanceGroup.sort((a, b) => a.packetSequenceNumber - b.packetSequenceNumber))
  return values
}

function merge (group: JumbfBuffer[]): Uint8Array {
  let totalLength = 8
  for (let index = 0; index < group.length; index++) {
    const section = group[index]
    // TODO: apparently the sequence number is not required to be contiguous or start at 1 or 0
    // if (section.packetSequenceNumber !== index + 1) {
    //   throw new Error('Missing sequence')
    // }
    totalLength += section.jumbf.length - 8
  }
  const mergedJumbf = new Uint8Array(totalLength)
  let offset = 8
  for (let index = 0; index < group.length; index++) {
    const section = group[index]
    if (section.boxLength !== totalLength) {
      throw new Error('Invalid box length')
    }
    mergedJumbf.set(section.jumbf.subarray(8), offset)
    offset += section.jumbf.length - 8
  }
  mergedJumbf.set(group[0].jumbf.subarray(0, 8))
  return mergedJumbf
}
