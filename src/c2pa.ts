/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { createC2pa, selectEditsAndActivity, type C2pa, type C2paReadResult, type ManifestMap, type ManifestStore, type TranslatedDictionaryCategory } from 'c2pa'
import { type CertificateInfoExtended } from './certs/certs.js'
import { decode as coseDecode, type TSTInfo, type COSE_Sign1 } from './certs/cose.js'
import { isContentBox, decode as jumbfDecode } from './certs/jumbf.js'
import { getManifestFromMetadata } from './certs/metadata.js'
import { AWAIT_ASYNC_RESPONSE, MSG_C2PA_VALIDATE_URL, type MSG_PAYLOAD } from './constants.js'
import { type TrustListMatch } from './trustlistProxy.js'
import { blobToDataURL } from './utils.js'

console.debug('C2pa: Script: start')

let c2pa: C2pa | null = null

export interface C2paResult extends ExtensionC2paResult {
  url: string
  certChain: CertificateInfoExtended[] | null
  tstTokens: TSTInfo[] | null
  trustList: TrustListMatch | null
  editsAndActivity: TranslatedDictionaryCategory[] | null
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
      },
      (error: unknown) => {
        console.error('Error initializing C2PA:', error)
      }
    )

  chrome.runtime.onMessage.addListener(
    (request: MSG_PAYLOAD, sender, sendResponse) => {
      if (request.action === MSG_C2PA_VALIDATE_URL) {
        void validateUrl(request.data as string).then(sendResponse)
        return AWAIT_ASYNC_RESPONSE
      }
    }
  )
}

export async function validateUrl (url: string): Promise<C2paResult | C2paError> {
  if (c2pa == null) {
    return new Error('C2PA not initialized') as C2paError
  }

  const c2paResult = await c2pa.read(url).catch((error: Error) => {
    console.error('Error reading C2PA:', url, error)
    return error
  })

  if (c2paResult instanceof Error) {
    return { message: c2paResult.message, url, name: c2paResult.name } satisfies C2paError
  }

  if (c2paResult.manifestStore?.activeManifest == null) {
    return { message: 'No manifest found', url, name: 'No Manifest' } satisfies C2paError
  }

  const serializedResult = await serializeC2paReadResult(c2paResult)

  const sourceBuffer = await c2paResult.source.arrayBuffer()

  const cose = await extractC2paManifest(c2paResult.source.type, new Uint8Array(sourceBuffer))

  const editsAndActivity = ((c2paResult.manifestStore?.activeManifest) != null) ? await selectEditsAndActivity(c2paResult.manifestStore?.activeManifest) : null

  const result: C2paResult = {
    ...serializedResult,
    url,
    trustList: null,
    certChain: cose?.unprotected?.x5chain ?? cose?.protected.x5chain ?? null,
    tstTokens: cose?.unprotected?.sigTst?.tstTokens ?? null,
    editsAndActivity
  }

  return result
}

export async function extractC2paManifest (type: string, mediaBuffer: Uint8Array): Promise<COSE_Sign1 | null> {
  const rawManifestBuffer = getManifestFromMetadata(type, mediaBuffer)
  if (rawManifestBuffer == null) {
    return null
  }

  /*
    The manifest buffer is decoded into a JUMBF structure.
  */
  const jumbf = jumbfDecode(rawManifestBuffer)

  /*
    C2PA manifest files are expected to have a jumbf box with a label 'c2pa.signature' containing a cbor box
  */
  const jumbfBox = jumbf.labels['c2pa.signature']
  if (jumbfBox == null || jumbfBox.boxes.length === 0 || jumbfBox.boxes[0].type !== 'cbor') {
    return null
  }

  const contentBox = jumbfBox.boxes[0]

  /*
    The first, and only box, should have a 'cbor' type
  */
  if (contentBox?.type !== 'cbor' || !isContentBox(contentBox)) {
    console.error('Expected cbor content-box in jumbf')
    return null
  }

  const coseData = contentBox.data

  const cose = await coseDecode(coseData)
  if (cose == null) {
    console.error('Could not decode COSE')
  }

  return cose
}

void init()

console.debug('C2pa: Script: end')

export type dataUrl = string

export interface ExtensionC2paIngredient {
  title: string
  format: string
  instanceId: string
  thumbnail: {
    type: string
    data: dataUrl
  }
}

export interface ExtensionC2paManifest {
  key: string
  title: string
  format: string
  claimGenerator: string
  signatureInfo: {
    issuer: string
  }
  ingredients: ExtensionC2paIngredient[]
}

export interface ExtensionC2paResult {
  manifestStore: {
    manifests: ExtensionC2paManifest[]
    activeManifest: number
    validationStatus: string[]
  }
  source: {
    thumbnail: {
      type: string
      data: dataUrl
    }
    type: string
    data: dataUrl
    filename: string
  }
}

async function serializeC2paReadResult (result: C2paReadResult): Promise<ExtensionC2paResult> {
  const manifestStore: ManifestStore | null = result.manifestStore
  if (manifestStore == null) {
    throw new Error('Manifest store is null')
  }
  const c2paManifests: ManifestMap = manifestStore.manifests
  const c2paActiveManifest = manifestStore.activeManifest
  const manifests: ExtensionC2paManifest[] = Object.entries(c2paManifests).map(([key, value]) => {
    return {
      key,
      title: value.title,
      format: value.format,
      claimGenerator: value.claimGenerator,
      signatureInfo: {
        issuer: value.signatureInfo?.issuer ?? ''
      },
      ingredients: value.ingredients.map(ingredient => {
        return {
          title: ingredient.title,
          format: ingredient.format,
          instanceId: ingredient.instanceId,
          thumbnail: {
            type: ingredient.thumbnail?.contentType ?? '',
            data: ''
          }
        }
      })
    }
  }
  )

  const activeManifestIndex = Object.values(c2paManifests).indexOf(c2paActiveManifest)

  const thumbnailData =
  !(result.source.thumbnail.contentType?.startsWith('image/') ?? false)
    ? ''
    : result.source.thumbnail.blob != null
      ? await blobToDataURL(result.source.thumbnail.blob)
      : ''

  const sourceData = (result.source.type?.startsWith('video/') ?? false)
    ? ''
    : result.source.blob != null
      ? await blobToDataURL(result.source.blob)
      : ''

  return {
    manifestStore: {
      manifests,
      activeManifest: activeManifestIndex,
      validationStatus: manifestStore.validationStatus.map(status => status.explanation ?? status.code.toString())
    },
    source: {
      thumbnail: {
        type: result.source.thumbnail.contentType ?? '',
        data: thumbnailData
      },
      type: result.source.type,
      data: sourceData,
      filename: result.source.metadata.filename ?? ''
    }
  }
}
