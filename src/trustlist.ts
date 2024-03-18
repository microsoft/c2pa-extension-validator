/*
*  Copyright (c) Microsoft Corporation.
*  Licensed under the MIT license.
*/

export interface TrustedSigner {
    id: string;
    display_name: string;
    contact: string;
    jwks_url: string;
}

export interface TrustList {
    // name of the trust list
    name: string;
    // description of the trust list
    description: string;
    // download url of the trust list
    download_url: string;
    // website of the trust list
    website: string;
    // last updated date of the trust list (ISO 8601 format)
    last_updated: string;
    // list of trusted signers
    signers: TrustedSigner[];
}

let globalTrustList: TrustList | undefined;

// trust list info (subset of the trust list data)
export interface TrustListInfo {
    name: string;
    description: string;
    download_url: string;
    website: string;
    last_updated: string;
    signers_count: number;
}

const getInfoFromTrustList = (tl: TrustList): TrustListInfo => {
    return {
        name: tl.name,
        description: tl.description,
        download_url: tl.download_url,
        website: tl.website,
        last_updated: tl.last_updated,
        signers_count: tl.signers.length,
    };
}

/**
 * Retrieves the trust list info.
 * @returns The trust list info if available, otherwise undefined.
 */
export function getTrustListInfo(): TrustListInfo | undefined {
    if (globalTrustList) {
        return getInfoFromTrustList(globalTrustList);
    } else {
        return undefined;
    }
}

/**
 * Sets the trust list, returns the trust list info or throws an error
 */
export function setTrustList(tl: TrustList): TrustListInfo {
    console.log(`setTrustList called`);

    if (!tl) {
        // TODO: more validation
        throw 'Invalid trust list';
    }

    // set the global trust list
    globalTrustList = tl;

    // store the trust list
    chrome.storage.local.set({ trustList: tl }, function () {
        console.log(`Trust list stored: ${tl.name}`);
    });

    return getInfoFromTrustList(tl);
}

/**
 * Retrieves the trust list from storage.
 */
function loadTrustList() {
    // load the trust list from storage
    chrome.storage.local.get(['trustList'], (result) => {
        console.log(`getTrustList result:`, result);
        const storedTrustList =
            result?.trustList as TrustList;
        if (storedTrustList) {
            globalTrustList = storedTrustList;
            console.log(
                `Trust list loaded: ${storedTrustList.name}`,
            );
        } else {
            console.log(`No trust list found`);
        }
    });
}

/**
 * Get the current trust list.
 */
export function getTrustList(): TrustList | undefined {
    return globalTrustList;
}


// load the trust list from storage at startup
loadTrustList();
