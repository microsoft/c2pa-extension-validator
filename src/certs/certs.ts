/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { Certificate } from '@fidm/x509'
import { type JumbfBox, type JumbfResult, type ContentBox, decode as jumbfDecode } from './jumbf.js'
import { decode as cborDecode } from './cbor.js'
import { decode as jxtDecode } from './jpegxt.js'
import { exportApp11 } from './jpeg.js'
import { Buffer } from 'buffer'; // required for polyfill

interface COSE {
  0: Uint8Array
  1: { x5chain: Uint8Array[] }
  2: null
  3: Uint8Array
}

export function getCertChainFromJpeg(jpegBuffer: Uint8Array): Certificate[] | null {
  /*
    Raw byte data is extracted from the JPEG APP11 metadata section.
  */
  const app11Buffers = exportApp11(jpegBuffer)
  if (app11Buffers.length === 0) {
    return null
  }

  /*
    The APP11 sections are decoded as JpegXT sections and merged into a single JUMBF buffer.
  */
  const jumpfBuffer = jxtDecode(app11Buffers)

  /*
    The JUMBF buffer is decoded into a JUMBF structure.
  */
  const jumpf = jumbfDecode(jumpfBuffer)

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
  return x5chain.map((buffer) => {
    let base64UrlString = Buffer.from(buffer).toString('base64')
    const pem = toPEM(base64UrlString)
    const cert = Certificate.fromPEM(Buffer.from(pem, 'utf-8'))
    return cert
  })
}

function toPEM(base64String: string): string {
  const PEM_HEADER = '-----BEGIN CERTIFICATE-----\n';
  const PEM_FOOTER = '\n-----END CERTIFICATE-----';
  let formattedBase64 = base64String.match(/.{1,64}/g)?.join('\n');
  return PEM_HEADER + formattedBase64 + PEM_FOOTER;
}

function getCertChain(jumbf: JumbfResult): Uint8Array[] | null {
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
