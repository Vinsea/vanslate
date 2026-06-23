# Vanslate

Vanslate is an AI context translator and verbalizer browser extension. It does not bundle a model service. Users provide their own OpenAI-compatible `Base URL`, `API Key`, and model name in settings.

Subtitle: **Vanslate - AI Context Translator & Verbalizer**

## Features

- Full-page translation while preserving original page content.
- Segment-by-segment rendering as soon as each block is translated.
- Selection tools: translate, beginner explanation, professional explanation, summarize, rewrite, technicalize, casualize, academicize, and code-comment style.
- Custom tools with editable names, prompts, models, API URLs, and API keys.
- Auto-translation URL rules with wildcard and regex support.
- Glossary support with `source => target` terms.
- Local cache and limited retry for network/rate-limit failures.
- Virtual-scroll continuation for newly rendered content.
- Multilingual UI for Chinese, English, Japanese, Korean, French, German, Spanish, and more.
- Chrome MV3 with a Firefox temporary-debug manifest.

## Usage

For local Chrome testing:

```bash
cd vanslate
npm install
npm run package:chrome
```

Open `chrome://extensions`, enable `Developer mode`, click `Load unpacked`, and select:

```text
packages/vanslate-unpacked
```

First run:

1. Open the extension options page.
2. Fill in an OpenAI-compatible `Base URL`, `API Key`, model list, and default model.
3. Configure target language, glossary, auto-translation rules, and selection tools as needed.
4. Click the floating Vanslate button on a page, or use the popup/context menu to translate the full page.

The API must be compatible with:

```text
POST {Base URL}/chat/completions
Authorization: Bearer {API Key}
```

Remote APIs must use HTTPS; `localhost` is allowed for local development.

## Development

See [CONTRIBUTE.md](./CONTRIBUTE.md) and [CONTRIBUTE_en.md](./CONTRIBUTE_en.md).  
Detailed design docs: [docs/README.md](./docs/README.md).  
Changelog: [changelog.md](./changelog.md).
