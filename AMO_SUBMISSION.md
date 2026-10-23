# Mozilla Add-ons Submission Notes

This file contains the copy and reviewer information for the initial public listing of Article Reader 1.0.0 on addons.mozilla.org (AMO).

## Listing

**Name:** Article Reader

**Suggested slug:** `article-reader-local`

**Summary:**

Turn articles into a focused reader with private on-device translation, highlights, notes, references, themes, and optional AI tools.

**Description:**

Article Reader turns the current article into a clean, customizable reading view without opening another tab.

It was created to solve a practical Firefox limitation: normal translation extensions cannot run inside Firefox's privileged built-in Reader View. Article Reader provides its own secure reading surface so reading, translation, highlighting, notes, references, and article tools can work together.

Features include:

- on-device translation using Mozilla language models and the Bergamot engine;
- automatic source-language detection and a remembered target language;
- saved articles, multi-color highlights, and notes;
- a dedicated references panel for outbound links;
- responsive images with a zoom viewer;
- readable tables and syntax-highlighted code blocks;
- light, dark, sepia, slate, contrast, and system themes;
- LTR/RTL detection and typography controls;
- private local summaries and key points; and
- optional Google Cloud Translation and OpenAI-compatible providers configured with the user's own credentials.

Article Reader has no analytics, advertising, account requirement, or developer-operated backend. Its default reading, annotation, translation, and summary tools run locally.

**Suggested categories:** Language Support and Other

**License:** MIT

**Support website:** https://github.com/ColdTears619/article-reader-firefox/issues

**Privacy policy:** https://github.com/ColdTears619/article-reader-firefox/blob/main/PRIVACY.md

## Version notes

Initial public release. Includes same-tab Reader mode, local translation, local summaries and key points, saved articles, highlights, notes, references, image zoom, code highlighting, themes, bidirectional text support, and opt-in cloud providers.

## Notes for reviewers

Article Reader is a Manifest V3 Firefox extension. The submitted extension archive is generated from TypeScript source using Vite, so a matching source archive is provided.

The listing is intended for **Firefox Desktop only**. The validator may emit an Android minimum-version warning because `data_collection_permissions` reached Firefox for Android in version 142, while the desktop minimum is 140. No Android compatibility is selected for this release and no `gecko_android` manifest key is declared.

### Build environment

- Linux (tested on Ubuntu-compatible environments)
- Node.js 20 or later; Mozilla's default Node.js 24 review environment is supported
- npm with the committed `package-lock.json`
- `zip` command-line utility for the final archive

### Reproduce the submitted extension

From the root of the source archive:

```bash
npm ci
npm run package
```

The unpacked build is written to `dist/`. The uploadable archive is written to `article-reader-firefox.zip`.

Validation commands:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

No environment variables, private registries, credentials, network-based build steps, or proprietary tools are required. Cloud provider credentials are not included and are not required to exercise the default local features.

### Data behavior

- The default translation provider runs on-device.
- Local summaries and key points run on-device.
- Article content, saved articles, highlights, notes, and settings are stored in the user's Firefox profile.
- The manifest sets `incognito` to `not_allowed`; private tabs and windows are invisible to the extension and private-browsing activity is not stored.
- The extension contains no analytics, advertising, telemetry, or developer-operated backend.
- On first use of a language pair, model files are downloaded from Mozilla Firefox Remote Settings and its official attachment CDN. Article text is not sent with model requests.
- Google Cloud Translation and OpenAI-compatible providers are optional. The user must configure a provider, confirm the disclosure, grant Firefox's optional `websiteContent` and `authenticationInfo` permissions, and directly invoke an operation before data is sent.
- The background process rechecks both optional data permissions before every cloud request.

### Third-party packages included in the build

Exact versions are locked in `package-lock.json`. Runtime dependencies are declared in `package.json` and sourced from the public npm registry:

- `@browsermt/bergamot-translator` 0.4.9 — https://www.npmjs.com/package/@browsermt/bergamot-translator/v/0.4.9
- `@mozilla/readability` 0.6.0 — https://www.npmjs.com/package/@mozilla/readability/v/0.6.0
- `dompurify` 3.4.17 — https://www.npmjs.com/package/dompurify/v/3.4.17
- `fflate` 0.8.3 — https://www.npmjs.com/package/fflate/v/0.8.3
- `fzstd` 0.1.1 — https://www.npmjs.com/package/fzstd/v/0.1.1
- `highlight.js` 11.12.0 — https://www.npmjs.com/package/highlight.js/v/11.12.0
- `idb` 8.0.4 — https://www.npmjs.com/package/idb/v/8.0.4
- `webextension-polyfill` 0.12.0 — https://www.npmjs.com/package/webextension-polyfill/v/0.12.0

License details are included in `THIRD_PARTY_NOTICES.md`.

The AMO validator also identifies `eval` in the released `@browsermt/bergamot-translator` 0.4.9 worker. It is confined to the package's unreachable Node.js compatibility branch; Article Reader creates the worker in Firefox's `WorkerGlobalScope`, so that branch cannot execute. The active browser path uses `importScripts` to load the packaged Emscripten glue and does not download or evaluate code. Both the exact npm dependency and its matching source are supplied for review.

Article markup is sanitized with DOMPurify before storage and sanitized again before rendering. Syntax-highlight markup is generated locally by highlight.js. Article Reader inserts both through parsed DOM nodes rather than assigning application values to `innerHTML`; remaining validator references to `innerHTML` originate in the released Readability, DOMPurify, or highlight.js dependencies listed above.

### Permission rationale

- `activeTab`, `tabs`, and `scripting`: extract the article only when the user opens or saves it and replace the current tab with Reader mode.
- `storage` and `unlimitedStorage`: save preferences and article data, and cache verified translation models with a 128 MB application limit.
- `contextMenus`: expose user-initiated Reader, translation, summary, and explanation actions.
- Mozilla model-host permissions: download the official catalog and model files without sending article content.
- Optional HTTP/HTTPS host permissions: connect only to a cloud endpoint selected and approved by the user.
- Optional `websiteContent` and `authenticationInfo` data permissions: disclose and control the text and user-supplied credential needed for optional cloud processing.

### Manual test path

1. Open a normal article page.
2. Select the toolbar action and choose **Open Reader**.
3. Select text and choose **Translate**. Keep the default on-device provider to test without credentials.
4. Add a highlight and note, then open the corresponding panels.
5. Open **Settings** to inspect the local and optional cloud-provider choices.

Firefox-protected pages such as `about:` pages are intentionally unsupported.
Private Browsing is intentionally unsupported so no data from a private session can enter persistent extension storage.
