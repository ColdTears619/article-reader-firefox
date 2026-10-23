# Article Reader for Firefox

![Article Reader icon](public/icons/icon-128.png)

A private, local-first reading mode for Firefox with on-device translation, persistent highlights and notes, reference collection, readable code blocks, and optional AI tools.

Article Reader exists to solve a specific gap: Firefox Reader View is a privileged browser page, so ordinary translation extensions cannot run inside it. Firefox Reader View also does not provide the complete annotation and translation workflow this project aims for. This extension extracts the article into its own secure reader, where those tools can work together without requiring an account or a hosted backend.

> **Project status:** version 1.0 release candidate, prepared for its initial Mozilla Add-ons submission. It has not yet been signed or listed by Mozilla.

## What it does

- Extracts the main article with Mozilla Readability and sanitizes it with DOMPurify.
- Replaces the current tab with a focused reader instead of opening another tab.
- Supports light, dark, sepia, slate, high-contrast, and system themes.
- Detects LTR/RTL text and provides controls for direction, font size, line height, column width, and toolbar position.
- Preserves responsive images, bordered tables, and syntax-highlighted code blocks.
- Opens article images in a click-to-zoom lightbox.
- Adds multi-color highlights and notes anchored to the article text.
- Collects outbound links into a dedicated References panel.
- Saves articles, highlights, notes, and generated results locally.
- Translates selected text on-device with Firefox's Bergamot engine and Mozilla language models.
- Detects the source language automatically and remembers the chosen target language.
- Provides free local extractive summaries and key points.
- Supports optional Google Cloud Translation and OpenAI-compatible providers using the user's own key.

## Local-first translation

The default translation provider is **On-device**. No API key is required and article text is not sent to a translation service.

On first use of a language pair, the extension downloads the corresponding model files from Mozilla Remote Settings and Mozilla's official attachment CDN. Both the compressed and decompressed files are SHA-256 verified before the model is used. Later translations use the local cache.

English ↔ Persian is supported by the released Mozilla models. Other languages depend on the current Firefox model catalog; when no direct pair exists, Bergamot can use English as a pivot if both required models are available.

### Resource limits

- English → Persian uses about 14.6 MB of compressed disk cache; the reverse direction is similar.
- Total model cache is capped at 128 MB. Older files are removed automatically.
- The Bergamot workspace follows the upstream 128 MB setting.
- The translation worker is terminated 20 seconds after the last translation so its WASM and model memory can be reclaimed.
- A direct translation normally stays below a few hundred megabytes of transient memory. Pivot translation temporarily loads two models and is heavier.

## Summary and AI modes

The **Summary and AI mode** setting has three choices:

- **None:** disables Summary, Key points, and generative actions. Clicking one of those tools opens a clear configuration prompt.
- **On-device summary & key points:** ranks and extracts important sentences locally. It is free and private, but it does not generate new prose.
- **OpenAI-compatible AI:** enables generative Summary, Key points, Explain, Define, and Question actions through a user-configured Chat Completions endpoint.

No developer-owned API key is included in the source or build.

## Install for development

Requirements:

- Firefox 140 or newer
- Node.js 20 or newer
- npm

```bash
npm install
npm run build
```

Then load the extension in Firefox:

1. Open `about:debugging#/runtime/this-firefox`.
2. Select **Load Temporary Add-on**.
3. Choose `dist/manifest.json`.
4. Open a normal article and select **Open Reader** from the extension popup.

After rebuilding or reloading the extension, refresh any Reader tabs that were already open. Firefox disconnects extension pages that belong to the previous runtime.

To create a distributable archive:

```bash
npm run package
```

The archive is written to `article-reader-firefox.zip` and intentionally ignored by Git.

## Development commands

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run package
```

## Optional cloud providers

Open **Extension settings** and choose a provider only if you want cloud processing.

### Google Cloud Translation

Provide a Google Cloud API key with Cloud Translation Basic v2 enabled. Restrict the key to the Translation API and configure a quota before using it.

### OpenAI-compatible

Provide a complete Chat Completions endpoint, model name, and API key. The endpoint must return content in `choices[0].message.content`.

The extension requests host permission for the configured endpoint and requires explicit consent before sending selected text to a cloud provider.
Firefox also requests its optional `websiteContent` and `authenticationInfo` data permissions. Revoking either permission in `about:addons` immediately prevents further cloud requests until the user grants permission again. Local tools do not require these permissions.

## Privacy and security

- Articles, highlights, notes, translations, and AI results are stored in the local Firefox profile.
- In the default local modes, article text never leaves the device.
- Mozilla receives ordinary model-catalog and model-file requests, not article text.
- Cloud processing is opt-in and only runs after a direct user action.
- Firefox's built-in data-consent prompt controls optional transmission of website text and provider credentials.
- Private Browsing is disabled for this release, so private-window activity cannot be read or stored by the extension.
- Provider output is rendered as text, never executed as HTML.
- Extracted article markup is sanitized before it reaches the reader.
- API keys are stored in `browser.storage.local`. Browser-extension storage is not a server-side secret vault, so use restricted and revocable keys.

## Permissions

| Permission | Why it is needed |
| --- | --- |
| `activeTab` | Read the page the user explicitly opens in Article Reader. |
| `tabs` | Find/update the active tab and return to the original article. |
| `scripting` | Inject the extractor into a page opened before the temporary extension was loaded. |
| `storage` | Store preferences and optional provider credentials locally. |
| `unlimitedStorage` | Cache on-device translation models. The extension enforces its own 128 MB model-cache limit. |
| `contextMenus` | Add Reader, translate, summarize, and explain actions to the Firefox context menu. |
| Mozilla model hosts | Download the official model catalog and model weights. Article text is never sent to these hosts. |
| Optional `http://*/*` / `https://*/*` | Access a cloud-provider endpoint selected and approved by the user. |

The manifest sets `incognito` to `not_allowed`; private tabs and windows are invisible to Article Reader.

## Architecture

```text
src/
├── background/   Message routing, context menus, providers, and same-tab Reader launch
├── content/      Readability extraction and sanitization
├── extraction/   Article and reference-link extraction
├── highlights/   Durable text anchors and highlight rendering
├── library/      Saved article library
├── options/      Local/cloud provider configuration
├── popup/       Quick actions for the active tab
├── providers/   Bergamot, local extractive tools, Google, and OpenAI-compatible clients
├── reader/       Reader UI, annotations, themes, code highlighting, and image viewer
├── storage/      IndexedDB and browser.storage repositories
└── shared/       Shared utilities
```

Vite builds the extension pages as ES modules and the Firefox background/content entries as standalone IIFEs for Manifest V3 compatibility.

## Known limitations

- Temporary add-ons are removed when Firefox restarts. Permanent distribution requires Mozilla signing.
- Firefox-protected pages and local files without permission cannot be extracted.
- Some highly dynamic pages do not expose stable article content to Readability.
- Translation quality varies by language pair and is generally below the largest cloud translation systems.
- On-device translation requires WebAssembly SIMD support.
- Very large page changes can prevent an old highlight anchor from being rendered, although its saved data is retained.

## Contributing

Issues and pull requests are welcome. Please run `npm run typecheck`, `npm run lint`, and `npm test` before submitting changes.

## License

The original Article Reader source is released under the [MIT License](LICENSE). Bundled and compiled third-party components retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

See the full [Privacy Policy](PRIVACY.md) for data handling and optional cloud-provider details.
