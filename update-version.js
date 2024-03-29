// const fs = require('fs');
// const path = require('path');

import fs from 'fs';
import path from 'path';

// path to the version file
const versionFilePath = 'version.json'; // path.join(__dirname, 'version.json');

// path to the manifest files to update
const packageJsonPath = 'package.json'; // path.join(__dirname, 'package.json');
const chromeManifestPath = 'src/manifest.chrome.v3.json'; // path.join(__dirname, 'manifest.chrome.v3.json');
const firefoxManifestPath = 'src/manifest.firefox.v3.json'; // path.join(__dirname, 'manifest.firefox.v3.json');

// read all files
const versionData = JSON.parse(fs.readFileSync(versionFilePath));
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath));
const chromeManifest = JSON.parse(fs.readFileSync(chromeManifestPath));
const firefoxManifest = JSON.parse(fs.readFileSync(firefoxManifestPath));

// update the version in the manifest files
packageJson.version = versionData.version;
chromeManifest.version = versionData.version;
firefoxManifest.version = versionData.version;

// write-back the updated manifest files
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
fs.writeFileSync(chromeManifestPath, JSON.stringify(chromeManifest, null, 4));
fs.writeFileSync(firefoxManifestPath, JSON.stringify(firefoxManifest, null, 4));