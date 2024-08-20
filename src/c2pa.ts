/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { createC2pa, type C2pa, type C2paReadResult, selectEditsAndActivity, type TranslatedDictionaryCategory, type ManifestStore, type ManifestMap } from 'c2pa'
import { type CertificateInfoExtended, extractCertChain } from './certs/certs.js'
import { type TrustListMatch } from './trustlistProxy.js'
import { AWAIT_ASYNC_RESPONSE, MSG_C2PA_VALIDATE_BYTES, MSG_C2PA_VALIDATE_URL, type MSG_PAYLOAD } from './constants.js'
import { blobToDataURL } from './utils.js'
import { createThumbnail } from './thumbnail.js'

console.debug('C2pa: Script: start')

let c2pa: C2pa | null = null

export type dataUrl = string

export interface C2paResult extends ExtensionC2paResult {
  url: string
  certChain: CertificateInfoExtended[] | null
  trustList: TrustListMatch | null
  editsAndActivity: TranslatedDictionaryCategory[] | null
}

export interface C2paError extends Error {
  url: string
  error: boolean
}

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
    // data: dataUrl
    filename: string
  }
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

      if (request.action === MSG_C2PA_VALIDATE_BYTES) {
        void validateBytes(request.data as ArrayBuffer).then(sendResponse)
        return AWAIT_ASYNC_RESPONSE
      }
    }
  )
}

export async function validateUrl (url: string): Promise<C2paResult | C2paError> {
  console.debug('%cC2pa: validateUrl:', 'color: #A0A0A0', url)

  if (c2pa == null) {
    return new Error('C2PA not initialized') as C2paError
  }

  const c2paResult = await c2pa.read(url).catch((error: Error) => {
    console.error('Error reading C2PA:', url, error)
    return error
  })

  if (c2paResult instanceof Error) {
    return { message: c2paResult.message, url, name: c2paResult.name, error: true } satisfies C2paError
  }

  if (c2paResult.manifestStore?.activeManifest == null) {
    return { message: 'No manifest found', url, name: 'No Manifest', error: true } satisfies C2paError
  }

  const serializedResult2 = await serializeC2paReadResult(c2paResult)

  const sourceBuffer = await c2paResult.source.arrayBuffer()
  const certChain = await extractCertChain(c2paResult.source.type, new Uint8Array(sourceBuffer)) ?? []

  const editsAndActivity = ((c2paResult.manifestStore?.activeManifest) != null) ? await selectEditsAndActivity(c2paResult.manifestStore?.activeManifest) : null

  const result: C2paResult = {
    ...serializedResult2,
    url,
    trustList: null,
    certChain,
    editsAndActivity
  }

  return result
}

export async function validateBytes (bytes: ArrayBuffer): Promise<C2paResult | C2paError> {
  const url = URL.createObjectURL(new Blob([bytes]))
  return await validateUrl(url)
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

  if (result.source.thumbnail.blob != null && result.source.thumbnail.blob?.size === result.source.blob?.size) {
    const thumb =
      result.source.type?.startsWith('image/')
        ? await createThumbnail(result.source.blob, 100, 100)
        : result.source.type?.startsWith('video/')
          ? undefined // await createVideoThumbnail(result.source.thumbnail.blob, 1, 100, 100)
          : undefined
    result.source.thumbnail.blob = thumb
  }

  const thumbnailData = result.source.thumbnail.blob != null ? await blobToDataURL(result.source.thumbnail.blob) : ''

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
      // data: sourceData,
      filename: result.source.metadata.filename ?? ''
    }
  }
}

void init()

console.debug('C2pa: Script: end')
