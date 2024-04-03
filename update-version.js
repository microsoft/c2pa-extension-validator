/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import fs from 'fs';

// path to the package manifest containing the version
const packageJsonPath = 'package.json';

// path to the manifest files to update
const chromeManifestPath = 'src/manifest.chrome.v3.json';
const firefoxManifestPath = 'src/manifest.firefox.v3.json';

// read all files
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath));
const chromeManifest = JSON.parse(fs.readFileSync(chromeManifestPath));
const firefoxManifest = JSON.parse(fs.readFileSync(firefoxManifestPath));

// update the version in the manifest files
chromeManifest.version = packageJson.version;
firefoxManifest.version = packageJson.version;

// write-back the updated manifest files
fs.writeFileSync(chromeManifestPath, JSON.stringify(chromeManifest, null, 4));
fs.writeFileSync(firefoxManifestPath, JSON.stringify(firefoxManifest, null, 4));