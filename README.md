# Project

This project contains a Edge/Chrome/Firefox browser extension that can validate [C2PA](https://c2pa.org) assets, and specifically, content signed by members of the [project Origin](https://www.originproject.info/).

## Setup


1. Install dependencies
```
npm install
```

2. Build the extension
```
npm run build
```

3. Install the extension in a browser:  

Follow the side-loading instruction for your browser to load the extension:

* [Edge](https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/getting-started/extension-sideloading)  
* [Chrome](https://developer.chrome.com/docs/extensions/mv3/getstarted/development-basics/#load-unpacked)  
* [Firefox](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/) 

The Edge/Chrome `manifest.json` file is located at `dist/chrome`. The Firefox `manifest.json` file is located at `dist/firefox`.

Firefox requires additional extension permissions to download manifests from external sites
1. In the Firefox address bar go to `about:addons` to see the installed extensions
2. Find **Cross-Platform Origin of Content Extension** and click the `...` button to the right
3. Select **Manage** from the pop-up menu
4. Click the **Permission** tab
5. Enable **Access your data for all websites**

## Usage

TODO

## Contributing

This project welcomes contributions and suggestions.  Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.opensource.microsoft.com.

When you submit a pull request, a CLA bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## Trademarks

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft 
trademarks or logos is subject to and must follow 
[Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
Any use of third-party trademarks or logos are subject to those third-party's policies.
