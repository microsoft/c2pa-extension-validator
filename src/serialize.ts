/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { arrayBufferToBase64, blobToDataURL, isKeyedObject, isObject, base64ToArrayBuffer, dataURLtoBlob } from './utils.js'

export const REFERENCE_ID = '__ref'
export const CIRCLE_ID = '__circle'

interface WeekMapWithCounter extends WeakMap<object, unknown> {
  counter: number
}

export async function serialize (obj: unknown): Promise<unknown> {
  const map = new WeakMap<object, unknown>() as WeekMapWithCounter
  map.counter = 0
  const result = await _serialize(obj, map)
  return result
}

async function _serialize (obj: unknown, alreadySerialized: WeekMapWithCounter): Promise<unknown> {
  if (!isObject(obj)) {
    return obj
  }

  if ((alreadySerialized).has(obj as Record<string, unknown>)) {
    const entry = alreadySerialized.get(obj as Record<string, unknown>) as Record<string, unknown>
    if (REFERENCE_ID in entry) {
      return { [CIRCLE_ID]: entry[REFERENCE_ID] }
    }
    entry[REFERENCE_ID] = alreadySerialized.counter
    return { [CIRCLE_ID]: alreadySerialized.counter++ }
  }

  let result: unknown

  if (obj instanceof Blob) {
    const base64 = await blobToDataURL(obj)
    result = { type: 'Blob', data: base64 }
  }

  if (obj instanceof ArrayBuffer) {
    const base64 = arrayBufferToBase64(obj)
    result = { type: 'ArrayBuffer', data: base64 }
  }

  if (typeof obj === 'function') {
    result = { type: 'Function', data: obj.toString() }
  }

  if (obj instanceof Date) {
    result = { type: 'Date', data: obj.toISOString() }
  }

  if (obj instanceof Array) {
    const array = obj as unknown[]
    for (let i = 0; i < array.length; i++) {
      array[i] = await _serialize(array[i], alreadySerialized)
    }
    result = array
  }

  if (result != null) {
    alreadySerialized.set(obj as Record<string, unknown>, result)
    return result
  }

  const object: Record<string, unknown> = {}
  if (isKeyedObject(obj)) {
    alreadySerialized.set(obj as Record<string, unknown>, object)
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      object[key] = (await _serialize(value, alreadySerialized)) as object
    }
    result = object
  }
  alreadySerialized.set(obj as Record<string, unknown>, result)

  if (result == null) {
    throw new Error('Unknown object type')
  }

  return result
}

// Define a type for the serialized data
type SerializedData = {
  type?: 'Blob' | 'ArrayBuffer' | 'Function'
  data?: string
  [CIRCLE_ID]?: string
  [REFERENCE_ID]?: number
} | Record<string, unknown>

/**
 * Checks if a value is a serialized object representation
 * @param obj The object to check
 */
function isSerializedObject (obj: unknown): obj is SerializedData {
  return isKeyedObject(obj) && ('type' in (obj as object)) && ('data' in (obj as object))
}

export function deserialize (object: unknown): unknown {
  const refs = new Map<number, unknown>()
  const pending = new Map<number, Array<{ parent: unknown, key: number | string }>>()

  function _deserialize (obj: unknown, path = ''): unknown {
    path = path.startsWith('.') ? path.substring(1) : path

    if (isSerializedObject(obj)) {
      let result: unknown
      switch (obj.type) {
        case 'ArrayBuffer':
          result = base64ToArrayBuffer(obj.data as string)
          break
        case 'Blob':
          result = dataURLtoBlob(obj.data as string)
          break
        case 'Date':
          result = new Date(obj.data as string)
          break
        case 'Buffer':
        case 'Function':
          // eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval
          result = obj
          break
        default:
          throw new Error(`Unknown type: ${obj.type as string}`)
      }
      if (REFERENCE_ID in obj) {
        refs.set(obj[REFERENCE_ID] as number, result)
      }
      if (pending.has(obj[REFERENCE_ID] as number)) {
        const entries = ((pending.get(obj[REFERENCE_ID] as number) ?? []) as Array<{ parent: unknown, key: number | string }>)
        entries.forEach(({ parent, key }) => ((parent as Record<string | number, unknown>)[key] = result))
        pending.delete(obj[REFERENCE_ID] as number)
      }
      return result
    }

    if (Array.isArray(obj)) {
      const array = [] as unknown[]
      const objArray = obj
      for (let i = 0; i < objArray.length; i++) {
        array.push(_deserialize(objArray[i]))
      }
      if (REFERENCE_ID in obj) {
        refs.set(obj[REFERENCE_ID] as number, array)
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete obj[REFERENCE_ID]
      }
      return array
    }

    if (typeof obj === 'object' && obj !== null) {
      const entries = Object.entries(obj)
      const result: Record<string, unknown> = {}
      // for (const [key, value] of entries) {
      for (let i = 0; i < entries.length; i++) {
        const [key, value] = entries[i]
        if (typeof value === 'object' && value !== null && CIRCLE_ID in value) {
          // Handle circular reference
          const referenceId = (value as SerializedData)[CIRCLE_ID] as number
          if (refs.has(referenceId)) {
            result[key] = refs.get(referenceId)
          } else {
            const entry = pending.get(referenceId) ?? []
            entry.push({ parent: result, key })
            pending.set(referenceId, entry)
          }
        } else {
          result[key] = _deserialize(value, `${path}.${key}`)
        }
      }
      if (REFERENCE_ID in obj) {
        refs.set(obj[REFERENCE_ID] as number, result)
      }
      return result
    }
    // Primitive types or functions
    return obj
  }

  const deserializedData = _deserialize(object)
  return deserializedData
}
