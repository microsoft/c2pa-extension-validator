/*
*  Copyright (c) Microsoft Corporation.
*  Licensed under the MIT license.
*/
import Browser from 'webextension-polyfill'
import { type C2paReadResult } from 'c2pa'
import { type Certificate } from '@fidm/x509'
import { MESSAGE_C2PA_INSPECT_URL } from './constants.js'
import { icon } from './icon.js'
import { C2PADialog } from './c2paStatus.js'
import { deserialize } from './serialize.js'

void (async () => {
  const images = document.images
  for (const img of Array.from(images)) {
    // const { message } = await createFrame(img)
    let c2paImage = await c2paValidateImage(img.src)
    c2paImage = deserialize(c2paImage as unknown as Record<string, unknown>) as c2paResultWithChain
    const c2paDialog = await C2PADialog.create(c2paImage)
    if (c2paImage !== null) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      icon(img, img.src, (c2paImage.manifestStore!).validationStatus.length === 0, () => {
        c2paDialog.position(img)
        c2paDialog.show()
      })
    }
  }

  const mp4Videos = document.querySelectorAll('[src$=".mp4"]') as unknown as Array<{ src: string }>
  for (const video of Array.from(mp4Videos)) {
    let c2paVideo = await c2paValidateImage(video.src)
    c2paVideo = deserialize(c2paVideo as unknown as Record<string, unknown>) as c2paResultWithChain
    const c2paDialog = await C2PADialog.create(c2paVideo)
    if (c2paVideo !== null) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      icon((video as HTMLImageElement).parentElement!, video.src, (c2paVideo.manifestStore!).validationStatus.length === 0, () => {
        c2paDialog.position(video as HTMLImageElement)
        c2paDialog.show()
      })
    }
  }
})()

interface c2paResultWithChain extends C2paReadResult {
  certChain: Certificate[] | null
  tabId: number
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  console.log('Message received in content script:', message)
  sendResponse({ farewell: 'goodbye from content script' })
  return true // For asynchronous response
})

async function c2paValidateImage (url: string): Promise<c2paResultWithChain> {
  return await Browser.runtime.sendMessage({ action: MESSAGE_C2PA_INSPECT_URL, data: url })
    .then((result) => {
      if (result != null) {
        return result
      } else {
        console.log('Null result')
      }
    })
    .catch((error) => {
      console.error('Error sending message:', error)
    })
}
