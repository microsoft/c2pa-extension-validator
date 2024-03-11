// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { type C2paReadResult } from 'c2pa'
import { type Manifest } from 'webextension-polyfill'

const template = document.createElement('TEMPLATE')
template.innerHTML = `
<style>

    /* !important keeps the light-dom from overriding our settings */

    :host {
        all: initial;
        position: fixed;
        z-index: 10000; 
    }

    .container {
        border: 1px solid #808080;
        border-radius: 0.8em;
        background: #EEEEEE;
        width: auto;
        box-shadow: 5px 5px 5px rgba(0, 0, 0, 0.1);
        display: flex;
        align-items: center;
        font-family: Verdana, sans-serif;
        font-size: 12px;
        padding: 0.8em;
        margin: 1em;
        line-height: 1.25;
        
    }

    .panel {
      // border: 1px solid red;
      border-radius: 0.8em;
      display: block;
    }

    .left {
        /* width: 30%; */
        box-sizing: border-box;
        text-align: center;
        display: flex;
        justify-content: center;
        align-items: center;
        padding-right: 0.8em;
    }

    .middle {
        padding-left: 2em;
        border-left: 1px solid rgba(0, 0, 0, 0.1);
        min-width: 20em;
    }

    .right {
        box-sizing: border-box;
        text-align: center;
        display: flex;
        justify-content: center;
        align-items: center;
        padding-right: 0.8em;
    }

    img {
        height: 5em;
        /* opacity: 0.2; */
    }

    label {
        color: black;
        font-weight: 700;
        margin-bottom: 0.4em;
        display: block;
        font-size: 13px;
    }

    td {

    }

    td.key {
        font-weight: 500;
        font-size: 11px;
        color: #808080;
    }

    td.value {
        font-weight: 400;
        font-size: 11px;
        color: #101010;
        padding-left: 2em;
    }

    table {
        margin-left: 0.4em;
    }

    #button {
        display: none;
        margin-left: 0.4em;
        padding: 0.4em 0.8em;
    }


</style>

<div class="container" id="container">
</div>`

export class ContentPopup /* extends HTMLElement */ {
  container: HTMLElement
  readonly #shadowRoot: ShadowRoot

  constructor (public c2paImage: C2paReadResult) {
    this.container = document.createElement('DIV')
    this.#shadowRoot = this.container.attachShadow({ mode: 'open' })
    this.#shadowRoot.appendChild((template.cloneNode(true) as HTMLTemplateElement).content)
    // this.container.style.display = 'none'

    if (this.c2paImage.manifestStore?.activeManifest != null) {
      const panel = this.panel()
      panel.appendChild(this.l2() as Node)
    }

    const thumbnail = c2paImage.manifestStore?.activeManifest.thumbnail

    if (thumbnail != null) {
      const buffer = rebuildUint8Array(thumbnail?.blob as unknown as Uint8Array)
      const blob = new Blob([buffer], { type: 'image/jpeg' })
      const url = URL.createObjectURL(blob)

      const imgThumbnail = document.createElement('IMG') as HTMLImageElement
      imgThumbnail.src = url
      imgThumbnail.style.display = 'block'
      const container = this.#shadowRoot.getElementById('container') as HTMLDivElement
      container.appendChild(imgThumbnail)
      document.body.appendChild(this.container)
    }

    this.hide()
  }

  show (): void {
    this.container.style.display = 'block'

    // eslint-disable-next-line no-unused-vars
    const closeListener = (event: Event): void => {
      const isClickInsideElement = this.container.contains(event.target as Node)
      if (!isClickInsideElement) {
        document.removeEventListener('click', closeListener)
        this.hide()
      }
    }
    // Delay the addition of the listener to avoid the click that just triggered the show()
    setTimeout(() => { document.addEventListener('click', closeListener) }, 0)
  }

  hide (): void {
    this.container.style.display = 'none'
  }

  position (element: HTMLElement): void {
    const boundRect = element.getBoundingClientRect()

    // check if the fixed element will go off the right edge of the screen
    this.container.style.left =
            boundRect.right + this.container.offsetWidth > window.innerWidth
              ? `${window.innerWidth - this.container.offsetWidth - 10}px`
              : `${boundRect.right}px`

    // check if the fixed element will go off the bottom edge of the screen
    this.container.style.top =
            boundRect.bottom + this.container.offsetHeight > window.innerHeight
              ? `${window.innerHeight - this.container.offsetHeight - 10}px`
              : (this.container.style.top = `${boundRect.bottom}px`)
  }

  panel (): HTMLDivElement {
    const panel = document.createElement('div')
    panel.className = 'panel'
    // const text = document.createTextNode('Panel')
    // panel.appendChild(text);
    const container = this.#shadowRoot.getElementById('container') as HTMLDivElement
    container.appendChild(panel)
    return panel
  }

  l2 (): HTMLTableElement | null {
    if (this.c2paImage.manifestStore?.activeManifest == null) return null
    const activeManifest = this.c2paImage.manifestStore.activeManifest
    const signature = activeManifest.signatureInfo
    const assertions = activeManifest.assertions.data
    const ingredients = activeManifest.ingredients
    const main = {
      title: activeManifest.title,
      format: activeManifest.format
    }
    const table = document.createElement('TABLE') as HTMLTableElement
    const tbody = document.createElement('TBODY') as HTMLTableSectionElement
    table.appendChild(tbody)
    tbody.appendChild(row(['Title', main.title]))
    tbody.appendChild(row(['Format', main.format]))
    tbody.appendChild(row(['cert_serial_number', signature?.cert_serial_number ?? '']))
    tbody.appendChild(row(['issuer', signature?.issuer ?? '']))
    tbody.appendChild(row(['time', signature?.time ?? '']))
    for (const assertion of assertions) {
      tbody.appendChild(row(['assertion', assertion.label]))
    }
    for (const ingredient of ingredients) {
      tbody.appendChild(row(['ingredient', ingredient.title]))
    }
    return table
  }
}

function rebuildUint8Array (obj: Record<number, number>): Uint8Array {
  const keys = Object.keys(obj).map(key => parseInt(key)).sort((a, b) => a - b)
  // Create a new Uint8Array of the same length
  const receivedData = new Uint8Array(keys.length)
  // Copy each value into the new Uint8Array
  keys.forEach(key => {
    receivedData[key] = obj[key]
  })
  return receivedData
}

function title (panel: HTMLDivElement, title: string, thumbnail?: HTMLImageElement): void {
  panel.appendChild(thumbnail as Node)
  const label = document.createElement('label')
  label.textContent = title
  panel.appendChild(label)
}

function row (cellValues: string[]): HTMLTableRowElement {
  const tr = document.createElement('TR') as HTMLTableRowElement
  cellValues.forEach(value => {
    const td = document.createElement('TD') as HTMLTableDataCellElement
    td.appendChild(document.createTextNode(value))
    tr.appendChild(td)
  })
  return tr
}
