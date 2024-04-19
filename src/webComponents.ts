/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import browser from 'webextension-polyfill'
import { LitElement, html, css, type TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { type CertificateWithThumbprint, type C2paResult } from './c2pa'
import { type ManifestStore } from 'c2pa'
import { localDateTime } from './utils'

/*
  The C2pa library does not export all its types, se we extract them from
  the types that are exported
*/
type ValidationStatus = ManifestStore['validationStatus'][number]
type Signature = C2paResult['l2']['signature']
type Ingredient = ManifestStore['activeManifest']['ingredients'][number]
type Activity = Exclude<C2paResult['editsAndActivity'], null>[number]

const useSeparators = false

interface IconTextItem {
  icon: string | null
  text: string[]
}

const sharedStyles = css`
    :host {
        --background: #FFFFFF;
        --border-color: #DDDDDD;
        --background-highlight: #F4F4F4;
        --border-radius: 5px;
        --font-family: 'Roboto', Arial, Helvetica, sans-serif;
        --font-size: 14px;
        --font-bold: 700;
    }`

@customElement('c2pa-overlay')
export class C2paOverlay extends LitElement {
  static styles = [
    sharedStyles,
    css`
      * {
          font-family: var(--font-family);
          font-size: var(--font-size);
      }

      #container {
          background-color: var(--background);
          display: flex;
          flex-direction: column;
          gap: 25px;
          padding: 15px; 
          box-sizing: border-box;
      }

      .title {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 10px;
      }

      .thumbnail {
          max-width: 100%;
          max-height: 100%;
          object-fit: cover;
      }

      .thumbnailFrame {
          width: 60px;
          height: 60px;
          display: flex;
          justify-content: center;
          align-items: center;
          overflow: hidden;
          border-radius: var(--border-radius);
          background-color: var(--border-color);
      }
      
      .verifiedIcon {
          width: 1.2em;
          vertical-align:text-bottom;
      }

      #validationErrors {
          background: rgb(174, 0, 0);
          border-radius: var(--border-radius);
          color: white;
          padding: .5em;
      }

      .validationErrorEntry {
          color: white;
          margin: 0;
          background: none;
      }

      #divSigned {
        line-height: 1.5;
        /* margin-bottom: 5px; */
      }

      #divTrust {
        line-height: 1.2;
      }

      #inspectionLink {

      }

      .bold {
        font-weight: var(--font-bold);
      }

      .clickable {
        cursor: pointer;
      }

      #untrusted {
        border-radius: var(--border-radius);
        background-color: var(--background-highlight);
        display: grid;
        grid-template-columns: auto 1fr;
        align-items: center;
        padding: 12px 5px 12px 5px;
      }

      #untrustedIcon {
        width: 30px;
        padding: 5px;
      }

      #untrustedText {
        text-align: center;
        padding-right: 15px;
      }

      #errors {
        border-radius: var(--border-radius);
        background-color: var(--background-highlight);
        padding: 12px 5px 12px 5px;
      }

      #errorHeader {
        display: grid;
        grid-template-columns: auto 1fr;
        align-items: center;
        padding-right: 15px;
      }

      #errorIcon {
        width: 20px;
        height: 20px;
        padding: 5px;
      }

      #errorText {
        text-align: center;
        padding: 0px;
      }

      #errorList {
        text-align: left;
      }

      .errorEntry {
      }

      ul {
        padding-left: 25px;
      }

      li {
        margin-bottom: 5px;
      }

      .separator {
        border-bottom: 1px solid var(--border-color);
        margin: 5px 15px 5px 15px
        border-color: #EEE
      }

      .button {
        display: inline-block;
        padding: 6px;
        margin: 0px 15px;
        font-size: 12px;
        font-family: Arial, sans-serif;
        color: #777777;
        background-color: #fff;
        border: 2px solid #777777;
        border-radius: 20px;
        text-align: center;
        cursor: pointer;
        text-decoration: none;
      }
    
      .button:hover {
        background-color: #f2f2f2;
      }

      .additional-info {
        overflow: hidden;
        max-height: 0; 
        transition: max-height 0.3s ease-in-out;
        display: flex;        
        flex-direction: column;
        gap: 15px;
        justify-content: space-between;
      }

      .link-style {
        color: inherit;
        text-decoration: underline;
      }
      
      /* Ensure the color doesn't change on hover, focus, or after being visited */
      .link-style:hover,
      .link-style:focus,
      .link-style:visited {
        color: inherit;
      }

      #mciLink {
        cursor: pointer;
      }

      .image-container {
        position: relative;
        display: inline-block;
      }
      
      .popover-content {
          display: none;
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 100;
          padding: 10px;
          background-color: white;
          border: 1px solid #ccc;
          border-radius: 5px;
          box-shadow: 0px 2px 5px rgba(0,0,0,0.2);
      }

      .image-container:hover .popover-content {
          display: block;
      }

      #verified-info {
        font-size: 11px;
        line-height: 15px;
        max-width: 260px;
      }

      #verified-info > span {
        font-weight: bold;
        font-size: 11px;
      }

      #verified-info > div {
        font-size: 11px;
        margin-top: 0;
        margin-bottom: 0;
        padding: 0;
        padding-left: 10px;
      }
  `]

  private _c2paResult: C2paResult | undefined

  // Internal state for the blob URL
  private thumbprintUrl?: string

  private signer?: string

  private trustList?: string

  private status?: { errors: boolean, trusted: boolean }

  @property({ type: Boolean })
    additionalInfoCollapsed = true

  toggleAdditionalInfo = (): void => {
    this.additionalInfoCollapsed = !this.additionalInfoCollapsed

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const additionalInfoEl = this.shadowRoot!.querySelector('.additional-info')!
    const div: HTMLDivElement = additionalInfoEl as HTMLDivElement
    if (this.additionalInfoCollapsed) {
      C2paCollapsible.close()
      div.style.maxHeight = div.scrollHeight + 'px'
      void div.offsetHeight
      div.style.maxHeight = '0'
    } else {
      div.style.maxHeight = 'none'
      const height = div.scrollHeight + 'px'
      div.style.maxHeight = '0'
      void div.offsetHeight
      div.style.maxHeight = height
      const onTransitionEnd = (): void => {
        div.style.maxHeight = 'none' // Allow div to grow further as needed
        div.removeEventListener('transitionend', onTransitionEnd) // Clean up the event listener
      }

      div.addEventListener('transitionend', onTransitionEnd)
    }
  }

  @property({ type: Object })
  get c2paResult (): C2paResult | undefined {
    return this._c2paResult
  }

  set c2paResult (newValue: C2paResult | undefined) {
    if (newValue === this._c2paResult || newValue == null) {
      return
    }

    const oldValue = this._c2paResult
    this._c2paResult = newValue
    this.status = this.setStatus(newValue)
    this.requestUpdate('c2paResult', oldValue)

    if ((newValue?.source?.thumbnail.blob) != null) {
      if (this.thumbprintUrl != null) {
        URL.revokeObjectURL(this.thumbprintUrl)
      }
      const blob = newValue?.source?.thumbnail.blob
      this.thumbprintUrl = URL.createObjectURL(blob)
    } else {
      this.thumbprintUrl = ''
    }

    this.signer = newValue?.manifestStore?.activeManifest.signatureInfo?.issuer ?? 'unknown entity'

    this.trustList = newValue?.trustList?.tlInfo.name ?? 'unknown'
  }

  private setStatus (c2paResult: C2paResult): { errors: boolean, trusted: boolean } {
    const errors = (c2paResult.manifestStore?.validationStatus ?? []).length > 0
    const trusted = c2paResult.trustList != null
    return { errors, trusted }
  }

  private validationSection (validation: ValidationStatus[] | undefined): TemplateResult[] {
    const isTrusted = this.status?.trusted === true
    const areErrors = this.status?.errors === true

    if (isTrusted && !areErrors) {
      return []
    }

    const result = []

    const errors = (validation ?? []).map((v) => html`<li class="errorEntry">${v.explanation}</li>`)
    if (areErrors) {
      result.push(html`
        <div id="errors">
          <div id="errorHeader">
            <img id="errorIcon" src="icons/x.svg"/>
            <div id="errorText"><span class="bold">Validation errors</span></div>
          </div>
          <div id="errorList">
            <ul> ${errors}</ul>
          </div>
        </div>`
      )
    }

    if (!isTrusted) {
      result.push(html`
      <div id="untrusted">
        <img id="untrustedIcon" src="icons/!.svg">
        <div id="untrustedText"><span class="bold">${this.signer}</span> is unknown</div>
      </div>`
      )
    }

    return result
  }

  private readonly handleClick = (): void => {
    console.debug('sendMessage:', {
      action: 'inspectUrl',
      data: this.c2paResult?.url
    })
    void browser.runtime.sendMessage({
      action: 'inspectUrl',
      data: this.c2paResult?.url
    })
  }

  render (): TemplateResult {
    const trusted = this.status?.trusted === true
    const manifestMap = this.c2paResult?.manifestStore?.manifests
    const manifestCount = manifestMap === undefined ? 0 : Object.keys(manifestMap).length
    let mediaType = (this.c2paResult?.source?.type ?? 'unknown/unknown').split('/')[0]
    mediaType = mediaType.charAt(0).toUpperCase() + mediaType.slice(1)
    const signingCert = this.c2paResult?.certChain?.[0]
    const parsedCert = signingCert == null ? undefined : parseCertificate(signingCert)
    const trustlist = this.c2paResult?.trustList
    const trustlistLogo = trustlist?.tlInfo.logo_icon ? trustlist?.tlInfo.logo_icon : 'icons/verified.svg'
    return html`
    <div id='container'>
      <div class='title'>
          <div class="thumbnailFrame clickable">
              <img class="thumbnail" id="thumbnail" src="${this.thumbprintUrl ?? chrome.runtime.getURL('icons/movie.svg')}">
          </div>
          <div>
              <div id="divSigned">${mediaType} ${manifestCount > 1 ? 'last ' : ''}signed by ${trusted ? '' : html`<span class="bold">unknown</span> entity `}<span class="bold">${this.signer}</span> 
                  <div class="image-container">
                      <img class="verifiedIcon clickable" src="icons/verified.svg" alt="Verified Icon">
                      <div class="popover-content">
                        ${signingCert === undefined
                        ? '<p>No certificate found<p>'
                        : html`<div id="verified-info">
                                <span>Issuer</span>
                                  <div>${parsedCert?.issuer.cn}</div>
                                  <div>${parsedCert?.issuer.o}</div>
                                  ${parsedCert?.issuer.ou === 'unknown' ? '' : html`<div>${parsedCert?.issuer.ou}</div>`}
                                <span>Subject</span>
                                  <div>${parsedCert?.subject.cn}</div>
                                  <div>${parsedCert?.subject.o}</div>
                                  ${parsedCert?.subject.ou === 'unknown' ? '' : html`<div>${parsedCert?.subject.ou}</div>`}
                                <span>Valid</span>
                                  <div>${parsedCert?.validFrom} - ${parsedCert?.validTo}</div>
                                <span>Thumbprint</span>
                                  <div style="font-family: 'Roboto Mono', monospace;">${signingCert.sha256Thumbprint.substring(0, 32)}</div>
                                  <div style="font-family: 'Roboto Mono', monospace;">${signingCert.sha256Thumbprint.substring(32)}</div>
                        </div>
                        `}                      
                      </div>
                  </div>
              </div>
              ${!trusted
              ? ''
              : html`<div id="divTrust">Part of trust list: <span class="bold">${this.trustList}</span>
                  <div class="image-container">
                      <img class="verifiedIcon clickable" src="${trustlistLogo}" alt="Verified Icon">
                      <div class="popover-content">
                          <div id="verified-info">
                              <span>Trust list description</span>
                              <div>${trustlist?.tlInfo.description}</div>
                              <span>Signer</span>
                              <div>${trustlist?.entity.display_name}</div>
                          </div>
                      </div>
                  </div>
              </div>`}
          </div>
      </div>
      ${this.validationSection(this._c2paResult?.manifestStore?.validationStatus)}
      <div id="inspectionLink">
          For more details, inspect the image in the <span id="mciLink" @click="${this.handleClick}"><u>Microsoft Content Integrity</u></span> page.
      </div>
      <!-- <div class="additional-info" style="display: ${this.additionalInfoCollapsed ? 'none' : 'flex'};"> -->
      <div class="additional-info">
        ${useSeparators ? html`<div class="separator"></div>` : ''}
        <c2pa-collapsible>
          <span slot="header">Edits and Activity</span>
          <div slot="content"><c2pa-grid-display .items="${activityItems(this.c2paResult?.editsAndActivity ?? undefined)}"></c2pa-grid-display></div>        
        </c2pa-collapsible>
        ${useSeparators ? html`<div class="separator"></div>` : ''}
        <c2pa-collapsible>
          <span slot="header">Ingredients</span>
          <div slot="content"><c2pa-grid-display .items="${ingredientItems(this.c2paResult?.manifestStore?.activeManifest.ingredients)}"></c2pa-grid-display></div>
        </c2pa-collapsible>
        ${useSeparators ? html`<div class="separator"></div>` : ''}
        <c2pa-collapsible>
          <span slot="header">Signature</span>
          <div slot="content"><c2pa-grid-display .items="${signatureItems(this.c2paResult?.l2.signature ?? null)}"></c2pa-grid-display></div>
        </c2pa-collapsible>
        ${useSeparators ? html`<div class="separator"></div>` : ''}
        <c2pa-collapsible>
          <span slot="header">Certificates</span>
          <div slot="content"><c2pa-grid-display .items="${certificateItems(this.c2paResult?.certChain ?? [])}"></c2pa-grid-display></div>
        </c2pa-collapsible>
      </div>
      <button class="button" @click="${this.toggleAdditionalInfo}">
        ${this.additionalInfoCollapsed ? 'View more' : 'View less'}
      </button>
    
    </div>
    `
  }

  public close (): void {
    if (!this.additionalInfoCollapsed) {
      this.toggleAdditionalInfo()
    }
  }
}

@customElement('c2pa-collapsible')
export class C2paCollapsible extends LitElement {
  @property({ type: Boolean }) open = false

  static openCollapsible: C2paCollapsible | null = null

  static styles = [
    sharedStyles,
    css`
    .collapsible-container {

    }
    .collapsible-header {
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 700;
      font-size: 16px;
    }
    .collapsible-content {
      overflow: hidden;
      max-height: 0;
      transition: max-height 0.3s ease;
      padding: 0 0 0 20px;
    }
    .collapsible-content.open  {
      max-height: 400px;
    }
    .icon {
      transition: transform 0.3s ease;
      width: 12px; 
      height: 12px;
      transform-origin: center;
      display: inline-block;
      transform: rotate(270deg);
    }
    .rotated {
      transform: rotate(180deg);
    }
    
  `]

  static close (): void {
    if (C2paCollapsible.openCollapsible != null) {
      C2paCollapsible.openCollapsible.toggle()
    }
  }

  toggle = (): void => {
    if (C2paCollapsible.openCollapsible != null && C2paCollapsible.openCollapsible !== this) {
      C2paCollapsible.openCollapsible.toggle()
    }
    this.open = !this.open
    C2paCollapsible.openCollapsible = this.open ? this : null
  }

  render (): TemplateResult {
    return html`
      <div class="collapsible-container">
        <div class="collapsible-header" @click="${this.toggle}">
          <span class="section-title"><slot name="header">Default Header</slot></span>
          ${this.open ? this.renderIcon('open') : this.renderIcon('closed')}
        </div>
        <div class="collapsible-content ${this.open ? 'open' : ''}">
          <slot name="content">Default Content</slot>
        </div>
      </div>
    `
  }

  renderIcon (state: 'open' | 'closed'): TemplateResult {
    console.debug('renderIcon', state)
    const iconClass = state === 'open' ? 'icon rotated' : 'icon'
    return html`<svg class="${iconClass}" viewBox="0 0 512 512">
      <g id="Page-1" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
          <g id="drop" fill="#000000" transform="translate(32.000000, 42.666667)">
              <path d="M246.312928,5.62892705 C252.927596,9.40873724 258.409564,14.8907053 262.189374,21.5053731 L444.667042,340.84129 C456.358134,361.300701 449.250007,387.363834 428.790595,399.054926 C422.34376,402.738832 415.04715,404.676552 407.622001,404.676552 L42.6666667,404.676552 C19.1025173,404.676552 7.10542736e-15,385.574034 7.10542736e-15,362.009885 C7.10542736e-15,354.584736 1.93772021,347.288125 5.62162594,340.84129 L188.099293,21.5053731 C199.790385,1.04596203 225.853517,-6.06216498 246.312928,5.62892705 Z" id="Combined-Shape"></path>
          </g>
      </g>
    </svg>`
  }
}

@customElement('c2pa-grid-display')
export class C2paGridDisplay extends LitElement {
  @property({ type: Array }) items: IconTextItem[] = []

  static styles = [
    sharedStyles,
    css`
      .grid-container {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 8px 20px;
        align-items: center;
        margin: 10px 0
      }
      .icon {
        width: 20px;
        height: 20px; 
        grid-row: span 1;
        color: green;
      }
      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .text-block {
        display: flex;
        flex-direction: column; 
        justify-content: center;
      }
      .text-line {
        font-size: 12px;
        margin-bottom: 0px;
      }
      .text-line:last-child {
        margin-bottom: 0;
      }
    `]

  render (): TemplateResult {
    return html`
      <div class="grid-container">
        ${this.items.map((item, index) => html`
          <!-- Icon -->
          <div class="icon" style="grid-row: ${index + 1};">
            ${item.icon != null ? html`<img src="${item.icon}" alt="Icon">` : ''}
          </div>
          <!-- Text Block -->
          <div class="text-block" style="grid-row: ${index + 1};">
            ${item.text.map(line => html`<div class="text-line">${line}</div>`)}
          </div>
        `)}
      </div>
    `
  }
}

const unknownSvg = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20height%3D%2218%22%20viewBox%3D%220%200%2018%2018%22%20width%3D%2218%22%3E%20%20%3Cdefs%3E%20%20%20%20%3Cstyle%3E%20%20%20%20%20%20.fill%20%7B%20%20%20%20%20%20%20%20fill%3A%20%236E6E6E%3B%20%20%20%20%20%20%7D%20%20%20%20%3C%2Fstyle%3E%20%20%3C%2Fdefs%3E%20%20%3Ctitle%3ES%20AlertCircle%2018%20N%3C%2Ftitle%3E%20%20%3Crect%20id%3D%22Canvas%22%20fill%3D%22%23ff13dc%22%20opacity%3D%220%22%20width%3D%2218%22%20height%3D%2218%22%20%2F%3E%3Cpath%20class%3D%22fill%22%20d%3D%22M7.84555%2C12.88618a1.13418%2C1.13418%2C0%2C0%2C1%2C1.1161-1.15195q.042-.00064.08391.00178a1.116%2C1.116%2C0%2C0%2C1%2C1.2%2C1.15017%2C1.09065%2C1.09065%2C0%2C0%2C1-1.2%2C1.11661%2C1.0908%2C1.0908%2C0%2C0%2C1-1.2-1.11661ZM10.0625%2C4.39771a.20792.20792%2C0%2C0%2C1%2C.09966.183V5.62212c0%2C1.40034-.28322%2C3.98034-.33305%2C4.48067%2C0%2C.04984-.01678.09967-.11695.09967H8.379a.11069.11069%2C0%2C0%2C1-.11695-.09967c-.03305-.46678-.3-3.0305-.3-4.43084V4.6306a.1773.1773%2C0%2C0%2C1%2C.08339-.18306%2C2.88262%2C2.88262%2C0%2C0%2C1%2C1.00017-.20033A3.27435%2C3.27435%2C0%2C0%2C1%2C10.0625%2C4.39771ZM17.50005%2C9A8.50005%2C8.50005%2C0%2C1%2C1%2C9%2C.5H9A8.50008%2C8.50008%2C0%2C0%2C1%2C17.50005%2C9ZM15.67484%2C9A6.67485%2C6.67485%2C0%2C1%2C0%2C9%2C15.6748H9A6.67479%2C6.67479%2C0%2C0%2C0%2C15.67484%2C9Z%22%20%2F%3E%3C%2Fsvg%3E'

const signSvg = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20height%3D%2218%22%20viewBox%3D%220%200%2018%2018%22%20width%3D%2218%22%3E%20%20%3Cdefs%3E%20%20%20%20%3Cstyle%3E%20%20%20%20%20%20.fill%20%7B%20%20%20%20%20%20%20%20fill%3A%20%236E6E6E%3B%20%20%20%20%20%20%7D%20%20%20%20%3C%2Fstyle%3E%20%20%3C%2Fdefs%3E%20%20%3Ctitle%3ES%20Draw%2018%20N%3C%2Ftitle%3E%20%20%3Crect%20id%3D%22Canvas%22%20fill%3D%22%23ff13dc%22%20opacity%3D%220%22%20width%3D%2218%22%20height%3D%2218%22%20%2F%3E%3Cpath%20class%3D%22fill%22%20d%3D%22M10.227%2C4%2C2.542%2C11.686a.496.496%2C0%2C0%2C0-.1255.2105L1.0275%2C16.55c-.057.188.2295.425.3915.425a.15587.15587%2C0%2C0%2C0%2C.031-.003c.138-.032%2C3.9335-1.172%2C4.6555-1.389a.492.492%2C0%2C0%2C0%2C.2075-.125L14%2C7.772ZM5.7%2C14.658c-1.0805.3245-2.431.7325-3.3645%2C1.011L3.34%2C12.304Z%22%20%2F%3E%20%20%3Cpath%20class%3D%22fill%22%20d%3D%22M16.7835%2C4.1%2C13.9%2C1.216a.60751.60751%2C0%2C0%2C0-.433-.1765H13.45a.686.686%2C0%2C0%2C0-.4635.2035l-2.05%2C2.05L14.708%2C7.0645l2.05-2.05a.686.686%2C0%2C0%2C0%2C.2-.4415A.612.612%2C0%2C0%2C0%2C16.7835%2C4.1Z%22%20%2F%3E%3C%2Fsvg%3E'

function certificateItems (certificates: CertificateWithThumbprint[]): IconTextItem[] {
  return certificates.map((cert) => {
    const parsedCert = parseCertificate(cert)
    return {
      icon: 'icons/seal.svg',
      text: [parsedCert.issuer.cn, parsedCert.issuer.o, `${parsedCert.validFrom} - ${parsedCert.validTo}`]
    }
  })
}

interface CertificateProperties {
  issuer: { cn: string, o: string, ou: string, c: string, l: string, st: string }
  subject: { cn: string, o: string, ou: string, c: string, l: string, st: string }
  validFrom: string
  validTo: string
}

/*
  The x509 lib uses getters to return cert properties that are stripped during serialization.
  This function extracts the properties that are needed for display
*/
function parseCertificate (cert: CertificateWithThumbprint): CertificateProperties {
  const getShortName = (cert: CertificateWithThumbprint, shortName: string): string => {
    const attr = cert.subject.attributes.find((attr) => attr.shortName === shortName)
    return attr?.value ?? 'unknown'
  }
  return {
    issuer: {
      cn: getShortName(cert, 'CN'),
      o: getShortName(cert, 'O'),
      ou: getShortName(cert, 'OU'),
      c: getShortName(cert, 'C'),
      l: getShortName(cert, 'L'),
      st: getShortName(cert, 'ST')
    },
    subject: {
      cn: getShortName(cert, 'CN'),
      o: getShortName(cert, 'O'),
      ou: getShortName(cert, 'OU'),
      c: getShortName(cert, 'C'),
      l: getShortName(cert, 'L'),
      st: getShortName(cert, 'ST')
    },
    validFrom: localDateTime(cert.validFrom.toString()),
    validTo: localDateTime(cert.validTo.toString())
  }
}

function signatureItems (signature: Signature): IconTextItem[] {
  if (signature == null) {
    return [{
      icon: unknownSvg,
      text: ['None']
    }]
  }
  const dateStr = signature.isoDateString
  return [{
    icon: signSvg,
    text: [
      signature.issuer ?? 'unknown',
      dateStr != null ? localDateTime(dateStr) : 'unknown'
    ]
  }]
}

function ingredientItems (ingredients: Ingredient[] | undefined): IconTextItem[] {
  if (ingredients == null || ingredients.length === 0) {
    return [{
      icon: unknownSvg,
      text: ['None']
    }]
  }
  return ingredients.map((ingredient) => {
    return {
      icon: ingredient.thumbnail?.blob != null ? URL.createObjectURL(ingredient.thumbnail.blob) : null,
      text: [
        ingredient.title,
        ingredient.format
      ]
    }
  })
}

function activityItems (activities: Activity[] | undefined): IconTextItem[] {
  if (activities == null || activities.length === 0) {
    return [{
      icon: unknownSvg,
      text: ['None']
    }]
  }
  return activities.map((activity) => {
    return {
      icon: activity.icon,
      text: [activity.description]
    }
  })
}
