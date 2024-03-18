/*
*  Copyright (c) Microsoft Corporation.
*  Licensed under the MIT license.
*/

import Browser from 'webextension-polyfill'
import { MESSAGE_SAMPLE } from './constants.js'
import { getLocalStorage } from './storage';
import { TrustList, TrustListInfo, getTrustListInfo, setTrustList } from './trustlist.js';


console.debug('popup.js: load')

document.addEventListener('DOMContentLoaded', function (): void {
    // Add event listeners to switch tabs
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');
    tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs and tab contents
            tabs.forEach((t) => t.classList.remove('active'));
            tabContents.forEach((c) => c.classList.remove('active-content'));

            // Add active class to clicked tab and tab content
            tab.classList.add('active');
            const tabContentId = tab.getAttribute('data-tab') ?? '';
            document
                .getElementById(tabContentId)
                ?.classList.add('active-content');

            // refresh the origin source in the option tab
            if (tabContentId === 'options') {
                const trustListInfo = getTrustListInfo();
                console.log(
                    'trustListInfo obtained in options tab',
                    trustListInfo,
                );
                if (trustListInfo) {
                    displayTrustListInfo(trustListInfo);
                }
            }
        });
    });
    showResults().then(() => {
        console.log('results shown');
    });
});

/**
 * Displays the validation results in the popup.
 * @returns {Promise<void>} A promise that resolves when the results are displayed.
 */
async function showResults() {
    // TODO
}

const trustListInput = document.getElementById(
    'trust-list-input',
) as HTMLInputElement;

trustListInput.addEventListener('change', function (event) {
    const eventTarget = event.target as HTMLInputElement;
    if (eventTarget.files && eventTarget.files.length > 0) {
        const file = eventTarget.files[0];
        // read the file
        const reader = new FileReader();
        reader.readAsText(file, 'UTF-8');
        reader.onload = function (evt) {
            // parse the file contents as JSON
            const json = JSON.parse(
                evt?.target?.result as string,
            ) as TrustList;
            try {
                // set the trust list
                const trustListInfo = setTrustList(json);
                console.log(`trust list loaded: ${trustListInfo.name}`);

                displayTrustListInfo(trustListInfo);
            } catch (e) {
                console.log(`Invalid origin data source: ${e}`);
            }
        };
    } else {
        console.log('No file selected');
    }
});


function displayTrustListInfo(tli: TrustListInfo) {
    console.log('displayTrustListInfo called, source:' + tli.name);
    // display the trust list info
    const trustListInfo = document.getElementById(
        'trust-list-info',
    ) as HTMLDivElement;
    trustListInfo.style.display = 'block';
    trustListInfo.innerHTML = `
      <p>Trust List: <a href="${tli.website}" target="_blank">${tli.name}</a></p>
    `;
}
