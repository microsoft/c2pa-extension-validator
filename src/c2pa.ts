/*
*  Copyright (c) Microsoft Corporation.
*  Licensed under the MIT license.
*/

import browser from 'webextension-polyfill'
import { createC2pa, type C2pa, type C2paReadResult } from 'c2pa'
import { extractCertChain } from './certs/certs.js'
import { serialize } from './serialize.js'
import { type Certificate } from '@fidm/x509'
import { checkTrustListInclusionRemote, type TrustListMatch } from './trustlist.js'
import { type MESSAGE_PAYLOAD } from './types.js'

console.debug('C2pa: Script: start')

export interface C2paResult extends C2paReadResult {
  certChain: CertificateWithThumbprint[] | null
  trustList: TrustListMatch | null
}

export interface CertificateWithThumbprint extends Certificate {
  sha256Thumbprint: string
}

export interface C2paError extends Error {
  url: string
}

let c2pa: C2pa | null = null

export async function init (): Promise<void> {
  const workerUrl = chrome.runtime.getURL('c2pa.worker.js')
  const wasmUrl = chrome.runtime.getURL('toolkit_bg.wasm')

  createC2pa({ wasmSrc: wasmUrl, workerSrc: workerUrl })
    .then(
      (newC2pa) => {
        c2pa = newC2pa
        console.debug('C2PA initialized')
      },
      (error: unknown) => {
        console.error('Error initializing C2PA:', error)
      }
    )

  browser.runtime.onMessage.addListener(
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    (request: MESSAGE_PAYLOAD, _sender) => {
      if (request.action === 'validateUrl') {
        return Promise.resolve(_validateUrl(request.data as string))
      }
      return true // do not handle this request; allow another listener to handle it
    }
  )
}

async function _validateUrl (url: string): Promise<C2paResult | C2paError> {
  if (c2pa == null) {
    return new Error('C2PA not initialized') as C2paError
  }
  const c2paResult = await c2pa.read(url)

  let certChain: CertificateWithThumbprint[] = []

  if (c2paResult.manifestStore != null) {
    const arrayBuffer = await c2paResult.source.arrayBuffer()
    certChain = await extractCertChain(c2paResult.source.type, new Uint8Array(arrayBuffer)) ?? []
  }

  const trusListMatch = await checkTrustListInclusionRemote(certChain)

  const result: C2paResult = {
    ...(await serialize(c2paResult)) as C2paReadResult,
    trustList: trusListMatch,
    certChain
  }

  return result
}

export async function validateUrl (url: string): Promise<C2paResult | C2paError> {
  const trustListMatch = await browser.runtime.sendMessage({ action: 'validateUrl', data: url })
  return trustListMatch
}

console.debug('C2pa: Script: end')
