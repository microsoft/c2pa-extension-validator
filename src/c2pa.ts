/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { createC2pa, type C2pa, type C2paReadResult, createL2ManifestStore, type L2ManifestStore, selectEditsAndActivity, type TranslatedDictionaryCategory } from 'c2pa'
import { extractCertChain } from './certs/certs.js'
import { serialize } from './serialize.js'
import { type Certificate } from '@fidm/x509'
import { checkTrustListInclusionRemote, type TrustListMatch } from './trustlist.js'
import { AWAIT_ASYNC_RESPONSE, MSG_INSPECT_URL, type MSG_PAYLOAD } from './constants.js'

console.debug('C2pa: Script: start')

let c2pa: C2pa | null = null

export interface C2paResult extends C2paReadResult {
  url: string
  certChain: CertificateWithThumbprint[] | null
  trustList: TrustListMatch | null
  l2: L2ManifestStore
  editsAndActivity: TranslatedDictionaryCategory[] | null
}

export interface CertificateWithThumbprint extends Certificate {
  sha256Thumbprint: string
}

export interface C2paError extends Error {
  url: string
}

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

  chrome.runtime.onMessage.addListener(
    (request: MSG_PAYLOAD, sender, sendResponse) => {
      if (request.action === MSG_INSPECT_URL) {
        void _validateUrl(request.data as string).then(result => {
          sendResponse(result)
        })
        return AWAIT_ASYNC_RESPONSE
      }
    }
  )
}

async function _validateUrl (url: string): Promise<C2paResult | C2paError> {
  if (c2pa == null) {
    return new Error('C2PA not initialized') as C2paError
  }
  const c2paResult = await c2pa.read(url)

  let certChain: CertificateWithThumbprint[] = []

  if (c2paResult.manifestStore?.activeManifest == null) {
    const err = new Error('No active manifest found') as C2paError
    err.url = url
    return err
  }

  const arrayBuffer = await c2paResult.source.arrayBuffer()
  certChain = await extractCertChain(c2paResult.source.type, new Uint8Array(arrayBuffer)) ?? []

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const l2Full = await createL2ManifestStore(c2paResult.manifestStore)
  const l2 = l2Full.manifestStore

  const editsAndActivity = ((c2paResult.manifestStore?.activeManifest) != null) ? await selectEditsAndActivity(c2paResult.manifestStore?.activeManifest) : null
  console.log(JSON.stringify(editsAndActivity, null, 2))

  const trustListMatch = await checkTrustListInclusionRemote(certChain)

  const serializedIssuer = await serialize(certChain[0].issuer) as Certificate
  console.debug('Issuer: ', serializedIssuer)

  const result: C2paResult = {
    ...c2paResult,
    url,
    trustList: trustListMatch,
    certChain,
    l2,
    editsAndActivity
  }

  const serializedResult = await serialize(result) as C2paResult

  return serializedResult
}

export async function validateUrl (url: string): Promise<C2paResult | C2paError> {
  const trustListMatch = await chrome.runtime.sendMessage({ action: MSG_INSPECT_URL, data: url })
  return trustListMatch
}

console.debug('C2pa: Script: end')
