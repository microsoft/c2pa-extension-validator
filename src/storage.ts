/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

/**
 * Retrieves the value from local storage for the specified key.
 * If the key does not exist, an empty object is returned.
 * @param key - The key to retrieve the value for.
 * @returns A promise that resolves to an object containing the retrieved value.
 */
export async function getLocalStorage (
  key: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, unknown>> {
  return await new Promise((resolve) => {
    chrome.storage.session.get([key], (data) => {
      if (!Object.prototype.hasOwnProperty.call(data, key)) {
        data[key] = {}
      }
      resolve(data)
    })
  })
}

/**
 * Sets the values in the local storage.
 * @param value - The key-value pairs to be stored in the local storage.
 * @returns A promise that resolves when the operation is complete.
 */
export async function setLocalStorage (value: Record<string, unknown>): Promise<void> {
  await chrome.storage.session.set(value)
}
