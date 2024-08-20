/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { LitElement, html, css, type TemplateResult } from 'lit'
import { type MediaRecordInfo } from '../mediaRecord'
import { property } from 'lit/decorators.js'
import { MSG_INSPECT_MEDIA_RECORD } from '../constants'

export class MediaInfo extends LitElement {
  static styles = css`
    :host {
      display: block;
      --slider-height: 24px;
      --slider-width: 42px;
      --slider-ball-size: 20px;
      --font-size: 16px;
    }

        .container {
            display: flex;
            align-items: center;
            gap: 10px;
            /* Space between the image and the table */
            margin-bottom: 5px;
        }

        .image-container {
            width: 50px;
            height: 50px;
            background-color: #DDDDDD;
            border-radius: 5px;
            display: flex;
            justify-content: center;
            align-items: center;
            overflow: hidden;
        }

        .table {
            display: grid;
            grid-template-columns: repeat(5, auto);
            /* Four columns */
            grid-template-rows: repeat(1, auto);
            /* Two rows */
            gap: 5px;
            /* Space between the cells */
        }

        .cell {
            font-family: 'Roboto Mono', monospace;
            padding: 5px;
        }

        .thumbnail {
            max-width: 100%;
            max-height: 100%;
            object-fit: cover;
        }

        .thumbnail-placeholder {  
            width: 40px;
        }

        .icon {
            max-width: 20px;
            max-height: 20px;
        }

        .placeholder-image {
          margin: 5px;
        }


  `
  // MediaRecordInfo

  @property({ type: Object })
    mediaRecordInfo!: MediaRecordInfo

  private readonly icon_eye_light = chrome.runtime.getURL('icons/eye.light.svg')
  private readonly icon_eye_dark = chrome.runtime.getURL('icons/eye.dark.svg')
  private readonly icon_screen_light = chrome.runtime.getURL('icons/screen.light.svg')
  private readonly icon_screen_dark = chrome.runtime.getURL('icons/screen.dark.svg')
  private readonly icon_camera = chrome.runtime.getURL('icons/camera.svg')
  private readonly icon_audio = chrome.runtime.getURL('icons/audio.svg')
  private readonly icon_video = chrome.runtime.getURL('icons/video.svg')

  constructor (mediaRecordInfo: MediaRecordInfo) {
    super()
    this.mediaRecordInfo = mediaRecordInfo
    console.debug('MediaInfo created')
  }

  handleContainerClick (): void {
    console.log('Container clicked', this.mediaRecordInfo)
    // sendToContent({ action: MSG_INSPECT_MEDIA_RECORD, data: { frame: this.mediaRecordInfo.frame.frame, id: this.mediaRecordInfo.id } })
    void chrome.tabs.sendMessage(this.mediaRecordInfo.frame.tab, { action: MSG_INSPECT_MEDIA_RECORD, data: { frame: this.mediaRecordInfo.frame.frame, id: this.mediaRecordInfo.id } })
  }

  render (): TemplateResult {
    const mri = this.mediaRecordInfo

    const type = mri.state.type === 'image' ? this.icon_camera : mri.state.type === 'video' ? this.icon_video : mri.state.type === 'audio' ? this.icon_audio : ''
    const thumbnail = (mri.src === '' || mri.state.type !== 'image') ? type : mri.src

    return html`
    <div class="container" @click="${this.handleContainerClick.bind(this)}">
        <div class="image-container">
            <img class="thumbnail${mri.state.type !== 'image' ? ' thumbnail-placeholder' : ''}" src="${thumbnail}" alt="Image" title="${mri.src !== '' ? mri.src : '<none>'}">
        </div>
        <div class="table">
            <div class="cell"><img class="icon" src="${type}" /></div>
            <div class="cell"><img class="icon" src="${mri.state.viewport ? this.icon_screen_dark : this.icon_screen_light}" /></div>
            <div class="cell"><img class="icon" src="${mri.state.visible ? this.icon_eye_dark : this.icon_eye_light}" /></div>
            <div class="cell">x:${mri.rect.x | 0} y:${mri.rect.y | 0}</div>
            <div class="cell">h:${mri.rect.height | 0} w:${mri.rect.width | 0}</div>
        </div>
    </div>
    `
  }
}

// function sendToContent (message: unknown): void {
//   void chrome.tabs.sendMessage(_id. { action: MSG_FORWARD_TO_CONTENT, data: message })
// }

customElements.define('media-info', MediaInfo)
