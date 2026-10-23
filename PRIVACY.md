# Article Reader Privacy Policy

**Effective date:** October 24, 2026  
**Applies to:** Article Reader for Firefox, version 1.0.0 and later

Article Reader is designed as a local-first browser extension. It does not include analytics, advertising, tracking pixels, a developer-operated backend, or a developer-owned AI or translation account.

## Local processing and storage

The following information stays in the user's Firefox profile and is not transmitted by Article Reader:

- extracted article content and article metadata;
- saved articles, highlights, notes, references, and reading preferences;
- locally generated summaries and key points;
- translations performed by the on-device provider;
- on-device translation model files and model-cache metadata; and
- optional provider settings and credentials stored through `browser.storage.local`.

Removing the extension normally removes its extension-owned local storage. Firefox profile management, backups, and synchronization are controlled by Firefox and the user.

## On-device translation model downloads

When a language model is not already cached, Article Reader downloads the model catalog and model files from Mozilla's Firefox Remote Settings services. Article text is not included in these requests.

Like any network request, Mozilla and its delivery providers may receive standard connection information such as the user's IP address, user agent, requested file, and request time. Their handling of that information is governed by their own privacy policies.

## Optional cloud providers

Cloud processing is disabled unless the user selects and configures a cloud provider, confirms the in-extension disclosure, grants Firefox's optional data permissions, and directly requests a translation or AI operation.

Depending on the selected feature, Article Reader may send the following information to the provider selected by the user:

- **Website content:** the selected text or a length-limited portion of the current article needed for the requested translation or AI operation.
- **Authentication information:** the API key or provider credential entered by the user.
- **Request settings:** the selected model, source and target languages, and operation instructions needed to perform the request.

Article Reader supports Google Cloud Translation and user-configured OpenAI-compatible endpoints. It does not proxy these requests through a server controlled by the Article Reader developer. The selected provider receives the request directly, and that provider's terms, retention rules, and privacy policy apply.

Article Reader does not send unrelated browsing history, saved articles, highlights, notes, or other page content to a cloud provider.

## User choice and control

Users can avoid all article-content transmission by keeping the on-device translation provider and a local or disabled AI mode selected.

Users can stop cloud transmission at any time by:

- selecting a local provider in Article Reader settings;
- removing stored provider credentials;
- clearing the cloud-sharing confirmation; or
- revoking the optional website-content or authentication-information permission in Firefox's `about:addons` page.

Article Reader checks the relevant Firefox data permissions again before every cloud request. If either permission is missing or revoked, the request is blocked.

## Sharing, sale, and advertising

The Article Reader developer does not receive, sell, rent, or share user data. The extension contains no advertising or behavioral analytics.

## Security

Extracted article markup is sanitized before display. Provider responses are rendered as text rather than executable HTML. API credentials remain in the local Firefox extension profile, but browser extension storage is not a dedicated secret vault; users should use restricted, revocable credentials with appropriate quotas.

## Changes to this policy

Material changes will be documented in the project repository and, when required, presented through Firefox's permission or consent mechanisms before newly covered information is transmitted.

## Contact

Questions and privacy requests can be submitted through the project's public issue tracker:

https://github.com/ColdTears619/article-reader-firefox/issues
