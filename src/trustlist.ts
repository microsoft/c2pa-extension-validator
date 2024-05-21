/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { type CertificateWithThumbprint, calculateSha256CertThumbprintFromX5c } from './certs/certs'
import { AWAIT_ASYNC_RESPONSE, MSG_ADD_TRUSTLIST, MSG_CHECK_TRUSTLIST_INCLUSION, MSG_GET_TRUSTLIST_INFOS, MSG_REMOVE_TRUSTLIST, type MSG_PAYLOAD } from './constants'

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
  // version of the trust list schema
  version?: string
  // name of the trust list
  name?: string
  // description of the trust list
  description: string
  // download url of the trust list
  download_url: string
  // website of the trust list
  website: string
  // last updated date of the trust list (ISO 8601 format)
  last_updated: string
  // logo of the trust list (optional)
  logo_icon?: string
  // list of trusted entities
  entities: TrustedEntity[]
}

// trust list info (subset of the trust list data)
export interface TrustListInfo {
  version?: string
  name?: string
  description: string
  download_url: string
  website: string
  last_updated: string
  logo_icon?: string
  entities_count: number
}

let globalTrustLists: TrustList[] = []

const getInfoFromTrustList = (tl: TrustList): TrustListInfo => {
  const tli: TrustListInfo = {
    description: tl.description,
    download_url: tl.download_url,
    website: tl.website,
    last_updated: tl.last_updated,
    entities_count: tl.entities.length
  }
  if (tl.version != null) {
    tli.version = tl.version
  }
  if (tl.name != null) {
    tli.name = tl.name
  }
  if (tl.logo_icon != null) {
    tli.logo_icon = tl.logo_icon
  }
  return tli
}

/**
 * Retrieves the trust list infos.
 * @returns The trust list infos if available, otherwise undefined.
 */
export async function getTrustListInfos (): Promise<TrustListInfo[]> {
  if (globalTrustLists != null && globalTrustLists.length > 0) {
    return await Promise.resolve(globalTrustLists.map(tl => getInfoFromTrustList(tl)))
  } else {
    return await Promise.resolve([])
  }
}

/**
 * Adds a trust list, returns the corresponding trust list info or throws an error
 */
export async function addTrustList (tl: TrustList): Promise<TrustListInfo> {
  console.debug('addTrustList called')

  if (typeof tl === 'undefined') {
    // TODO: more validation
    throw new Error('Invalid trust list')
  }

  // make sure each certificate has a thumbprint, if not, calculate it
  for (const entity of tl.entities) {
    for (const jwk of entity.jwks.keys) {
      if ((jwk['x5t#S256'] == null) && (jwk.x5c != null) && jwk.x5c.length > 0) {
        // calculate the thumbprint of the first cert in the chain
        try {
          jwk['x5t#S256'] = await calculateSha256CertThumbprintFromX5c(jwk.x5c[0])
        } catch (error) {
          // log the error, ignore the cert
          console.error('addTrustList - error:', error)
        }
      }
    }
  }
  // set the global trust list
  globalTrustLists.push(tl)

  // store the trust list
  chrome.storage.local.set({ trustList: globalTrustLists }, function () {
    console.debug(`Trust list stored: ${tl.name}`)
  })

  void notifyTabOfTrustListUpdate()

  return getInfoFromTrustList(tl)
}

/**
 * Removes a trust list from the trust list array.
 * @param index index of the trust list to remove
 */
export async function removeTrustList (index: number): Promise<void> {
  console.debug('removeTrustList called')

  const name = globalTrustLists[index].name

  // remove the trust list
  globalTrustLists.splice(index, 1)

  // store the trust list
  chrome.storage.local.set({ trustList: globalTrustLists }, function () {
    console.debug(`Trust list removed, index: ${index}, name: ${name}`)
  })

  void notifyTabOfTrustListUpdate()
}

/**
 * Retrieves the trust lists from storage.
 */
export async function loadTrustLists (): Promise<void> {
  // load the trust lists from storage
  const trustListStore = await chrome.storage.local.get('trustList') as { trustList: TrustList[] }
  console.debug('getTrustList result:', trustListStore)
  const storedTrustList = trustListStore.trustList
  if (storedTrustList != null) {
    globalTrustLists = storedTrustList
    console.debug(`Trust lists loaded, count: ${storedTrustList.length}`)
  } else {
    console.debug('No trust list found')
  }
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
 * Checks if a certificate chain is included in a trust list (either the leaf certificate or one of the CA anchors)
 * @param certChain a certificate chain
 * @returns a trust list match object if found, otherwise null
 */
export async function checkTrustListInclusion (certChain: CertificateWithThumbprint[]): Promise<TrustListMatch | null> {
  console.debug('checkTrustListInclusion called')
  if (globalTrustLists != null && globalTrustLists.length > 0) {
    // for each trust list
    for (const trustList of globalTrustLists) {
      // for each entity's certs in the list (current and expired), check if it matches a cert in the chain
      for (const entity of trustList.entities) {
        const jwks = entity.jwks
        for (const jwkCert of jwks.keys) {
          // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
          for (const cert of certChain) {
            if ((jwkCert['x5t#S256'] != null) && jwkCert['x5t#S256'].toLowerCase() === cert.sha256Thumbprint && entity.isCA === cert.isCA) {
              // found a match
              const tlInfo = getInfoFromTrustList(trustList)
              console.debug('Trust list match:', entity, cert)
              return await Promise.resolve({
                tlInfo,
                entity,
                cert
              })
            }
          }
        }
      }
    }
  }
  return null
}

async function notifyTabOfTrustListUpdate (): Promise<void> {
  const tabId = await getActiveTabId()
  if (tabId == null) return
  void chrome.tabs.sendMessage(tabId, { action: 'MSG_TRUSTLIST_UPDATE', data: null })
}

async function getActiveTabId (): Promise<number | undefined> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  return tabs?.[0]?.id
}

export async function init (): Promise<void> {
  void loadTrustLists()
  chrome.runtime.onMessage.addListener(
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    (request: MSG_PAYLOAD, sender, sendResponse) => {
      if (request.action === MSG_CHECK_TRUSTLIST_INCLUSION) {
        void checkTrustListInclusion(request.data as CertificateWithThumbprint[]).then(sendResponse)
        return AWAIT_ASYNC_RESPONSE
      }
      if (request.action === MSG_GET_TRUSTLIST_INFOS) {
        void getTrustListInfos().then(sendResponse)
        return AWAIT_ASYNC_RESPONSE
      }
      if (request.action === MSG_ADD_TRUSTLIST) {
        void addTrustList(request.data as TrustList).then(sendResponse)
        return AWAIT_ASYNC_RESPONSE
      }
      if (request.action === MSG_REMOVE_TRUSTLIST) {
        void removeTrustList(request.data as number).then(sendResponse)
        return AWAIT_ASYNC_RESPONSE
      }
    }
  )
}

// update the trust lists if they are outdated
export async function refreshTrustLists (): Promise<void> {
  console.debug('refreshTrustLists called')
  if (globalTrustLists != null && globalTrustLists.length > 0) {
    for (let i = 0; i < globalTrustLists.length; i++) {
      const trustList = globalTrustLists[i];
      console.debug('Checking trust list: ' + trustList.name)
      // fetch the trust list if we have a download URL
      if (trustList.download_url) {
        fetch(trustList.download_url)
        .then((response: Response) => response.json())
        .then((freshTrustList: TrustList) => {
          if (freshTrustList.last_updated > trustList.last_updated) {
            console.debug(`Trust list ${trustList.name} is outdated, updating`,
              trustList.last_updated, freshTrustList.last_updated)
            globalTrustLists[i] = freshTrustList
          }
        })
      }
    }
    // store the trust list
    chrome.storage.local.set({ trustList: globalTrustLists }, function () {
      console.debug('Trust lists refreshed')
    })
  }
}

void init()
