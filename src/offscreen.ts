/*
*  Copyright (c) Microsoft Corporation.
*  Licensed under the MIT license.
*/

import Browser from 'webextension-polyfill'
import { MESSAGE_C2PA_INSPECT_URL } from './constants.js'
import { type C2pa, createC2pa } from 'c2pa'
import { extractCertChain } from './certs/certs.js'
import { serialize } from './serialize.js'
import { type MESSAGE_PAYLOAD } from './types.js'

console.debug('offscreen.js: load')

let c2pa: C2pa | null = null

async function init (): Promise<void> {
  const workerUrl = chrome.runtime.getURL('c2pa.worker.js')
  const wasmUrl = chrome.runtime.getURL('toolkit_bg.wasm')

  createC2pa({ wasmSrc: wasmUrl, workerSrc: workerUrl })
    .then(
      (newC2pa) => {
        c2pa = newC2pa
        console.log('C2PA initialized')
      },
      (error: unknown) => {
        console.error('Error initializing C2PA:', error)
      }
    )
}

// interface c2paResultWithChain {
//   manifestStore: ManifestStore
//   certChain: Certificate[] | null
// }

Browser.runtime.onMessage.addListener(
  async (request: MESSAGE_PAYLOAD, _sender) => {
    if (request.action === MESSAGE_C2PA_INSPECT_URL && request.data != null) {
      const url = request.data as string
      const arrayBuffer = await fetchImageArrayBuffer(url)
      // const arrayBuffer = await blob.arrayBuffer()
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const extension = url.split('.').pop()!

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const c2paResult = await c2pa!.read(url/* blob */)

      // const thumbnails: Array<{ blob: Blob | Uint8Array }> = []
      // serializeBlobs(c2paResult, ['thumbnail'], (value, key) => {
      //   const obj = value as Record<string, unknown>
      //   if (obj != null && obj.blob instanceof Blob && !thumbnails.includes(value as { blob: Blob | Uint8Array })) {
      //     thumbnails.push(value as { blob: Blob | Uint8Array })
      //     // obj.blob = URL.createObjectURL(blob)
      //   }
      // })
      // for (const thumb of thumbnails) {
      //   thumb.blob = new Uint8Array(await (thumb.blob as Blob).arrayBuffer())
      //   // thumb.blob = URL.createObjectURL(blob)
      //   console.log('Thumbnail arrayBuffer:', arrayBuffer)
      // }

      // const result = (c2paResult as c2paResultWithChain)
      // result.certChain = getCertChainFromJpeg(new Uint8Array(arrayBuffer))
      const result = {
        ...(await serialize(c2paResult)) as Record<string, unknown>,
        certChain: extractCertChain(extension, new Uint8Array(arrayBuffer)),
        tabId: _sender.tab?.id
      }

      return result
    }

    if (request.action === 'hello') {
      console.log('Message received in offscreen:', request.data)
    }
  }
)

const fetchImageArrayBuffer = async (url: string): Promise<ArrayBuffer> => {
  const response = await fetch(url, { method: 'GET', credentials: 'include' })
  if (!response.ok) {
    throw new Error(`Network response was not ok for URL: ${url}`)
  }
  return await response.arrayBuffer()
}

// function serializeBlobs (obj: Record<string, unknown> | unknown, keys: string[], callback: (value: unknown, key: string) => void): void {
//   // Ensure the input is an object
//   if (typeof obj !== 'object' || obj === null) return

//   // Iterate over all properties of the object
//   Object.keys(obj).forEach(key => {
//     const value = (obj as Record<string, unknown>)[key]

//     // If the current key is one of the specified keys, call the callback
//     if (keys.includes(key)) {
//       callback(value, key)
//     }

//     // If the value is an object, recursively call walkObject
//     serializeBlobs(value, keys, callback)
//   })
// }

void init()
