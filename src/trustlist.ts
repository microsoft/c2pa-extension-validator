/*
*  Copyright (c) Microsoft Corporation.
*  Licensed under the MIT license.
*/

import { CertificateWithThumbprint } from './certs/certs'

export interface TrustedEntity {
  name: string
  display_name: string
  contact: string
  isCA: boolean
  x5tS256: string
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
  logo: string,
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

  if (!tl) {
    // TODO: more validation
    throw 'Invalid trust list'
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
function loadTrustList () {
  // load the trust list from storage
  chrome.storage.local.get(['trustList'], (result) => {
    console.log('getTrustList result:', result)
    const storedTrustList =
            result?.trustList as TrustList
    if (storedTrustList) {
      globalTrustList = storedTrustList
      console.log(
                `Trust list loaded: ${storedTrustList.name}`
      )
    } else {
      console.log('No trust list found')
    }
  })
}

/**
 * Get the current trust list.
 */
export function getTrustList (): TrustList | undefined {
  return globalTrustList
}

export interface TrustListMatch {
  tlInfo: TrustListInfo
  entity: TrustedEntity
  cert: CertificateWithThumbprint
}
/**
 * Checks if a certificate chain is included in the trust list (either the leaf certificate or one of the anchors)
 * @param certChain a certificate chain
 * @returns the trusted entity from the trust list matching the certificate chain
 */
export function checkTrustListInclusion (certChain: CertificateWithThumbprint[]): TrustListMatch | null {
  if (globalTrustList) {
    // for each cert in the chain, check if it matches a cert in the trust list
    for (const cert of certChain) {
      for (const entity of globalTrustList.entities) {
        if (entity.x5tS256.toLowerCase() === cert.sha256Thumbprint && entity.isCA === cert.isCA) {
          // found a match
          return {
            tlInfo: getInfoFromTrustList(globalTrustList), // TODO: avoid recomputing this
            entity: entity,
            cert: cert
          }
        }
      }
    }
  }

  return null
}

// load the trust list from storage at startup
loadTrustList()
