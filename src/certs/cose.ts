/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { ASN1, Class, Tag, type Captures, type Template } from '@fidm/asn1'
import { Buffer } from 'buffer' // required for polyfill
import { decode as cborDecode } from './cbor.js'
import { type DistinguishedName, certificateFromDer, type CertificateInfoExtended } from './certs.js'

interface COSE_Sign1 {
  protected: ProtectedHeader
  unprotected: UnprotectedHeader
  payload: Uint8Array | null
  signature: Uint8Array
}

interface ProtectedHeader {
  alg?: string | number
  x5chain?: CertificateInfoExtended[]
  [key: string | number]: unknown
}

interface UnprotectedHeader {
  pad?: Uint8Array
  sigTst?: {
    tstTokens: TSTInfo[]
  }
  x5chain?: CertificateInfoExtended[]
  [key: string | number]: unknown
}

interface TSTInfo {
  version: number
  policy: string
  messageImprint: {
    algorithm: string
    hashValue: Uint8Array
  }
  serialNumber: number
  genTime?: string
  accuracy?: {
    seconds: number
    millis: number
    micros: number
  }
  ordering?: boolean
  nonce?: number
  tsa?: DistinguishedName
  certChain: CertificateInfoExtended[]
  signerInfo: SignerInfo
}

interface SigningCertificate {
  hashAlgorithm: string
  certHash: Uint8Array
  issuerSerial?: {
    issuer: DistinguishedName[]
    serialNumber: Uint8Array
  }
}

interface SignerInfo {
  contentType?: string
  signingTime?: Date
  cmsAlgorithmProtection?: string
  messageDigest?: Uint8Array
  signingCertificates?: SigningCertificate[]
}

type Sequence = ASN1[]

const TIME_STAMP_TOKEN_OID = '1.2.840.113549.1.9.16.1.4'

const keyMapping: Record<number, string> = {
  1: 'alg',
  33: 'x5chain'
}

const algMapping: Record<number, string> = {
  [-7]: 'ECDSA_256'
}

async function decode (bytes: Uint8Array): Promise<COSE_Sign1 | null> {
  const cbor = cborDecode(bytes) as { tag: string, value: Record<number, unknown> }

  if (cbor.tag == null) {
    console.error('Unexpected COSE tag:', cbor.tag)
    return null
  }

  switch (cbor.tag) {
    case 'COSE_Sign1':
      return await decodeCoseSign1(cbor.value)
    default:
      console.error('Unexpected COSE tag:', cbor.tag)
      return null
  }
}

async function decodeCoseSign1 (fields: Record<number, unknown>): Promise<COSE_Sign1 | null> {
  const protectedHeader = cborDecode(fields[0] as Uint8Array) as ProtectedHeader
  if (protectedHeader == null) {
    console.error('No protected header header in COSE')
    return null
  }

  const result = {
    protected: await parseLabels(mapNumberKeysToLabels(protectedHeader)),
    unprotected: await parseLabels(fields[1] as UnprotectedHeader),
    payload: fields[2] as Uint8Array | null,
    signature: fields[3] as Uint8Array
  }

  return result
}

function mapNumberKeysToLabels (object: Record<number | string, unknown>): Record<number | string, unknown> {
  for (const key in object) {
    if (Object.prototype.hasOwnProperty.call(object, key)) {
      const numberKey = Number.parseInt(key)
      const newKey = keyMapping[numberKey] as string | undefined
      if (newKey != null) {
        object[newKey] = object[numberKey]
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete object[numberKey]
      }
    }
  }
  return object
}

async function parseLabels (object: Record<string, unknown>): Promise<Record<string, unknown>> {
  for (const key in object) {
    switch (key) {
      case 'alg':
        object[key] = alg(object[key] as number)
        break
      case 'x5chain':
        object[key] = await x5Chain(object[key] as Uint8Array[])
        break
      case 'sigTst':
        object[key] = await sigTst(object[key] as { tstTokens: Array<{ val: Uint8Array }> })
        break
      default:
        break
    }
  }
  return object
}

function alg (value: number): string {
  return algMapping[value] ?? value.toString()
}

function getHashAlgorithmName (oid: string): string {
  // Map of OIDs to their corresponding hash algorithm names
  const oidToAlgorithmMap: Record<string, string> = {
    '1.3.14.3.2.26': 'SHA-1',
    '2.16.840.1.101.3.4.2.1': 'SHA-256',
    '2.16.840.1.101.3.4.2.2': 'SHA-384',
    '2.16.840.1.101.3.4.2.3': 'SHA-512',
    '2.16.840.1.101.3.4.2.4': 'SHA-224',
    '2.16.840.1.101.3.4.2.5': 'SHA-512/224',
    '2.16.840.1.101.3.4.2.6': 'SHA-512/256',
    '2.16.840.1.101.3.4.2.7': 'SHA-3-224',
    '2.16.840.1.101.3.4.2.8': 'SHA-3-256',
    '2.16.840.1.101.3.4.2.9': 'SHA-3-384',
    '2.16.840.1.101.3.4.2.10': 'SHA-3-512',
    '2.16.840.1.101.3.4.2.11': 'SHAKE128',
    '2.16.840.1.101.3.4.2.12': 'SHAKE256'
  }
  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  return oidToAlgorithmMap[oid] || oid
}

async function x5Chain (x5ChainBytes: Uint8Array[]): Promise<CertificateInfoExtended[]> {
  return await Promise.all(x5ChainBytes.map(async (der) => await certificateFromDer(der)))
}

async function certificatesFromASN1 (asn1Certificates: ASN1): Promise<CertificateInfoExtended[]> {
  if (asn1Certificates == null) {
    return []
  }
  const certDERS = (asn1Certificates.value as ASN1[]).map((asn1) => asn1.DER)
  const certs = await x5Chain(certDERS as Uint8Array[])
  return certs
}

async function sigTst (sigTst: { tstTokens: Array<{ val: Uint8Array }> }): Promise<{ tstTokens: TSTInfo[] }> {
  const tokens: TSTInfo[] = []
  for (const token of sigTst.tstTokens) {
    const captures = ASN1.parseDERWithTemplate(Buffer.from(token.val), tbsCertificateTemplate)
    const tsTinfoType = captures['eContent.type']
    const tsTinfoData = captures['eContent.octetString']

    if (tsTinfoType?.value === TIME_STAMP_TOKEN_OID && tsTinfoData != null) {
      const tstInfoCaptures = ASN1.parseDERWithTemplate(tsTinfoData.bytes, tstInfoTemplate)
      const info = tstInfo(tstInfoCaptures)
      info.certChain = await certificatesFromASN1(captures.certificates)
      info.signerInfo = signerInfo(captures['signerInfo.signedAttrs'])
      tokens.push(info as TSTInfo)
    }
  }
  return { tstTokens: tokens }
}

function tstInfo (captures: Captures): Partial<TSTInfo> {
  const tsaAsn1 = captures['TSTInfo.tsa.generalName.DN']
  const nonceAsn1 = captures.nonce
  return {
    version: captures.version.value as number,
    policy: captures.policy.value as string,
    messageImprint: {
      algorithm: captures['messageImprint.algorithm.oid'].value as string,
      hashValue: captures['messageImprint.hashValue'].value as Uint8Array
    },
    serialNumber: captures.serialNumber.value as number,
    genTime: captures.genTime?.value as string | undefined,
    accuracy: {
      seconds: captures['accuracy.seconds']?.value == null ? 0 : ASN1.parseInteger(captures['accuracy.seconds'].bytes) as number,
      millis: captures['accuracy.millis']?.value == null ? 0 : ASN1.parseInteger(captures['accuracy.millis'].bytes) as number,
      micros: captures['accuracy.micros']?.value == null ? 0 : ASN1.parseInteger(captures['accuracy.micros'].bytes) as number
    },
    ordering: captures.ordering?.value ?? false,
    nonce: nonceAsn1 == null ? undefined : ASN1.parseInteger(captures.nonce.bytes) as number,
    tsa: tsaAsn1 == null ? undefined : distinguishedName(captures['TSTInfo.tsa.generalName.DN'].value as ASN1[])
  }
}

function signerInfo (capture: ASN1): SignerInfo {
  const fields = capture.value as Sequence
  const signerInfo: SignerInfo = { contentType: undefined, signingTime: undefined, cmsAlgorithmProtection: undefined, messageDigest: undefined, signingCertificates: undefined }
  fields.forEach((sequence) => {
    const oid = sequence?.value[0]?.value as string
    const set = sequence?.value[1]?.value as Sequence
    const value = set[0].value as unknown
    switch (oid) {
      case '1.2.840.113549.1.9.3':
        signerInfo.contentType = value as string
        break
      case '1.2.840.113549.1.9.5':
        signerInfo.signingTime = value as Date
        break
      case '1.2.840.113549.1.9.52':
        signerInfo.cmsAlgorithmProtection = ((value as Sequence /* sequence */)?.[0]?.value as Sequence /* sequence */)?.[0]?.value as string
        break
      case '1.2.840.113549.1.9.4':
        signerInfo.messageDigest = value as Uint8Array
        break
      case '1.2.840.113549.1.9.16.2.12':
        signerInfo.signingCertificates = signingCertificates((value as Sequence)?.[0].value as Sequence, 1)
        break
      case '1.2.840.113549.1.9.16.2.47':
        signerInfo.signingCertificates = signingCertificates((value as Sequence)?.[0].value as Sequence, 2)
        break
      default:
    }
  })
  return signerInfo
}

function signingCertificates (sequence: ASN1[], version: 1 | 2): SigningCertificate[] {
  /*
      SigningCertificateV2 ::=  SEQUENCE {
          certs           SEQUENCE OF ESSCertIDv2,
          policies        SEQUENCE OF PolicyInformation OPTIONAL
      }
      ESSCertIDv2 ::=  SEQUENCE {
          hashAlgorithm   AlgorithmIdentifier DEFAULT {algorithm id-sha256},
            * V1 uses SHA-1 and does not include this field
          certHash        Hash,
          issuerSerial    IssuerSerial OPTIONAL
      }
      Hash ::= OCTET STRING
      IssuerSerial ::= SEQUENCE {
          issuer         GeneralNames,
          serialNumber   CertificateSerialNumber
      }
  */
  const v1HashDefault = '1.3.14.3.2.26' // SHA-1
  const v2HashDefault = '2.16.840.1.101.3.4.2.1' // SHA-256

  const parsedCerts = sequence.map<SigningCertificate>((certAsn1: ASN1) => {
    const defaultAlgOid = version === 1 ? v1HashDefault : v2HashDefault
    const hashAlgPresent = certAsn1.value[0].tag === Tag.SEQUENCE
    const hashAlgorithmOid = hashAlgPresent ? certAsn1.value[0].value as string : defaultAlgOid // default if not present
    const certHash = certAsn1.value[hashAlgPresent ? 1 : 0].value as Uint8Array
    const issuerSerial = certAsn1.value?.[hashAlgPresent ? 2 : 1]?.value as ASN1[]

    return {
      hashAlgorithm: getHashAlgorithmName(hashAlgorithmOid),
      certHash,
      issuerSerial: issuerSerial == null
        ? undefined
        : {
            issuer: issuerSerial[0].value.map((dn: ASN1) => distinguishedName((dn.value as Sequence)?.[0].value as Sequence)),
            serialNumber: issuerSerial[1].value as Uint8Array
          }
    }
  })

  return parsedCerts
}

function algorithmIdentifier (root: string): Template {
  return {
    name: `${root}.algorithm`,
    class: Class.UNIVERSAL,
    tag: [Tag.SET, Tag.SEQUENCE],
    value: [
      {
        name: `${root}.algorithm.oid`,
        class: Class.UNIVERSAL,
        tag: Tag.OID,
        capture: `${root}.algorithm.oid`
      },
      {
        name: `${root}.algorithm.parameters`,
        class: Class.UNIVERSAL,
        tag: [Tag.NULL, Tag.SEQUENCE]
      }
    ]
  }
}

function distinguishedName (fields: ASN1[]): DistinguishedName {
  const dn: DistinguishedName = { C: '', O: '', OU: '', CN: '', L: '', ST: '' }
  fields.forEach((field) => {
    const sequence = field.value[0] as ASN1
    const oid = sequence?.value[0]?.value as string
    const value = sequence?.value[1]?.value as string
    switch (oid) {
      case '2.5.4.3':
        dn.CN = value
        break
      case '2.5.4.6':
        dn.C = value
        break
      case '2.5.4.7':
        dn.L = value
        break
      case '2.5.4.8':
        dn.ST = value
        break
      case '2.5.4.11':
        dn.OU = value
        break
      case '2.5.4.10':
        dn.O = value
        break
    }
  })
  return dn
}

const signerInfoTemplate: Template = {
  name: 'signerInfo',
  class: Class.UNIVERSAL,
  tag: Tag.SEQUENCE,
  value: [
    {
      name: 'signerInfo.version',
      class: Class.UNIVERSAL,
      tag: Tag.INTEGER
    },
    {
      name: 'signerInfo.sid',
      class: Class.UNIVERSAL,
      tag: Tag.SEQUENCE
    },
    {
      name: 'signerInfo.digestAlgorithm',
      class: Class.UNIVERSAL,
      tag: Tag.SEQUENCE
    },
    {
      name: 'signerInfo.signedAttrs',
      class: Class.CONTEXT_SPECIFIC,
      tag: 0,
      optional: true,
      capture: 'signerInfo.signedAttrs'
    },
    {
      name: 'signerInfo.signatureAlgorithm',
      class: Class.UNIVERSAL,
      tag: Tag.SEQUENCE
    },
    {
      name: 'signerInfo.signature',
      class: Class.UNIVERSAL,
      tag: Tag.OCTETSTRING
    }
  ]
}

const signedDataTemplate: Template = {
  name: 'signedData',
  class: Class.UNIVERSAL,
  tag: Tag.SEQUENCE,
  value: [
    {
      name: 'signedData.version',
      class: Class.UNIVERSAL,
      tag: Tag.INTEGER
    },
    {
      name: 'AlgorithmIdentifier',
      class: Class.UNIVERSAL,
      tag: Tag.SET
    },
    {
      name: 'signedData.encapContentInfo',
      class: Class.UNIVERSAL,
      tag: Tag.SEQUENCE,
      value: [
        {
          name: 'signedData.encapContentInfo.eContent.type',
          class: Class.UNIVERSAL,
          tag: Tag.OID,
          capture: 'eContent.type'
        },
        {
          name: 'signedData.encapContentInfo.eContent',
          class: Class.CONTEXT_SPECIFIC,
          tag: 0,
          value: [
            {
              name: 'signedData.encapContentInfo.eContent.octetString',
              class: Class.UNIVERSAL,
              tag: Tag.OCTETSTRING,
              capture: 'eContent.octetString'
            }
          ]
        }
      ]
    },
    {
      name: 'signedData.certificates',
      class: Class.CONTEXT_SPECIFIC,
      tag: 0,
      optional: true,
      capture: 'certificates'
    },
    {
      name: 'signedData.crls',
      class: Class.CONTEXT_SPECIFIC,
      tag: 1,
      optional: true
    },
    {
      name: 'signedData.signerInfos',
      class: Class.UNIVERSAL,
      tag: Tag.SET,
      value: [
        signerInfoTemplate
      ]
    }
  ]
}

const tbsCertificateTemplate: Template = {
  name: 'Certificate',
  class: Class.UNIVERSAL,
  tag: Tag.SEQUENCE,
  value: [
    {
      name: 'Certificate.TBSCertificate',
      class: Class.UNIVERSAL,
      tag: Tag.SEQUENCE,
      value: [
        {
          name: 'Certificate.TBSCertificate.serialNumber',
          class: Class.UNIVERSAL,
          tag: Tag.INTEGER
        }
      ]
    },
    {
      name: 'Certificate.signatureAlgorithm',
      class: Class.UNIVERSAL,
      tag: Tag.SEQUENCE,
      value: [
        {
          name: 'Certificate.signatureAlgorithm.algorithm',
          class: Class.UNIVERSAL,
          tag: Tag.OID
        },
        {
          name: 'Certificate.signatureAlgorithm.signedData',
          class: Class.CONTEXT_SPECIFIC,
          tag: Tag.NONE,
          value: [
            signedDataTemplate
          ]
        }
      ]
    }
  ]
}

const tstInfoTemplate = {
  name: 'TSTInfo',
  class: Class.UNIVERSAL,
  tag: Tag.SEQUENCE,
  value: [
    {
      name: 'TSTInfo.version',
      class: Class.UNIVERSAL,
      tag: Tag.INTEGER,
      capture: 'version'
    },
    {
      name: 'TSTInfo.policy',
      class: Class.UNIVERSAL,
      tag: Tag.OID,
      capture: 'policy'
    },
    {
      name: 'TSTInfo.messageImprint',
      class: Class.UNIVERSAL,
      tag: Tag.SEQUENCE,
      value: [
        algorithmIdentifier('messageImprint'),
        {
          name: 'TSTInfo.messageImprint.hashValue',
          class: Class.UNIVERSAL,
          tag: Tag.OCTETSTRING,
          capture: 'messageImprint.hashValue'
        }
      ]
    },
    {
      name: 'TSTInfo.serialNumber',
      class: Class.UNIVERSAL,
      tag: Tag.INTEGER,
      capture: 'serialNumber'
    },
    {
      name: 'TSTInfo.genTime',
      class: Class.UNIVERSAL,
      tag: Tag.GENERALIZEDTIME,
      optional: true,
      capture: 'genTime'
    },
    {
      name: 'TSTInfo.accuracy',
      class: Class.UNIVERSAL,
      tag: Tag.SEQUENCE,
      optional: true,
      value: [
        {
          name: 'TSTInfo.accuracy.seconds',
          class: Class.UNIVERSAL,
          tag: Tag.INTEGER,
          optional: true,
          capture: 'accuracy.seconds'
        },
        {
          name: 'TSTInfo.accuracy.millis',
          class: Class.CONTEXT_SPECIFIC,
          tag: 0,
          optional: true,
          capture: 'accuracy.millis'
        },
        {
          name: 'TSTInfo.accuracy.micros',
          class: Class.CONTEXT_SPECIFIC,
          tag: 1,
          optional: true,
          capture: 'accuracy.micros'
        }
      ]
    },
    {
      name: 'TSTInfo.ordering',
      class: Class.UNIVERSAL,
      tag: Tag.BOOLEAN,
      optional: true,
      default: false,
      capture: 'ordering'
    },
    {
      name: 'TSTInfo.nonce',
      class: Class.UNIVERSAL,
      tag: Tag.INTEGER,
      optional: true,
      capture: 'nonce'
    },
    {
      name: 'TSTInfo.tsa',
      class: Class.CONTEXT_SPECIFIC,
      tag: 0,
      optional: true,
      value: [
        {
          name: 'TSTInfo.tsa.generalName',
          class: Class.CONTEXT_SPECIFIC,
          tag: 4,
          optional: true,
          value: [
            {
              name: 'TSTInfo.tsa.generalName.DN',
              class: Class.UNIVERSAL,
              tag: Tag.SEQUENCE,
              optional: true,
              capture: 'TSTInfo.tsa.generalName.DN'
            }
          ]
        }
      ]
    }
  ]
}

export { decode, type TSTInfo, type COSE_Sign1 }
