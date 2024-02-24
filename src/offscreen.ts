/*
*  Copyright (c) Microsoft Corporation.
*  Licensed under the MIT license.
*/

import Browser from 'webextension-polyfill'
import { MESSAGE_C2PA_INSPECT_URL } from './constants.js'
import { type C2pa, createC2pa } from 'c2pa'

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

Browser.runtime.onMessage.addListener(
  async (request: MESSAGE_PAYLOAD, _sender) => {
    if (request.action === MESSAGE_C2PA_INSPECT_URL && request.data != null) {
      const url = request.data as string
      const blob = await fetchImageBlob(url)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const result = await c2pa!.read(blob)
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

void init()
