# Extension TO-DOs

## Pre-OSS release

* Add test trust list to validate some well-known issuers (e.g., Adobe's test images, Bing Creator, OpenAI)
* Verify BBC content directly from their web site (e.g., https://www.bbc.com/news/world-europe-68541911)
* Add a link to online validation portal for further asset analysis
* Decide what to display in icon popup
* Create a test page using a test cert (added to our test trust list) for all supported formats
* General toolbar popup UI clean-up
* Fix UI clean-up when deleting the last trust list
* Fix HTML accessibility
* Delete this TODO.md file, and file remaining tasks as GitHub issues

## Post-OSS release (or pre-OSS stretch goals)
* Add a "verify all assets" option and enable context menu validation
* Migrate to c2pa-wc lib to display validation results
* Add other asset types (PNG, GIF, etc.)
* Show validation results in toolbar popup
* Re-start validation if trust list is added
* Countermeasures against malicious pages
* Document attacks and risks (for threat model)