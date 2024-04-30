/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { type C2paError, type C2paResult } from './c2pa'
import { MSG_C2PA_VALIDATE_URL } from './constants'

export async function validateUrl (url: string): Promise<C2paResult | C2paError> {
  return await chrome.runtime.sendMessage({ action: MSG_C2PA_VALIDATE_URL, data: url })
}
