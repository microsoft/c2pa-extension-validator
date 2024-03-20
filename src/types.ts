/*
*  Copyright (c) Microsoft Corporation.
*  Licensed under the MIT license.
*/

import { type Certificate } from '@fidm/x509'
import { type C2paReadResult } from 'c2pa'

// put global types here

export interface MESSAGE_PAYLOAD {
  action: string
  data: unknown
  frame?: string
}

export interface c2paResultWithChain extends C2paReadResult {
  certChain: Certificate[] | null
  tabId?: number
}
