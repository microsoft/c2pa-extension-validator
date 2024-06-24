/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { type CertificateInfoExtended, calculateSha256CertThumbprintFromX5c, PEMtoDER, certificateFromDer, distinguishedNameToString } from './certs/certs'
import { AWAIT_ASYNC_RESPONSE, MSG_ADD_TRUSTLIST, MSG_GET_TRUSTLIST_INFOS, MSG_REMOVE_TRUSTLIST, type MSG_PAYLOAD, LOCAL_TRUST_ANCHOR_LIST_NAME, MSG_TRUSTLIST_UPDATE, LOCAL_TRUST_TSA_LIST_NAME } from './constants'
import { bytesToBase64, sendMessageToAllTabs } from './utils'

// valid JWK key types (to adhere to C2PA cert profile: https://c2pa.org/specifications/specifications/2.0/specs/C2PA_Specification.html#_certificate_profile)
type ValidKeyTypes = 'RSA' /* sha*WithRSAEncryption and id-RSASSA-PSS */ | 'EC' /* ecdsa-with-* */ | 'OKP' /* id-Ed25519 */

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
 * Process a downloaded trust list before storing it
 */
async function processDownloadedTrustList (tl: TrustList): Promise<void> {
  // make sure each certificate has a thumbprint, if not, calculate it
  for (const entity of tl.entities) {
    for (const jwk of entity.jwks.keys) {
      if ((jwk['x5t#S256'] == null) && (jwk.x5c != null) && jwk.x5c.length > 0) {
        // calculate the thumbprint of the first cert in the chain
        try {
          jwk['x5t#S256'] = await calculateSha256CertThumbprintFromX5c(jwk.x5c[0])
        } catch (error) {
          // log the error, ignore the cert
          console.error('calculateSha256CertThumbprintFromX5c error:', error, 'jwk:', jwk)
        }
      }
    }
  }
}

/**
 * Returns the JWK key type `kty` corresponding to a supported signature alg
 */
function sigAlgToKeyType (sigAlg: string): ValidKeyTypes {
  const sigAlgLC = sigAlg.toLowerCase().replace('-', '')
  if (sigAlgLC === 'sha256withrsaencryption' || sigAlgLC === 'sha384withrsaencryption' || sigAlgLC === 'sha512withrsaencryption' || sigAlgLC === 'idrsassapss') {
    return 'RSA'
  } else if (sigAlgLC === 'ecdsawithsha256' || sigAlgLC === 'ecdsawithsha384' || sigAlgLC === 'ecdsawithsha512') {
    return 'EC'
  } else if (sigAlgLC === 'ided25519') {
    return 'OKP'
  } else {
    throw new Error(`Unsupported C2PA sig alg: ${sigAlg}`)
  }
}

/**
 * Stores the updated trust lists and notify the tab of the update
 */
function storeUpdatedTrustLists (message?: string): void {
  chrome.storage.local.set({ trustList: globalTrustLists }, function () {
    console.debug(message)
  })
  void notifyTabsOfTrustListUpdate()
}

/**
 * Adds a trust anchor to the built-in trust anchors list, returns the corresponding trust list info or throws an error
 */
export async function addTrustAnchor (pemCert: string, tsa = false): Promise<void> {
  console.debug(`addTrustAnchor called. tsa: ${tsa}`)
  if (pemCert == null || typeof pemCert !== 'string') {
    throw new Error('Invalid trust anchor')
  }

  const derCert = PEMtoDER(pemCert)
  const cert = await certificateFromDer(derCert)
  console.debug('cert', cert)
  const x5c = bytesToBase64(derCert)

  // create an entity to add to the built-in trust anchor list
  const DN = distinguishedNameToString(cert.subject)
  const kty = sigAlgToKeyType(cert.signatureAlgorithm)
  const entity: TrustedEntity = {
    name: DN,
    display_name: DN,
    contact: '', // n/a
    isCA: true,
    jwks: {
      keys: [
        {
          kty,
          x5c: [
            x5c
          ],
          'x5t#S256': cert.sha256Thumbprint
        }
      ]
    }
  }
  console.debug(`created trust anchor entity ${entity.name}`, entity)

  // find the local trust anchor list
  const listName = tsa ? LOCAL_TRUST_TSA_LIST_NAME : LOCAL_TRUST_ANCHOR_LIST_NAME
  const anchorTL = globalTrustLists.find(tl => tl.name === listName)
  if (anchorTL == null) {
    // list doesn't exist; create it
    console.debug(`${listName} trust list not found; creating it`)
    const tl: TrustList = {
      name: listName,
      description: listName,
      download_url: '', // n/a
      website: '', // n/a
      last_updated: '', // unused for non-downloadable trust lists
      entities: [entity]
    }
    globalTrustLists.push(tl)
  } else {
    // add the entity to the list
    console.debug(`Updating the ${listName} trust list`)
    // add or replace the entity in the list
    const existingEntity = anchorTL.entities.find(e => e.name === entity.name)
    if (existingEntity != null) {
      console.debug(`Replacing existing entity ${entity.name}`)
      const index = anchorTL.entities.indexOf(existingEntity)
      anchorTL.entities[index] = entity
    } else {
      console.debug(`Adding new entity ${entity.name}`)
      anchorTL?.entities.push(entity)
    }
    // update the global trust list
    const index = globalTrustLists.indexOf(anchorTL)
    globalTrustLists[index] = anchorTL
  }

  storeUpdatedTrustLists(`Trust anchor added to the ${listName} list: ${entity.name}`)
}

/**
 * Adds a trust list, returns the corresponding trust list info or throws an error
 */
export async function addTrustList (tl: TrustList): Promise<void> {
  console.debug('addTrustList called')

  if (typeof tl === 'undefined' /* TODO: more validation */) {
    throw new Error('Invalid trust list')
  }

  await processDownloadedTrustList(tl)

  // set the global trust list
  globalTrustLists.push(tl)

  storeUpdatedTrustLists(`Trust list stored: ${tl.name}`)
}

/**
 * Adds a trust file, either a trust list or a single certificate
 * @param content file content
 */
export async function addTrustFile(content: string): Promise<void> {
  if (content.startsWith('{')) {
    const json = JSON.parse(content) as TrustList
    addTrustList(json)
  } else {
    addTrustAnchor(content)
  }
}

/**
 * Adds a TSA trust file, either a trust list or a single certificate
 * @param content file content
 */
export async function addTSATrustFile(content: string): Promise<void> {
  addTrustAnchor(content, true)
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

  storeUpdatedTrustLists(`Trust list removed, index: ${index}, name: ${name}`)
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
  cert: CertificateInfoExtended
}

/**
 * Checks if a certificate chain is included in a trust list (either the leaf certificate or one of the CA anchors)
 * @param certChain a certificate chain
 * @returns a trust list match object if found, otherwise null
 */
export function checkTrustListInclusion (certChain: CertificateInfoExtended[], trustLists: TrustList[] = globalTrustLists): TrustListMatch | null {
  console.debug('checkTrustListInclusion called')
  if (trustLists != null && trustLists.length > 0) {
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
              return { tlInfo, entity, cert }
            }
          }
        }
      }
    }
  }
  return null
}

// update the trust lists if they are outdated
export async function refreshTrustLists (): Promise<void> {
  console.debug('refreshTrustLists called')
  let trustListsUpdated = false
  if (globalTrustLists != null && globalTrustLists.length > 0) {
    const fetchPromises = globalTrustLists.map(async (trustList, index) => {
      console.debug('Checking trust list: ' + trustList.name)
      if (trustList.download_url !== '') {
        const response = await fetch(trustList.download_url)
        const freshTrustList = await response.json() as TrustList
        console.debug(`Trust list ${trustList.name} fetched`, freshTrustList.last_updated, trustList.last_updated)
        if (freshTrustList.last_updated > trustList.last_updated) {
          console.debug(`Trust list ${trustList.name} is outdated, updating`, trustList.last_updated, freshTrustList.last_updated)
          await processDownloadedTrustList(freshTrustList)
          globalTrustLists[index] = freshTrustList
          trustListsUpdated = true
        }
      } else {
        await Promise.resolve()
      }
    })

    await Promise.all(fetchPromises)

    if (trustListsUpdated) {
      storeUpdatedTrustLists('Trust lists refreshed')
    }
  }
}

async function notifyTabsOfTrustListUpdate (): Promise<void> {
  void sendMessageToAllTabs({ action: MSG_TRUSTLIST_UPDATE, data: null })
}

/*
 *  Initialization the trust list module and message listeners
 *  Other modules import functions from this module, but they don't want the listeners
 *  So the init function needs to be called explicitly
 */
export async function init (): Promise<void> {
  void loadTrustLists()
  chrome.runtime.onMessage.addListener(
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    (request: MSG_PAYLOAD, sender, sendResponse) => {
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
