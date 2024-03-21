/*
*  Copyright (c) Microsoft Corporation.
*  Licensed under the MIT license.
*/

import { arrayBufferToBase64, base64ToArrayBuffer, blobToBase64, isKeyedObject, isObject } from './utils.js'

const DEBUG = true

// Define a type for the serialized data
type SerializedData = {
  type?: 'Blob' | 'ArrayBuffer' | 'Function'
  data?: string
  circle?: string
} | Record<string, unknown>

export async function serialize (obj: unknown): Promise<unknown> {
  const result = await _serialize(obj, new WeakMap<object, string>(), 0, '')
  return result
}

/**
 * Objects with binary data cannot be sent between background and content scripts
 * This function serializes the binary data into a string
 * @param obj
 */
async function _serialize (obj: unknown, alreadySerialized: WeakMap<object, string>, depth: number, path: string): Promise<unknown> {
  if (path.startsWith('.')) {
    path = path.substring(1)
  }

  DEBUG && console.debug(path)

  if (path.split('.').pop() === 'getUrl') {
    // eslint-disable-next-line no-debugger
    debugger
  }

  if (!isObject(obj)) {
    return obj
  }

  const object = obj as Record<string, unknown>
  if ((alreadySerialized).has(object)) {
    const previousPath = alreadySerialized.get(object)
    DEBUG && console.debug('Circular reference detected in object', path, previousPath)
    return { circle: previousPath }
  }

  alreadySerialized.set(object, path)

  if (obj instanceof Blob) {
    const base64 = await blobToBase64(obj)
    DEBUG && console.debug('Serialized Blob', base64.substring(0, 20) + '...')
    return { type: 'Blob', data: base64 }
  }

  if (obj instanceof ArrayBuffer) {
    const base64 = arrayBufferToBase64(obj)
    DEBUG && console.debug('Serialized ArrayBuffer', base64.substring(0, 20) + '...')
    return { type: 'ArrayBuffer', data: base64 }
  }

  if (typeof obj === 'function') {
    DEBUG && console.debug('Serialized Function', obj.toString().substring(0, 20) + '...')
    return { type: 'Function', data: obj.toString() }
  }

  if (obj instanceof Array) {
    const array = obj as unknown[]
    for (let i = 0; i < array.length; i++) {
      array[i] = await _serialize(array[i], alreadySerialized, depth + 1, `${path}[${i}]`)
    }
    return array
  }

  if (isKeyedObject(obj)) {
    for (const [key, value] of Object.entries(object)) {
      object[key] = (await _serialize(value, alreadySerialized, depth + 1, `${path}.${key}`)) as object
    }
    return object
  }

  throw new Error('Unknown object type')
}

/**
 * Checks if a value is a serialized object representation
 * @param obj The object to check
 */
function isSerializedObject (obj: unknown): obj is SerializedData {
  return isKeyedObject(obj) && ('type' in (obj as object)) && ('data' in (obj as object))
}

// /**
//  * Deserializes the given object, reversing the serialization process
//  * @param serializedObj The serialized object
//  */
// export async function deserialize (serializedObj: SerializedData): Promise<unknown> {
//   // This function will restore circular references and complex objects
//   const map = new Map<string, any>()

//   async function _deserialize (obj: SerializedData, path = ''): Promise<unknown> {
//     if (isSerializedObject(obj)) {
//       switch (obj.type) {
//         case 'ArrayBuffer':
//           return base64ToArrayBuffer(obj.data as string)
//         case 'Blob':
//           // Since Blob is already a usable URL string, directly return it.
//           return obj.data
//         default:
//           throw new Error(`Unknown type: ${obj.type}`)
//       }
//     } else if (Array.isArray(obj)) {
//       const array: unknown[] = []
//       for (let i = 0; i < obj.length; i++) {
//         array.push(await _deserialize(obj[i] as SerializedData, `${path}[${i}]`))
//       }
//       return array
//     } else if (typeof obj === 'object' && obj !== null) {
//       const entries = Object.entries(obj)
//       const result: Record<string, unknown> = {}
//       for (const [key, value] of entries) {
//         if (typeof value === 'object' && value !== null && 'circle' in value) {
//           // Handle circular reference
//           const circlePath = (value as SerializedData).circle as string
//           if (map.has(circlePath)) {
//             result[key] = map.get(circlePath)
//           } else {
//             throw new Error(`Circular reference to ${circlePath} not resolved`)
//           }
//         } else {
//           result[key] = await _deserialize(value as SerializedData, `${path}.${key}`)
//         }
//       }
//       map.set(path, result)
//       return result
//     }
//     // Primitive types or functions
//     return obj
//   }

//   const deserializedData = await _deserialize(serializedObj)
//   return deserializedData
// }

type AnyObject = Record<string, unknown>

// function getValueByPath (obj: AnyObject, path: string): AnyObject | undefined {
//   const parts = path.replace(/\[(\w+)\]/g, '.$1').split('.')

//   let currentPart: string | undefined
//   let currentObject: AnyObject = obj

//   while ((currentPart = parts.shift()) !== undefined) {
//     if (currentObject[currentPart] === undefined) {
//       return undefined
//     }
//     currentObject = currentObject[currentPart] as AnyObject
//   }

//   return currentObject
// }

export function deserialize (object: Record<string, unknown>): unknown {
  const map = new Map<string, unknown>()

  function _deserialize (obj: AnyObject, path = ''): unknown {
    path = path.startsWith('.') ? path.substring(1) : path
    if (isSerializedObject(obj)) {
      switch (obj.type) {
        case 'ArrayBuffer':
          return base64ToArrayBuffer(obj.data as string)
        case 'Blob':
          // Since Blob is already a usable URL string, directly return it.
          return obj.data as string
        case 'Buffer':
        case 'Function':
          // eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval
          return obj
        default:
          throw new Error(`Unknown type: ${obj.type as string}`)
      }
    } else if (Array.isArray(obj)) {
      const array = [] as unknown[]
      const objArray = obj as unknown[]
      for (let i = 0; i < objArray.length; i++) {
        array.push(_deserialize(objArray[i] as AnyObject))
      }
      return array
    } else if (typeof obj === 'object' && obj !== null) {
      const entries = Object.entries(obj)
      const result: Record<string, unknown> = {}
      for (const [key, value] of entries) {
        if (typeof value === 'object' && value !== null && 'circle' in value) {
          // Handle circular reference
          const circlePath = (value as SerializedData).circle as string
          if (map.has(circlePath)) {
            result[key] = map.get(circlePath)
          } else {
            result[key] = value
            // throw new Error(`Circular reference to ${circlePath} not resolved`)
            // do nothing. A second pass will resolve the circular reference
          }
        } else {
          result[key] = _deserialize(value as AnyObject, `${path}.${key}`)
        }
      }
      map.set(path, result)
      return result
    }
    // Primitive types or functions
    return obj
  }

  const deserializedData = _deserialize(_deserialize(object) as AnyObject)
  return deserializedData
}