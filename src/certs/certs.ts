/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { Certificate } from '@fidm/x509'
import { type JumbfResult, type ContentBox, decode as jumbfDecode } from './jumbf.js'
import { decode as cborDecode } from './cbor.js'
import { Buffer } from 'buffer' // required for polyfill
import { getManifestFromMetadata } from './metadata.js'
import { bytesToHex } from '../utils.js'

interface COSE {
  0: Uint8Array
  1: { x5chain: Uint8Array[] }
  2: null
  3: Uint8Array
}

export interface CertificateWithThumbprint extends Certificate {
  sha256Thumbprint: string
}

async function calculateSha256CertThumbprint (der: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest({ name: 'SHA-256' }, der)
  const hex = bytesToHex(new Uint8Array(digest))
  return hex
}

export async function createCertificateFromDer (der: Uint8Array): Promise<CertificateWithThumbprint> {
  const sha256Thumbprint = await calculateSha256CertThumbprint(der)
  const base64UrlString = Buffer.from(der).toString('base64')
  const pem = toPEM(base64UrlString)
  const cert = Certificate.fromPEM(Buffer.from(pem, 'utf-8'))
  const certWithTP = cert as unknown as CertificateWithThumbprint
  certWithTP.sha256Thumbprint = sha256Thumbprint
  console.log('sha256Thumbprint: ', sha256Thumbprint)
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

function toPEM (base64String: string): string {
  const PEM_HEADER = '-----BEGIN CERTIFICATE-----\n'
  const PEM_FOOTER = '\n-----END CERTIFICATE-----'
  const formattedBase64 = base64String.match(/.{1,64}/g)?.join('\n')
  return PEM_HEADER + formattedBase64 + PEM_FOOTER
}

function getCertChain (jumbf: JumbfResult): Uint8Array[] | null {
  const jumbfBox = jumbf.labels['c2pa.signature']
  if (jumbfBox == null || jumbfBox.boxes.length === 0 || jumbfBox.boxes[0].type !== 'cbor') {
    return null
  }
  const cborContentBox = jumbfBox.boxes[0] as ContentBox
  const cbor = cborDecode(cborContentBox.data)
  const cose = (cbor as { tag: number | string, value: COSE }).value
  const x5chain = cose[1].x5chain
  return x5chain
}
