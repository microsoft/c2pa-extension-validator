import browser from 'webextension-polyfill'
import { decimalStringToHex, localDateTime } from './utils'
import { type CreativeWorkAssertion, type Assertion, type Ingredient } from 'c2pa'
import { type CertificateWithThumbprint } from './certs/certs'
import { type C2paResult } from './c2pa'
import { type TrustListMatch } from './trustlist'

/*
  SignatureInfo is from c2pa lib but not exported
*/
export interface SignatureInfo {
  issuer?: string
  time?: string
  cert_serial_number?: string
}

const urlParams = new URLSearchParams(window.location.search)
const randomParam = urlParams.get('id')

console.debug('IFrame page load start')

if (randomParam === null) {
  console.error('No id found')
  throw new Error('No id found')
}

let _tabId: number

void (async () => {
  const { [randomParam]: ids } = await browser.storage.local.get(randomParam)
  const [id, tabId] = ids.split(':') as [string, string]
  _tabId = parseInt(tabId)
  console.debug('id currently is ' + id)
  await browser.storage.local.remove(randomParam)

  window.addEventListener('message', function (event) {
    if (event.data.id !== ids) {
      return
    }
    populate(event.data.data as C2paResult)
    void sendMessageToContent('hello from iframe', parseInt(tabId))
    console.debug(`IFrame ${id} message received:`, event.data as C2paResult)
  })

  console.debug('IFrame message listener added')
})()

function createAssertion (asserion: Assertion): HTMLDivElement {
  const container: HTMLDivElement = document.createElement('div')
  container.className = 'assertion'

  container.innerHTML = parseAssertion(asserion)

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const assertionsContent = document.querySelector('#assertions .collapsible-content')!
  assertionsContent.appendChild(container)
  return container
}

function createValidationErrors (...texts: string[]): HTMLDivElement {
  // Create the container div
  const container: HTMLDivElement = document.createElement('div')
  container.className = 'validationError'

  // Iterate over the text parameters and create h2 elements
  texts.forEach((text) => {
    const p: HTMLParagraphElement = document.createElement('p')
    p.className = 'text-item'
    p.textContent = text
    container.appendChild(p)
  })

  document.getElementById('errors')?.appendChild(container)

  // Return the container div
  return container
}

function createSignature (signatureInfo: SignatureInfo, trustListMatch: TrustListMatch | null): HTMLDivElement {
  // Create the container div
  const container: HTMLDivElement = document.createElement('div')
  container.className = 'signature'

  const i: HTMLParagraphElement = document.createElement('p')
  i.className = 'text-item'
  i.textContent = signatureInfo.issuer ?? '???'
  container.appendChild(i)

  const s: HTMLParagraphElement = document.createElement('p')
  s.className = 'text-item'
  s.textContent = decimalStringToHex(signatureInfo.cert_serial_number ?? '???')
  container.appendChild(s)

  const t: HTMLParagraphElement = document.createElement('p')
  t.className = 'text-item'
  t.textContent = 'TrustList: ' + (trustListMatch === null ? '<none>' : trustListMatch.entity.display_name)
  container.appendChild(t)

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const signature = document.querySelector('#signature .collapsible-content')!
  signature.appendChild(container)

  // Return the container div
  return container
}

function createIngredient (ingredient: Ingredient): HTMLDivElement {
  // Create the container div
  const container: HTMLDivElement = document.createElement('div')
  container.className = 'ingredient'

  if (ingredient.thumbnail != null) {
    const i: HTMLImageElement = document.createElement('img')
    i.className = 'thumbnail'
    i.src = ingredient.thumbnail.blob as unknown as string
    container.appendChild(i)
  }
  const s: HTMLParagraphElement = document.createElement('p')
  s.className = 'text-item'
  s.textContent = ingredient.title
  container.appendChild(s)

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const ingredients = document.querySelector('#ingredients .collapsible-content')!
  ingredients.appendChild(container)
  // Return the container div
  return container
}

function createCertificate (certificate: CertificateWithThumbprint): HTMLDivElement {
  // Create the container div
  const container: HTMLDivElement = document.createElement('div')
  container.className = 'certs'

  const icn: HTMLParagraphElement = document.createElement('p')
  icn.className = 'cert-item'
  icn.textContent = (certificate.issuer as unknown as { CN: string, O: string }).CN
  container.appendChild(icn)

  const io: HTMLParagraphElement = document.createElement('p')
  io.className = 'cert-item'
  io.textContent = (certificate.issuer as unknown as { CN: string, O: string }).O
  container.appendChild(io)

  const s: HTMLParagraphElement = document.createElement('p')
  s.className = 'cert-item'
  s.textContent = certificate.serialNumber
  container.appendChild(s)

  const e: HTMLParagraphElement = document.createElement('p')
  e.className = 'cert-item'
  e.textContent = localDateTime(certificate.validTo.toString())
  container.appendChild(e)

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const certs = document.querySelector('#certs .collapsible-content')!
  certs.appendChild(container)
  // Return the container div
  return container
}

function populate (c2paData: C2paResult): void {
  console.debug('populate', c2paData)

  const activeManifest = c2paData.manifestStore?.activeManifest
  if (activeManifest == null) {
    console.error('No activeManifest found')
    return
  }

  (document.getElementById('thumbnail') as HTMLImageElement).src = c2paData.source.thumbnail.blob as unknown as string ?? '';
  (document.getElementById('title') as HTMLHeadingElement).textContent = activeManifest.title ?? 'Title';
  (document.getElementById('format') as HTMLHeadingElement).textContent = activeManifest.format ?? 'Format'

  const assertions = activeManifest?.assertions.data
  if (assertions == null) {
    console.error('No assertions found')
    return
  }
  if (assertions.length === 0) {
    const element = document.getElementById('assertions')
    element?.previousElementSibling?.remove()
    element?.remove()
  }
  for (const assertion of assertions) {
    createAssertion(assertion)
  }

  const validationErrors = c2paData.manifestStore?.validationStatus
  if (validationErrors == null) {
    console.error('No validationStatus found')
    return
  }
  if (validationErrors.length === 0) {
    const element = document.getElementById('errors')
    element?.previousElementSibling?.remove()
    element?.remove()
  }
  for (const validationError of validationErrors) {
    createValidationErrors(validationError.explanation ?? validationError.code)
  }

  const certificates = c2paData.certChain
  if (certificates == null) {
    console.error('No certificates found')
    return
  }
  if (certificates.length === 0) {
    const element = document.getElementById('certs')
    element?.previousElementSibling?.remove()
    element?.remove()
  }
  for (const certificate of certificates) {
    createCertificate(certificate)
  }

  const ingredients = activeManifest.ingredients
  if (ingredients == null) {
    console.error('No ingredients found')
    document.getElementById('ingredients')?.remove()
    return
  }
  if (ingredients.length === 0) {
    const element = document.getElementById('ingredients')
    element?.previousElementSibling?.remove()
    element?.remove()
  }
  for (const ingredient of ingredients) {
    createIngredient(ingredient)
  }

  createSignature(activeManifest?.signatureInfo as SignatureInfo, c2paData.trustList)
}

console.debug('IFrame page load end')

async function sendMessageToContent (message: unknown, tabId: number): Promise<void> {
  const height = document.documentElement.scrollHeight
  await browser.tabs.sendMessage(tabId, { action: 'updateFrame', data: height, frame: randomParam })
}

document.addEventListener('DOMContentLoaded', () => {
  const collapsibleHeaders = document.querySelectorAll('.collapsible-header')

  collapsibleHeaders.forEach((header: Element) => {
    header.addEventListener('click', () => {
      const content = header.nextElementSibling as HTMLDivElement
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const icon = header.querySelector('.collapsible-icon')!

      // Collapse all sections except the one that was clicked
      collapsibleHeaders.forEach((otherHeader: Element) => {
        if (otherHeader !== header) {
          const otherContent = otherHeader.nextElementSibling as HTMLDivElement
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const otherIcon = otherHeader.querySelector('.collapsible-icon')!
          otherContent.style.maxHeight = ''
          otherIcon.textContent = '+'
          otherContent.classList.remove('expanded')
        }
      })

      // Toggle content visibility of the clicked header
      if (content.style.maxHeight.length > 0) {
        content.style.maxHeight = ''
        icon.textContent = '+'
      } else {
        content.style.maxHeight = `${content.scrollHeight}px`
        icon.textContent = '-'
      }
      content.classList.toggle('expanded')

      // Assuming _tabId is defined somewhere else in your TypeScript code.
      // Ensure the type and value of _tabId are correctly defined.
      // This function should also be defined elsewhere in your TypeScript code with proper typing.
      void sendMessageToContent('hello from iframe', _tabId)
    })
  })
})

// Initialize ResizeObserver
const resizeObserver = new ResizeObserver(entries => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for (const _entry of entries) {
    // Assuming we are only observing one element, the first entry is our target element
    // If entry.contentRect.height is different from your last known height, you can call onHeightChange
    // You may want to store the last known height if you only want to call the function on actual changes
    // onHeightChange(entry.target as HTMLElement)
    void sendMessageToContent('hello from iframe', _tabId)
  }
})

// Start observing an element
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const elementToObserve = document.getElementById('container')!
resizeObserver.observe(elementToObserve)

function parseAssertion (assertion: Assertion): string {
  switch (assertion.label) {
    case 'stds.schema-org.CreativeWork':
      // eslint-disable-next-line no-case-declarations
      const creativeWork = assertion as CreativeWorkAssertion
      return `
      <div class='action-item'>
        <p>Author:</p><p>${creativeWork.data.author[0].name}</p>
      </div>`

    case 'c2pa.actions':
      // eslint-disable-next-line no-case-declarations
      const actions = assertion.data as { actions: ActionV1[] }
      return actions.actions.map(parseActions).join('')

    default:
      return `
      <div class='action-item'>
        <p>Assertion:</p><p>${assertion.label}</p>
      </div>`
  }
}

function parseActions (action: ActionV1): string {
  switch (action.action) {
    case 'c2pa.created':
      return `
      <div class='action-item'>
        <p>Drawing:</p><p>${action?.parameters?.name}</p>
      </div>`
    case 'c2pa.placed':
      return `
      <div class='action-item'>
        <p>Placed:</p><p>${(action?.parameters as unknown as { ingredient: { url: string } }).ingredient.url}</p>
      </div>`
    case 'c2pa.resized':
      return `
      <div class='action-item'>
        <p>Action:</p><p>Resized</p>
      </div>`
    default:
      return `
        <div class='action-item'>
          <p>Action:</p><p>${action.action}</p>
        </div>`
  }
}

interface ActionV1 {
  action: string
  softwareAgent?: string
  changed?: string[]
  instanceId?: string
  parameters?: Parameters
  digitalSourceType?: string
}

export interface Parameters {
  name: string
}
