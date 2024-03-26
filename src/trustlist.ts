/*
*  Copyright (c) Microsoft Corporation.
*  Licensed under the MIT license.
*/

import browser from 'webextension-polyfill'
import { type CertificateWithThumbprint } from './certs/certs'
import { type MESSAGE_PAYLOAD } from './types'

// valid JWK key types (to adhere to C2PA cert profile: https://c2pa.org/specifications/specifications/2.0/specs/C2PA_Specification.html#_certificate_profile)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const VALID_KTY = [
  'RSA', // sha*WithRSAEncryption and id-RSASSA-PSS
  'EC', // ecdsa-with-*
  'OKP' // id-Ed25519
]

// JWKS format (https://www.rfc-editor.org/rfc/rfc7517#section-4.6)
interface JWK {
  kty: string
  'x5t#S256'?: string
  x5c?: string[]
}

interface JWKS {
  keys: JWK[]
}

export interface TrustedEntity {
  name: string
  display_name: string
  contact: string
  isCA: boolean
  jwks: JWKS
}

export interface TrustList {
  // name of the trust list
  name: string
  // description of the trust list
  description: string
  // download url of the trust list
  download_url: string
  // website of the trust list
  website: string
  // last updated date of the trust list (ISO 8601 format)
  last_updated: string
  // logo of the trust list
  logo: string
  // list of trusted entities
  entities: TrustedEntity[]
}

let globalTrustList: TrustList | undefined

// trust list info (subset of the trust list data)
export interface TrustListInfo {
  name: string
  description: string
  download_url: string
  website: string
  last_updated: string
  logo: string
  entities_count: number
}

const getInfoFromTrustList = (tl: TrustList): TrustListInfo => {
  return {
    name: tl.name,
    description: tl.description,
    download_url: tl.download_url,
    website: tl.website,
    last_updated: tl.last_updated,
    logo: tl.logo,
    entities_count: tl.entities.length
  }
}

/**
 * Retrieves the trust list info.
 * @returns The trust list info if available, otherwise undefined.
 */
export function getTrustListInfo (): TrustListInfo | undefined {
  if (globalTrustList != null) {
    return getInfoFromTrustList(globalTrustList)
  } else {
    return undefined
  }
}

/**
 * Sets the trust list, returns the trust list info or throws an error
 */
export function setTrustList (tl: TrustList): TrustListInfo {
  console.log('setTrustList called')

  if (typeof tl === 'undefined') {
    // TODO: more validation
    throw new Error('Invalid trust list')
  }

  // set the global trust list
  globalTrustList = tl

  // store the trust list
  chrome.storage.local.set({ trustList: tl }, function () {
    console.log(`Trust list stored: ${tl.name}`)
  })

  return getInfoFromTrustList(tl)
}

/**
 * Retrieves the trust list from storage.
 */
export async function loadTrustList (): Promise<void> {
  // load the trust list from storage
  const trustListStore = await browser.storage.local.get('trustList') as { trustList: TrustList }
  console.debug('getTrustList result:', trustListStore)
  const storedTrustList = trustListStore.trustList
  if (storedTrustList != null) {
    globalTrustList = storedTrustList
    console.debug(`Trust list loaded: ${storedTrustList.name}`)
  } else {
    console.debug('No trust list found')
  }
}

/**
 * Get the current trust list.
 */
export function getTrustList (): TrustList | undefined {
  return globalTrustList
}

/**
 * Information about a trust list match
 */
export interface TrustListMatch {
  // trust list info
  tlInfo: TrustListInfo
  // trusted entity that matched the certificate chain
  entity: TrustedEntity
  // certificate that matched the trust list
  cert: CertificateWithThumbprint
}

/**
 * Checks if a certificate chain is included in the trust list (either the leaf certificate or one of the CA anchors)
 * @param certChain a certificate chain
 * @returns a trust list match object if found, otherwise null
 */
export function checkTrustListInclusion (certChain: CertificateWithThumbprint[]): TrustListMatch | null {
  // if (globalTrustList != null) {
  //   // for each entity's certs in the list (current and expired), check if it matches a cert in the chain
  //   for (const entity of globalTrustList.entities) {
  //     const jwks = entity.jwks
  //     for (const jwkCert of jwks.keys) {
  //       // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  //       if (!jwkCert['x5t#S256']) {
  //         continue // TODO: implement full cert (x5c) comparison
  //       }
  //       for (const cert of certChain) {
  //         if (jwkCert['x5t#S256'].toLowerCase() === cert.sha256Thumbprint && entity.isCA === cert.isCA) {
  //           // found a match
  //           return {
  //             tlInfo: getInfoFromTrustList(globalTrustList), // TODO: avoid recomputing this
  //             entity,
  //             cert
  //           }
  //         }
  //       }
  //     }
  //   }
  // }
  return null
}

export async function checkTrustListInclusionRemote (certChain: CertificateWithThumbprint[]): Promise<TrustListMatch | null> {
  const trustListMatch = await browser.runtime.sendMessage({ action: 'checkTrustListInclusion', data: certChain })
  return trustListMatch
}

browser.runtime.onMessage.addListener(
  // eslint-disable-next-line @typescript-eslint/promise-function-async
  (request: MESSAGE_PAYLOAD, _sender) => {
    if (request.action === 'checkTrustListInclusion') {
      return Promise.resolve(checkTrustListInclusion(request.data as CertificateWithThumbprint[]))
    }
    return true // do not handle this request; allow the next listener to handle it
  }
)
