import browser from 'webextension-polyfill'
import 'dotenv/config'

export const DEBUG = process.env.NODE_ENV?.toUpperCase() !== 'PRODUCTION'

export function bytesToHex (uint8Array: Uint8Array): string {
  return Array.from(uint8Array).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function formatUUID (uuid: string): string {
  return `${uuid.substring(0, 8)}-${uuid.substring(8, 12)}-${uuid.substring(12, 16)}-${uuid.substring(16, 20)}-${uuid.substring(20)}`
}

export async function blobToBase64 (blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => { resolve(reader.result as string) }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export function arrayBufferToBase64 (buffer: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return window.btoa(binary)
}

export function isObject (value: unknown): boolean {
  return (typeof value === 'object' || typeof value === 'function') && value !== null
}

export function isKeyedObject (value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function base64ToBlob (base64: string): Promise<Blob> {
  return await fetch(`data:;base64,${base64}`).then(async res => await res.blob())
}

export function base64ToArrayBuffer (base64: string): ArrayBuffer {
  const binaryString = window.atob(base64)
  const len = binaryString.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer
}

export function decimalStringToHex (decimalString: string): string {
  // Use BigInt to handle very large numbers
  const bigIntValue = BigInt(decimalString)
  // Convert to hexadecimal
  let hexString = bigIntValue.toString(16)

  // Optional: Ensure the hexadecimal string is prefixed with "0x"
  hexString = '0x' + hexString

  return hexString
}

export function localDateTime (isoDateString: string): string {
  const date = new Date(isoDateString)

  // Use Intl.DateTimeFormat to format the date
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    timeZoneName: 'short',
    hour12: true
  }
  const formattedDate = new Intl.DateTimeFormat('en-US', options).format(date)
  return formattedDate
}

const DEFAULT_MESSAGE_TIMEOUT = 5000 /* 5 sec */

export async function sendMessageWithTimeout<T> (message: unknown, timeout: number = DEFAULT_MESSAGE_TIMEOUT): Promise<T> {
  const messagePromise = browser.runtime.sendMessage(message)
  const timeoutPromise = new Promise((resolve, reject) => {
    const id = setTimeout(() => {
      clearTimeout(id)
      reject(new Error('Message response timeout'))
    }, timeout)
  })
  return await Promise.race([messagePromise, timeoutPromise])
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function logDebug (message?: any, ...optionalParams: any[]): void {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  console.debug(`%c${message.toString()}`, 'color: #2784BC;', ...optionalParams)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function logWarn (message?: any, ...optionalParams: any[]): void {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  console.warn(`%c${message.toString()}`, 'color: #FFAA47;', ...optionalParams)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function logError (message?: any, ...optionalParams: any[]): void {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  console.error(`%c${message.toString()}`, 'color: #B8281C;', ...optionalParams)
}
