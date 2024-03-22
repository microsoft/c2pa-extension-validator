/*
*  Copyright (c) Microsoft Corporation.
*  Licensed under the MIT license.
*/

import { createC2pa, type C2pa, type C2paReadResult } from 'c2pa'
import { extractCertChain } from './certs/certs.js'
import { serialize } from './serialize.js'
import { logDebug, logError } from './utils.js'
import { type Certificate } from '@fidm/x509'

logDebug('C2pa: Script: start')

export interface C2paResult extends C2paReadResult {
  certChain: CertificateWithThumbprint[] | null
}

export interface CertificateWithThumbprint extends Certificate {
  sha256Thumbprint: string
}

export interface C2paError extends Error {
  url: string
}

let c2pa: C2pa | null = null

async function init (): Promise<void> {
  const workerUrl = chrome.runtime.getURL('c2pa.worker.js')
  const wasmUrl = chrome.runtime.getURL('toolkit_bg.wasm')

  createC2pa({ wasmSrc: wasmUrl, workerSrc: workerUrl })
    .then(
      (newC2pa) => {
        c2pa = newC2pa
        logDebug('C2PA initialized')
      },
      (error: unknown) => {
        logError('Error initializing C2PA:', error)
      }
    )
}

export async function validateUrl (url: string): Promise<C2paResult | C2paError> {
  if (c2pa == null) {
    return new Error('C2PA not initialized') as C2paError
  }
  const c2paResult = await c2pa.read(url)

  let certChain: CertificateWithThumbprint[] = []

  if (c2paResult.manifestStore != null) {
    const arrayBuffer = await c2paResult.source.arrayBuffer()
    certChain = await extractCertChain(c2paResult.source.type, new Uint8Array(arrayBuffer)) ?? []
  }

  const result: C2paResult = {
    ...(await serialize(c2paResult)) as C2paReadResult,
    certChain
  }

  return result
}

void init()

logDebug('C2pa: Script: end')
