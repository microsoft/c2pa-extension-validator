/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { type C2paError, type C2paResult } from './c2pa'
import { MSG_C2PA_VALIDATE_URL, MSG_C2PA_VALIDATE_BYTES } from './constants'

export async function validateUrl (url: string): Promise<C2paResult | C2paError> {
  return await chrome.runtime.sendMessage({ action: MSG_C2PA_VALIDATE_URL, data: url })
}

export async function validateBytes (bytes: ArrayBuffer): Promise<C2paResult | C2paError> {
  return await chrome.runtime.sendMessage({ action: MSG_C2PA_VALIDATE_BYTES, data: bytes })
}
