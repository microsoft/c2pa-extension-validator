import { bytesToHex, formatUUID } from '../utils.js'
import { ByteReader } from './byteReader.js'

export function parseMP4Header (buffer: Uint8Array): Uint8Array | null {
  const reader = new ByteReader(buffer)

  while (reader.remaining > 0) {
    const size = reader.uint32()
    const type = reader.string(4)
    console.log(`Found box of type ${type} with size ${size}`)
    if (type === 'uuid') {
      const uuid = formatUUID(bytesToHex(reader.Uint8Array(16)))
      if (uuid !== 'd8fec3d6-1b0e-483c-9297-5828877ec481') {
        throw new Error('Invalid UUID')
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const version = reader.byte()
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const flags = reader.uint24()
      const purpose = reader.string(0)
      if (purpose === 'manifest') {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const merkleOffset = reader.uint64()
        const manifest = reader.Uint8Array()
        return manifest
      } else if (purpose === 'merkle') {
        throw new Error('purpose===merkle not supported')
      } else {
        throw new Error(`Unknown purpose: ${purpose}`)
      }
    }
    reader.move(size - 8)
  }
  return null
}
