/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { type TrustList, type TrustListInfo, getTrustListInfos, addTrustList, removeTrustList } from './trustlistProxy.js'
import packageManifest from '../package.json'
import { AUTO_SCAN_DEFAULT, MSG_AUTO_SCAN_UPDATED, MSG_CLOSE_SIDE_PANEL, MSG_REQUEST_C2PA_ENTRIES, MSG_RESPONSE_C2PA_ENTRIES } from './constants.js'
import { type MSG_RESPONSE_C2PA_ENTRIES_PAYLOAD } from './inject.js'
import './components/toggle.js'
import { type ToggleSwitch } from './components/toggle.js'
import { addTrustAnchor } from './trustlist.js'
import { getActiveTabId } from './utils.js'

console.debug('popup.js: load', process.env.NODE_ENV?.toUpperCase())

const debugMode = process.env.NODE_ENV?.toUpperCase() === 'DEVELOPMENT'
const sidePanelDiv = document.getElementById('side-panel-container')
if (sidePanelDiv != null) sidePanelDiv.style.display = debugMode ? 'block' : 'none'

document.addEventListener('DOMContentLoaded', function (): void {
  // Update the version number
  const versionElement = document.getElementById('version')
  if (versionElement !== null) {
    versionElement.textContent = packageManifest.version
  }

  const autoScanToggle = document.getElementById('toggleAutoScan') as ToggleSwitch
  const sidePanelToggle = document.getElementById('toggleSidePanel') as ToggleSwitch

  chrome.storage.local.get('autoScan', (result) => {
    autoScanToggle.checked = result.autoScan ?? AUTO_SCAN_DEFAULT
  })

  chrome.storage.local.get('sidePanel', (result) => {
    sidePanelToggle.checked = result.sidePanel ?? false
  })

  autoScanToggle.addEventListener('change', (event) => {
    const checked = (event as CustomEvent).detail.checked as boolean
    void chrome.storage.local.set({ autoScan: checked })
    void chrome.runtime.sendMessage({ action: MSG_AUTO_SCAN_UPDATED, data: checked })
  })

  sidePanelToggle.addEventListener('change', (event) => {
    const checked = (event as CustomEvent).detail.checked as boolean
    void chrome.storage.local.set({ sidePanel: checked })

    if (checked) {
      void getActiveTabId().then((tabId) => {
        if (tabId == null) {
          return
        }
        chrome.sidePanel.open({ tabId }, () => {
          console.log('Side panel opened.')
        })
      })
    } else {
      void chrome.runtime.sendMessage({ action: MSG_CLOSE_SIDE_PANEL, data: null })
    }
  })

  document.getElementById('buttonOpenSidePanel')?.addEventListener('click', () => {

  });

  (document.getElementById('toggleAutoScan') as ToggleSwitch).checked = false

  // Add event listeners to switch tabs
  const tabs = document.querySelectorAll('.tab')
  const tabContents = document.querySelectorAll('.tab-content')
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      // Remove active class from all tabs and tab contents
      tabs.forEach((t) => { t.classList.remove('active') })
      tabContents.forEach((c) => { c.classList.remove('active-content') })

      // Add active class to clicked tab and tab content
      tab.classList.add('active')
      const tabContentId = tab.getAttribute('data-tab') ?? ''
      document.getElementById(tabContentId)?.classList.add('active-content')

      // refresh the trust lists info in the option tab
      if (tabContentId === 'options') {
        void displayTrustListInfos()
      }
    })
  })
  void showResults()
})

/**
 * Displays the validation results in the popup.
 * @returns {Promise<void>} A promise that resolves when the results are displayed.
 */
async function showResults (): Promise<void> {
  const activeBrowserTab = await chrome.tabs.query({ active: true, currentWindow: true })
  const id = activeBrowserTab[0].id
  if (id == null) {
    return
  }
  void chrome.tabs.sendMessage(id, { action: MSG_REQUEST_C2PA_ENTRIES, data: null })
}

function addValidationResult (validationResult: MSG_RESPONSE_C2PA_ENTRIES_PAYLOAD): void {
  const iconUrl = {
    valid: chrome.runtime.getURL('icons/cr.svg'),
    invalid: chrome.runtime.getURL('icons/crx.svg'),
    untrusted: chrome.runtime.getURL('icons/cr!.svg')
  }

  const icon = validationResult.status === 'error' ? iconUrl.invalid : validationResult.status === 'warning' ? iconUrl.untrusted : iconUrl.valid

  if (validationResult.thumbnail === '') {
    validationResult.thumbnail = chrome.runtime.getURL('icons/video.svg')
  }

  const html = `
          <img src="${icon}" style="width: 30px; height: 30px;">
          <img src="${validationResult.thumbnail}" style="width: 40px; height: 40px">
          <div>${decodeURIComponent(validationResult.name)}</div>
          `
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const validationEntries = document.getElementById('validationEntries')!
  validationEntries.innerHTML += html
}

function createFileInputEventListener (callback: (fileContents: string) => void): (event: Event) => void {
  return function (event: Event): void {
    const eventTarget = event.target as HTMLInputElement
    if (eventTarget.files != null && eventTarget.files.length > 0) {
      const file = eventTarget.files[0]
      const reader = new FileReader()
      reader.readAsText(file, 'UTF-8')
      reader.onload = function (evt): void {
        const fileContents = evt?.target?.result as string
        callback(fileContents)
      }
    } else {
      console.debug('No file selected')
    }
  }
}

const trustListInput = document.getElementById('trust-list-input') as HTMLInputElement
trustListInput.addEventListener('change', createFileInputEventListener((fileContents: string): void => {
  const json = JSON.parse(fileContents) as TrustList
  try {
    // eslint-disable-next-line no-void
    void addTrustList(json).then(() => { void displayTrustListInfos() })
  } catch (e) {
    console.error('Can\'t parse trust list file')
  }
}))

const trustAnchorInput = document.getElementById('trust-anchor-input') as HTMLInputElement
trustAnchorInput.addEventListener('change', createFileInputEventListener((fileContents: string): void => {
  try {
    void addTrustAnchor(fileContents).then(() => { void displayTrustListInfos() })
  } catch (e) {
    console.error('Can\'t parse trust anchor file')
  }
}))

/**
 * Displays the trust list info in the popup.
 */
async function displayTrustListInfos (): Promise<void> {
  void getTrustListInfos()
    .then(
      (tlis: TrustListInfo[]) => {
        const trustListInfo = document.getElementById('trust-list-info') as HTMLDivElement
        trustListInfo.style.display = 'block'

        if (tlis.length === 0) {
          trustListInfo.innerHTML = '<p>No trust list set</p>'
        } else {
          let listHtml = '<p>Trust Lists:</p><ul>'
          tlis.forEach((tli, index) => {
            const listItem = (tli.website.length > 0)
              ? `<li><a href="${tli.website}" target="_blank">${tli.name}</a>`
              : `<li>${tli.name}`

            // Add the delete link with a data-index attribute
            listHtml += `${listItem} (<a href="#" class="delete-link" data-index="${index}">delete</a>)</li>`
          })
          listHtml += '</ul>'
          trustListInfo.innerHTML = listHtml
        }
      })
}

// event listener for trust lists delete link
const trustListInfoElement = document.getElementById('trust-list-info')
if (trustListInfoElement !== null) {
  trustListInfoElement.addEventListener('click', function (event) {
    const target = event.target as HTMLElement
    if (target.classList.contains('delete-link')) {
      event.preventDefault() // Prevent default link action
      const index = target.getAttribute('data-index')
      if (index !== null) {
        void removeTrustList(parseInt(index))
          .then(async () => { await displayTrustListInfos() })
      }
    }
  })
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === MSG_RESPONSE_C2PA_ENTRIES) {
    addValidationResult(request.data as MSG_RESPONSE_C2PA_ENTRIES_PAYLOAD)
  }
})
