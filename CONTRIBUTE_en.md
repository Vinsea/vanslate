# Contributing and Forking Guide

This document is for developers who want to maintain, fork, or extend Vanslate. See [docs/README.md](./docs/README.md) for deeper module design, runtime boundaries, and release workflow notes.

## Development Setup

```bash
cd vanslate
npm install
```

Common commands:

```bash
npm run build          # Build extension entry scripts
npm test               # Run unit tests
npm run validate       # Check naming, temporary files, and product-page assets
npm run check          # Typecheck + build + unit tests + project validation
npm run package:chrome # Build and package Chrome zip/crx
```

Package outputs:

```text
packages/vanslate-unpacked/
packages/vanslate-1.1.0.zip
packages/vanslate-1.1.0.crx
```

The product-page download file is also copied to:

```text
vanslate/website/downloads/vanslate-1.1.0.zip
```

## Project Structure

```text
vanslate/
  src/
    core/       # Testable core logic
    entries/    # Browser extension entry points
  test/         # Unit tests
  scripts/      # Build, test, and package scripts
  website/      # Product, privacy, and support pages
  _locales/     # Manifest localization
```

## Architecture Rules

- Put core business logic in `src/core/`.
- Keep DOM operations and browser message routing in `src/entries/`.
- Inject browser APIs through adapters instead of coupling them to services.
- Prefer pure functions or small classes for testable logic.
- Add unit tests for new core behavior.

## Dependency Injection

`src/entries/background.ts` composes dependencies:

```ts
const translationService = new TranslationService(
  new BrowserSettingsRepository(ext),
  new BrowserTranslationCache(ext),
  new OpenAICompatibleChatClient(),
  new TabProgressSink(ext)
);
```

This allows model clients, cache storage, and progress sinks to be replaced without rewriting `TranslationService`.

## Adding a Model Protocol

The default client is `OpenAICompatibleChatClient`, compatible with Chat Completions.

To add another protocol:

1. Implement the `ChatClient` interface in `src/core/chat-client.ts`.
2. Replace the injected client in `src/entries/background.ts`.
3. Add unit tests for request construction and response parsing.

## Adding a Built-in Selection Tool

Edit:

```text
src/core/defaults.ts
```

Add an item to `DEFAULT_SELECTION_TOOLS`:

```ts
{
  id: "my_tool",
  name: "My Tool",
  enabled: true,
  modelMode: "inherit",
  baseUrl: "",
  apiKey: "",
  model: "",
  activeModel: "",
  models: "",
  systemPrompt: "You are a helpful assistant.",
  userPrompt: "Process the following text in {targetLanguage}:\n\n{text}"
}
```

Common placeholders:

```text
{text}
{sourceLanguage}
{targetLanguage}
{glossary}
{url}
```

## Page Translation Prompts

Page prompts are used for full-page translation, auto translation, and virtual-scroll continuation. The user prompt must keep the JSON output contract:

```json
{"translations":["..."]}
```

Without this contract, the content script cannot reliably render translations segment by segment.

## Localization

UI strings:

```text
src/entries/i18n.ts
```

Manifest name and description:

```text
_locales/{locale}/messages.json
```

After adding a locale, test the options page, popup, and content-script overlays.

## Tests

Current test entry:

```text
test/core.test.ts
```

Covered behavior:

- Glossary parsing.
- Prompt placeholder rendering.
- Model JSON output parsing.
- Target-language skip heuristics.
- Selection-tool normalization.
- Translation-service cache, skip, and per-item progress flow.

Add tests for new core behavior whenever possible.

`npm run validate` checks:

- Temporary files such as `.tmp-tests` and `.DS_Store`.
- Old project slugs in active code and docs.
- Complete Chinese/English product-page i18n keys.
- The `.zip` file used by the product-page download link.

## Release Checklist

```bash
npm run check
npm run package:chrome
```

Then verify:

- `packages/vanslate-unpacked` can be loaded by Chrome `Load unpacked`.
- `packages/vanslate-1.1.0.zip` passes archive validation.
- `website/downloads/vanslate-1.1.0.zip` is synced.
- Privacy and support pages are accurate.
