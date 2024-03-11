/*
*  Copyright (c) Microsoft Corporation.
*  Licensed under the MIT license.
*/

import Browser from 'webextension-polyfill'
import { MESSAGE_C2PA_INSPECT_URL } from './constants.js'
import { type C2pa, createC2pa, type C2paReadResult } from 'c2pa'
// import ExifReader from 'exifreader'
import { getCertChainFromJpeg } from './certs/certs.js'
import { type Certificate } from '@fidm/x509'

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

interface c2paResultWithChain extends C2paReadResult {
  certChain: Certificate[] | null
}

Browser.runtime.onMessage.addListener(
  async (request: MESSAGE_PAYLOAD, _sender) => {
    if (request.action === MESSAGE_C2PA_INSPECT_URL && request.data != null) {
      const url = request.data as string
      const blob = await fetchImageBlob(url)
      const arrayBuffer = await blob.arrayBuffer()
      // const tags = await ExifReader.load(arrayBuffer, { async: true })
      // console.log('ExifReader tags:', JSON.stringify(tags, null, 2))
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const c2paResult = await c2pa!.read(blob)

      const thumbnails: Array<{ blob: Blob | Uint8Array }> = []
      walkObject(c2paResult, ['thumbnail'], (value, key) => {
        const obj = value as Record<string, unknown>
        if (obj != null && obj.blob instanceof Blob && !thumbnails.includes(value as { blob: Blob | Uint8Array })) {
          thumbnails.push(value as { blob: Blob | Uint8Array })
          // obj.blob = URL.createObjectURL(blob)
        }
      })
      for (const thumb of thumbnails) {
        thumb.blob = new Uint8Array(await (thumb.blob as Blob).arrayBuffer())
        // thumb.blob = URL.createObjectURL(blob)
        console.log('Thumbnail arrayBuffer:', arrayBuffer)
      }

      const result = (c2paResult as c2paResultWithChain)
      result.certChain = getCertChainFromJpeg(new Uint8Array(arrayBuffer))

      return result
    }
  }
)

const fetchImageBlob = async (url: string): Promise<Blob> => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Network response was not ok for URL: ${url}`)
  }
  return await response.blob()
}

function walkObject (obj: Record<string, unknown> | unknown, keys: string[], callback: (value: unknown, key: string) => void): void {
  // Ensure the input is an object
  if (typeof obj !== 'object' || obj === null) return

  // Iterate over all properties of the object
  Object.keys(obj).forEach(key => {
    const value = (obj as Record<string, unknown>)[key]

    // If the current key is one of the specified keys, call the callback
    if (keys.includes(key)) {
      callback(value, key)
    }

    // If the value is an object, recursively call walkObject
    walkObject(value, keys, callback)
  })
}

void init()
