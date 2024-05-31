/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { MSG_DISPLAY_C2PA_OVERLAY, MSG_FRAME_CLICK, MSG_REMOTE_INSPECT_URL } from './constants'
import { C2paOverlay } from './overlay'

export type MediaElement = (HTMLImageElement | HTMLVideoElement | HTMLAudioElement)

console.debug('%cCONTENT:', 'color: cornsilk', window.location.href)

/*
  This is the overlay that will be displayed when a media element is validated.
*/
const overlay = C2paOverlay.overlay

/*
  The https://contentintegrity.microsoft.com/check page does not support validating a url from a query parameter.
  So we have the extension detect when the https://contentintegrity.microsoft.com/check is active and paste the url into the input field.
  This assumes that the page structure does not change.
*/
function pasteUrlIntoInput (url: string): void {
  // are we already on the validation where we have to click the 'Check another file' button?
  const checkAnotherFileButton = Array.from(document.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Check another file')
  if (checkAnotherFileButton != null) {
    checkAnotherFileButton.click()
  }

  // If the above button was clicked, we need to queue the URL to be pasted after the page has transitioned
  setTimeout(() => {
    const textInput: HTMLInputElement | null = document.querySelector('input[type="text"]')
    if (textInput == null) {
      return
    }
    textInput.value = decodeURIComponent(url)
    // send input event or page will believe the input is still empty
    textInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }))
  }, 0)
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  /*
    Populate the IFrame with C2PA validation results for a media element.
  */
  if (message.action === MSG_DISPLAY_C2PA_OVERLAY) {
    overlay.show(message.data.position.x as number, message.data.position.y as number)
  }

  if (message.action === MSG_REMOTE_INSPECT_URL) {
    const url = message.data as string
    pasteUrlIntoInput(url)
  }

  if (message.action === MSG_FRAME_CLICK) {
    overlay.hide()
  }
})
