import { LitElement, html, css, type TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { type CertificateWithThumbprint, type C2paResult } from './c2pa'
import { type ManifestStore } from 'c2pa'
import { localDateTime } from './utils'

type ValidationStatus = ManifestStore['validationStatus'][number]

const sharedStyles = css`
    :host {
        --background: #FFFFFF;
        --border-color: #DDDDDD;
        --background-highlight: #F4F4F4;
        --border-radius: 5px;
        --font-family: 'Roboto', Arial, Helvetica, sans-serif;
        --font-size: 14px;
        --font-bold: 700;
    }
`

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
          gap: 4px;
          padding: 10px;
          border: 1px solid var(--border-color);
          border-radius: var(--border-radius);
          box-shadow: 0px 0px 12px 0px rgba(0, 0, 0, 0.2);
          margin: 10px;
      }

      .title {
          display: grid;
          grid-template-columns: auto 1fr;
          /* align-items: center; */
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
      
      .certIcon {
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
        line-height: 1.2;
        margin-bottom: 5px;
      }

      #divTrust {
        line-height: 1.2;
      }

      #inspectionLink {
        margin-top: 30px;
        margin-bottom: 30px;
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
        padding: 5px 10px 10px 5px;
      }

      #untrustedIcon {
        width: 30px;
        padding: 5px;
      }

      #untrustedText {
        text-align: center;
        padding: 0px;
      }

      #errors {
        border-radius: var(--border-radius);
        background-color: var(--background-highlight);
        margin-bottom: 10px;
      }

      #errorHeader {
        display: grid;
        grid-template-columns: auto 1fr;
        align-items: center;
        padding: 5px 10px 0px 5px;
      }

      #errorIcon {
        width: 25px;
        height: 25px;
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
      }

      li {
        margin-bottom: 5px;
      }

  `]

  private _c2paResult: C2paResult | undefined

  // Internal state for the blob URL
  private thumbprintUrl?: string

  private signer?: string

  private trustList?: string

  private status?: { errors: boolean, trusted: boolean }

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
        <div id="untrustedText"><span class="bold">${this.signer}</span> is untrusted</div>
      </div>`
      )
    }

    return result
  }

  render (): TemplateResult {
    const trusted = this.status?.trusted === true
    return html`
    <div id='container'>
      <div class='title'>
          <div class="thumbnailFrame clickable">
              <img class="thumbnail" id="thumbnail" src="${this.thumbprintUrl}">
          </div>
          <div>
              <div id="divSigned">Image signed by ${trusted ? '' : html`<span class="bold">untrusted</span> entity `}<span class="bold">${this.signer}</span> <img class="certIcon clickable" src="icons/cert.svg"></div>
              ${trusted ? html`<div id="divTrust">Part of trust list: <span class="bold">${this.trustList}</span></div>` : ''}
          </div>
      </div>
      <div id="inspectionLink">
          For more details, inspect the image in the <u>Microsoft Content Integrity</u> page.
      </div>
      ${this.validationSection(this._c2paResult?.manifestStore?.validationStatus)}
      <c2pa-collapsible>
        <span slot="header">Edits and Activity</span>
        <div slot="content"><c2pa-actions .actions="${this.c2paResult?.editsAndActivity}"></c2pa-actions></div>
      </c2pa-collapsible>
      <c2pa-collapsible>
        <span slot="header">Ingredients</span>
        <div slot="content"><c2pa-ingredients .ingredients="${this.c2paResult?.manifestStore?.activeManifest.ingredients}"></c2pa-ingredients></div>
      </c2pa-collapsible>
      <c2pa-collapsible>
        <span slot="header">Signature</span>
        <div slot="content"><c2pa-signature .signature="${this.c2paResult?.l2.signature}"></c2pa-signature></div>
      </c2pa-collapsible>
      <c2pa-collapsible>
        <span slot="header">Certificates</span>
        <div slot="content"><c2pa-certificates .certificates="${this.c2paResult?.certChain}"></c2pa-certificates></div>
      </c2pa-collapsible>
    </div>
    `
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
      /*border: 1px solid #ddd;*/
      border-radius: 5px;
      margin-bottom: 5px;
    /*  background-color: #f9f9f9;*/
    }
    .collapsible-header {
      cursor: pointer;
      padding: 10px;
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
      padding: 0 10px;
    }
    .collapsible-content.open  {
      max-height: 400px; /* Adjust as necessary */
      padding: 10px;
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

  toggle = (): void => {
    this.open = !this.open
    if (C2paCollapsible.openCollapsible != null && C2paCollapsible.openCollapsible !== this) {
      C2paCollapsible.openCollapsible.toggle()
    }
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

@customElement('c2pa-certificates')
export class C2paCertificates extends LitElement {
  @property({ type: Object }) certificates: CertificateWithThumbprint[] | undefined

  // private _certificates: CertificateWithThumbprint[] | undefined

  static styles = [
    sharedStyles,
    css`
    .c2pa-certificates-container    {
      margin-left: 15px;
    }

    .cert-container {
      display: flex;
      align-items: center; /* Vertically center the items */
    }
    
    .icon-container {
        flex: 0 0 auto; /* Do not grow or shrink */
        display: flex;
        align-items: center; 
        width: 20px;
        height: 20px;
    }
    
    .text-container {
        flex: 1; /* Take up remaining space */
        display: flex;
        flex-direction: column;
        justify-content: center; 
        padding-left: 10px; 
        font-size: 12px;
        margin-bottom: 10px;
    }
    `]

  render (): TemplateResult {
    if (this.certificates == null) {
      return html`<div>No certificates</div>`
    }
    const certHtml = this.certificates.map((cert) => {
      return html`
      <div class="cert-container">
          <div class="icon-container">
              <svg width="800px" height="800px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9 12L11 14L15 10M12 3L13.9101 4.87147L16.5 4.20577L17.2184 6.78155L19.7942 7.5L19.1285 10.0899L21 12L19.1285 13.9101L19.7942 16.5L17.2184 17.2184L16.5 19.7942L13.9101 19.1285L12 21L10.0899 19.1285L7.5 19.7942L6.78155 17.2184L4.20577 16.5L4.87147 13.9101L3 12L4.87147 10.0899L4.20577 7.5L6.78155 6.78155L7.5 4.20577L10.0899 4.87147L12 3Z" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
          </div>
          <div class="text-container">
              <div class="cert-issuer-o">${cert.issuer.attributes[2].value}</div>
              <div class="cert-issuer-cn">${cert.issuer.attributes[0].value}</div>
              <div class="cert-issuer">${localDateTime(cert.validTo.toString())}</div>
          </div>
      </div>`
    })

    return html`
      <div class="c2pa-certificates-container">
        ${certHtml}
      </div>
    `
  }
}

@customElement('c2pa-actions')
export class C2paActions extends LitElement {
  @property({ type: Object }) actions: Array<{
    id: string
    icon: string | null
    label: string
    description: string
  }> | undefined

  static styles = [
    sharedStyles,
    css`
    .c2pa-actions-container    {
      margin-left: 15px;
    }

    .action-container {
      display: flex;
      align-items: center; /* Vertically center the items */
    }
    
    .icon-container {
        flex: 0 0 auto; /* Do not grow or shrink */
        display: flex;
        align-items: center; 
        width: 20px;
        height: 20px;
    }
    
    .text-container {
        flex: 1; /* Take up remaining space */
        display: flex;
        flex-direction: column;
        justify-content: center; 
        padding-left: 10px; 
        font-size: 12px;
        margin-bottom: 10px;
    }
    `]

  render (): TemplateResult {
    if (this.actions == null) {
      return html`<div>No actions</div>`
    }
    const certHtml = this.actions.map((action) => {
      return html`
      <div class="action-container">
          <div class="icon-container">
              <img src="${action.icon}"/>
          </div>
          <div class="text-container">
              ${action.description}
          </div>
      </div>`
    })

    return html`
      <div class="c2pa-actions-container">
        ${certHtml}
      </div>
    `
  }
}

@customElement('c2pa-signature')
export class C2paSignature extends LitElement {
  @property({ type: Object }) signature: { issuer: string | null, isoDateString: string | null } | undefined

  static styles = [
    sharedStyles,
    css`
    .c2pa-signature-container    {
      margin-left: 15px;
    }

    .signature-container {
      display: flex;
      align-items: center; /* Vertically center the items */
    }
    
    .icon-container {
        flex: 0 0 auto; /* Do not grow or shrink */
        display: flex;
        align-items: center; 
        width: 20px;
        height: 20px;
    }
    
    .text-container {
        flex: 1; /* Take up remaining space */
        display: flex;
        flex-direction: column;
        justify-content: center; 
        padding-left: 10px; 
        font-size: 12px;
        margin-bottom: 10px;
    }
    `]

  render (): TemplateResult {
    if (this.signature == null) {
      return html`<div>No signature</div>`
    }
    const dateStr = this.signature?.isoDateString
    return html`
      <div class="c2pa-signature-container">
        <div class="signature-container">
          <div class="icon-container">
            <svg width="800px" height="800px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="24" height="24" fill="white"/>
              <path d="M15.6287 5.12132L4.31497 16.435M15.6287 5.12132L19.1642 8.65685M15.6287 5.12132L17.0429 3.70711C17.4334 3.31658 18.0666 3.31658 18.4571 3.70711L20.5784 5.82843C20.969 6.21895 20.969 6.85212 20.5784 7.24264L19.1642 8.65685M7.85051 19.9706L4.31497 16.435M7.85051 19.9706L19.1642 8.65685M7.85051 19.9706L3.25431 21.0312L4.31497 16.435" stroke="#000000" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="text-container">
            <div>${this.signature?.issuer}</div>
            <div>${dateStr != null ? localDateTime(dateStr) : 'unknown'}</div>
          </div>
        </div>
      </div>`
  }
}

@customElement('c2pa-ingredients')
export class C2paIngredients extends LitElement {
  @property({ type: Object }) ingredients: Array<{
    title: string
    format: string
    thumbnail: { blob: Blob }
  }> | undefined

  static styles = [
    sharedStyles,
    css`
    .c2pa-ingredients-container    {
        margin-left: 15px;
    }

    .ingredient-container {
        display: flex;
        align-items: center; /* Vertically center the items */
    }
    
    .icon-container {
        flex: 0 0 auto; /* Do not grow or shrink */
        display: flex;
        align-items: center; 
        width: 40px;
        height: 40px;
    }
    
    .text-container {
        flex: 1; /* Take up remaining space */
        display: flex;
        flex-direction: column;
        justify-content: center; 
        padding-left: 10px; 
        font-size: 12px;
        margin-bottom: 10px;
    }

    img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
    }
    `]

  render (): TemplateResult {
    if (this.ingredients == null || this.ingredients.length === 0) {
      return html`<div>No ingredients</div>`
    }
    const certHtml = this.ingredients.map((ingredient) => {
      return html`
      <div class="ingredient-container">
          <div class="icon-container">
              <img src="${URL.createObjectURL(ingredient.thumbnail.blob)}"/>
          </div>
          <div class="text-container">
            <div>${ingredient.title}</div>
            <div>${ingredient.format}</div>
          </div>
      </div>`
    })

    return html`
      <div class="c2pa-ingredients-container">
        ${certHtml}
      </div>
    `
  }
}
