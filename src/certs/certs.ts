/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { Certificate, type DistinguishedName as x509DistinguishedName } from '@fidm/x509'
import { type JumbfResult, type ContentBox, decode as jumbfDecode } from './jumbf.js'
import { decode as cborDecode } from './cbor.js'
import { Buffer } from 'buffer' // required for polyfill
import { getManifestFromMetadata } from './metadata.js'
import { bytesToHex } from '../utils.js'

export interface COSE {
  0: Uint8Array
  1: { x5chain?: Uint8Array[], sigTst?: { tstTokens: Array<{ val: Uint8Array }> } }
  2: null
  3: Uint8Array
}

export interface DistinguishedName {
  CN: string
  C: string
  O: string
  OU: string
  L: string
  ST: string
}

export type isoDateString = string

export interface CertificateInfo {
  issuer: DistinguishedName
  subject: DistinguishedName
  validFrom: isoDateString
  validTo: isoDateString
  isCA: boolean
}

export interface CertificateWithThumbprint extends CertificateInfo {
  sha256Thumbprint: string
}

export async function calculateSha256CertThumbprintFromDer (der: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest({ name: 'SHA-256' }, der)
  const hex = bytesToHex(new Uint8Array(digest))
  return hex
}

export async function calculateSha256CertThumbprintFromX5c (x5c: string): Promise<string> {
  return await calculateSha256CertThumbprintFromDer(Buffer.from(x5c, 'base64'))
}

export async function createCertificateFromDer (der: Uint8Array): Promise<CertificateWithThumbprint> {
  const sha256Thumbprint = await calculateSha256CertThumbprintFromDer(der)
  const pem = DERtoPEM(der)
  const cert = Certificate.fromPEM(Buffer.from(pem, 'utf-8'))

  const certInfo = parseCertificate(cert)

  const certWithTP = certInfo as CertificateWithThumbprint
  certWithTP.sha256Thumbprint = sha256Thumbprint
  console.debug('sha256Thumbprint: ', sha256Thumbprint)
  return certWithTP
}

export async function extractCertChain (type: string, mediaBuffer: Uint8Array): Promise<CertificateWithThumbprint[] | null> {
  const rawManifestBuffer = getManifestFromMetadata(type, mediaBuffer)
  if (rawManifestBuffer == null) {
    return null
  }
  /*
    The manifest buffer is decoded into a JUMBF structure.
  */
  const jumpf = jumbfDecode(rawManifestBuffer)

  /*
    The JUMBF structure is parsed to extract the COSE cbor data
    The COSE cbor data is parsed to extract the x5chain array of buffers
  */
  const x5chain = getCertChain(jumpf)
  if (x5chain == null) {
    return null
  }

  /*
    The x5chain array of buffers is converted into PEM strings
    The PEM strings are parsed into Certificate objects
  */
  const certificates = await Promise.all(x5chain.map(async (buffer) => {
    const cert = await createCertificateFromDer(buffer)
    return cert
  }))
  return certificates
}

/**
 * Converts a DER encoded certificate to a PEM encoded certificate.
 */
export function DERtoPEM (der: Uint8Array): string {
  const PEM_HEADER = '-----BEGIN CERTIFICATE-----\n'
  const PEM_FOOTER = '\n-----END CERTIFICATE-----'
  const base64String = Buffer.from(der).toString('base64')
  const formattedBase64 = base64String.match(/.{1,64}/g)?.join('\n')
  return PEM_HEADER + formattedBase64 + PEM_FOOTER
}

/**
 * Converts a PEM encoded certificate to a DER encoded certificate.
 */
export function PEMtoDER (pem: string): Uint8Array {
  const base64String = pem.replace(/-----BEGIN CERTIFICATE-----/, '').replace(/-----END CERTIFICATE-----/, '').replace(/\r?\n|\r/g, '')
  return Buffer.from(base64String, 'base64')
}

function getCertChain (jumbf: JumbfResult): Uint8Array[] | null {
  const jumbfBox = jumbf.labels['c2pa.signature']
  if (jumbfBox == null || jumbfBox.boxes.length === 0 || jumbfBox.boxes[0].type !== 'cbor') {
    return null
  }
  const cborContentBox = jumbfBox.boxes[0] as ContentBox
  const cbor = cborDecode(cborContentBox.data)
  const cose = (cbor as { tag: number | string, value: COSE }).value
  if (cose?.[1]?.x5chain != null) {
    let x5chain = cose[1].x5chain
    x5chain = x5chain instanceof Uint8Array ? [x5chain] : x5chain
    return x5chain
  } else if ((cose?.[1]?.sigTst) != null) {
    const cb = cborDecode(cose[0]) as Record<number, Uint8Array[]>
    let x5chain = cb[33] // 33 = x5chain
    x5chain = x5chain instanceof Uint8Array ? [x5chain] : x5chain
    return x5chain
  }
  return null
}

/*
  The x509 lib uses getters to return cert properties that are stripped during serialization.
  This function extracts the properties that are needed for display
*/
function parseCertificate (cert: Certificate): CertificateInfo {
  return {
    issuer: getDistinguishedName(cert.issuer),
    subject: getDistinguishedName(cert.subject),
    validFrom: localDateTime(cert.validFrom.toString()),
    validTo: localDateTime(cert.validTo.toString()),
    isCA: cert.isCA
  }
}

function getDistinguishedName (dn: x509DistinguishedName): DistinguishedName {
  const getShortName = (shortName: string): string => {
    const attr = dn.attributes.find((attr) => attr.shortName === shortName)
    return attr?.value ?? ''
  }
  return {
    CN: getShortName('CN'),
    O: getShortName('O'),
    OU: getShortName('OU'),
    C: getShortName('C'),
    L: getShortName('L'),
    ST: getShortName('ST')
  }
}

export function localDateTime (isoDateString: string): string {
  const date = new Date(isoDateString)
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    // hour: 'numeric',
    // minute: 'numeric',
    // second: 'numeric',
    // timeZoneName: 'short',
    hour12: true
  }
  const formattedDate = new Intl.DateTimeFormat('en-US', options).format(date)
  return formattedDate
}
