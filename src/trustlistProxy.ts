/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { MSG_ADD_TRUSTLIST, MSG_GET_TRUSTLIST_INFOS, MSG_REMOVE_TRUSTLIST } from './constants'
import { type TrustList, type TrustListInfo } from './trustlist'
export { type TrustListMatch, type TrustList, type TrustListInfo } from './trustlist'

export async function getTrustListInfos (): Promise<TrustListInfo[]> {
  return await chrome.runtime.sendMessage({ action: MSG_GET_TRUSTLIST_INFOS, data: undefined })
}

export async function addTrustList (tl: TrustList): Promise<TrustListInfo> {
  return await chrome.runtime.sendMessage({ action: MSG_ADD_TRUSTLIST, data: tl })
}

export async function removeTrustList (index: number): Promise<void> {
  await chrome.runtime.sendMessage({ action: MSG_REMOVE_TRUSTLIST, data: index })
}
