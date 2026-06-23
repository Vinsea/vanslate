"use strict";
(() => {
  // src/core/defaults.ts
  var DEFAULT_TRANSLATION_SYSTEM_PROMPT = [
    "You are Vanslate, a precise AI context translator and verbalizer.",
    "Return only valid JSON for page translation tasks."
  ].join("\n");
  var DEFAULT_TRANSLATION_USER_PROMPT = [
    "Translate each item {sourceLanguagePrompt} into {targetLanguage}.",
    "Keep meaning, URLs, numbers, code, punctuation intent, and proper nouns accurate.",
    "Keep the output natural for a bilingual web reading experience.",
    "Keep compact number+unit or number+currency tokens unchanged, such as 2MB, 3RMB, 15GB, 20ms, and 10USD.",
    "Keep standalone numbers, versions, dates, times, URLs, emails, file paths, commands, keyboard shortcuts, hashes, IDs, selectors, and dimensions unchanged.",
    'If an item contains simple inline HTML tags such as <strong>, <em>, <b>, <i>, <code>, <mark>, <sub>, <sup>, or <span style="color:red">, preserve the same tags and safe inline styles around the corresponding translated text.',
    "If an item mixes the target language with other languages, keep the parts already in the target language unchanged and translate only the non-target-language parts.",
    "If a short technical token, product name, URL, API name, model name, variable, or code-like fragment is already suitable in the target-language context, keep it unchanged.",
    "{glossaryBlock}",
    'Return only JSON in this exact shape: {"translations":["..."]}.',
    "The translations array length must match the input array length.",
    "",
    "{textsJson}"
  ].join("\n");
  var DEFAULT_SELECTION_TOOLS = [
    {
      id: "translate",
      name: "\u7FFB\u8BD1",
      enabled: true,
      modelMode: "inherit",
      baseUrl: "",
      apiKey: "",
      model: "",
      activeModel: "",
      models: "",
      systemPrompt: "You are Vanslate, a precise AI context translator. Answer in Markdown.",
      userPrompt: "\u5C06\u4E0B\u9762\u6587\u672C\u7FFB\u8BD1\u6210{targetLanguage}\u3002\u5982\u679C\u5185\u5BB9\u5DF2\u5305\u542B{targetLanguage}\uFF0C\u4FDD\u7559\u5DF2\u662F\u76EE\u6807\u8BED\u8A00\u7684\u90E8\u5206\uFF0C\u53EA\u7FFB\u8BD1\u5176\u4ED6\u8BED\u8A00\u90E8\u5206\u3002\n\n{text}"
    },
    {
      id: "eli5",
      name: "\u5C0F\u767D\u89E3\u91CA",
      enabled: true,
      modelMode: "inherit",
      baseUrl: "",
      apiKey: "",
      model: "",
      activeModel: "",
      models: "",
      systemPrompt: "You explain complex content to beginners. Answer in clear Markdown.",
      userPrompt: "\u7528\u5C0F\u767D\u4E5F\u80FD\u7406\u89E3\u7684\u65B9\u5F0F\u89E3\u91CA\u4E0B\u9762\u5185\u5BB9\uFF0C\u4F7F\u7528{targetLanguage}\uFF1A\n\n{text}"
    },
    {
      id: "professional_explain",
      name: "\u4E13\u4E1A\u89E3\u91CA",
      enabled: true,
      modelMode: "inherit",
      baseUrl: "",
      apiKey: "",
      model: "",
      activeModel: "",
      models: "",
      systemPrompt: "You are a domain expert. Explain with precision and useful structure. Answer in Markdown.",
      userPrompt: "\u8BF7\u7528\u4E13\u4E1A\u4F46\u6E05\u6670\u7684\u65B9\u5F0F\u89E3\u91CA\u4E0B\u9762\u5185\u5BB9\uFF0C\u4F7F\u7528{targetLanguage}\uFF1A\n\n{text}"
    },
    {
      id: "summarize",
      name: "\u603B\u7ED3",
      enabled: true,
      modelMode: "inherit",
      baseUrl: "",
      apiKey: "",
      model: "",
      activeModel: "",
      models: "",
      systemPrompt: "You summarize text faithfully and concisely. Answer in Markdown.",
      userPrompt: "\u8BF7\u603B\u7ED3\u4E0B\u9762\u5185\u5BB9\uFF0C\u63D0\u70BC\u5173\u952E\u70B9\uFF0C\u4F7F\u7528{targetLanguage}\uFF1A\n\n{text}"
    },
    {
      id: "rewrite",
      name: "\u6539\u5199",
      enabled: true,
      modelMode: "inherit",
      baseUrl: "",
      apiKey: "",
      model: "",
      activeModel: "",
      models: "",
      systemPrompt: "You rewrite text while preserving meaning. Answer only with the rewritten content in Markdown.",
      userPrompt: "\u8BF7\u6539\u5199\u4E0B\u9762\u5185\u5BB9\uFF0C\u4F7F\u8868\u8FBE\u66F4\u6E05\u6670\u81EA\u7136\uFF0C\u4F7F\u7528{targetLanguage}\uFF1A\n\n{text}"
    },
    {
      id: "technicalize",
      name: "\u6280\u672F\u5316",
      enabled: true,
      modelMode: "inherit",
      baseUrl: "",
      apiKey: "",
      model: "",
      activeModel: "",
      models: "",
      systemPrompt: "You turn casual content into precise technical writing. Answer in Markdown.",
      userPrompt: "\u8BF7\u628A\u4E0B\u9762\u5185\u5BB9\u6539\u5199\u4E3A\u66F4\u6280\u672F\u5316\u3001\u51C6\u786E\u3001\u7ED3\u6784\u6E05\u6670\u7684\u8868\u8FBE\uFF0C\u4F7F\u7528{targetLanguage}\uFF1A\n\n{text}"
    },
    {
      id: "casualize",
      name: "\u53E3\u8BED\u5316",
      enabled: true,
      modelMode: "inherit",
      baseUrl: "",
      apiKey: "",
      model: "",
      activeModel: "",
      models: "",
      systemPrompt: "You make text conversational and easy to read. Answer in Markdown.",
      userPrompt: "\u8BF7\u628A\u4E0B\u9762\u5185\u5BB9\u6539\u5199\u5F97\u66F4\u53E3\u8BED\u5316\u3001\u81EA\u7136\u3001\u5BB9\u6613\u7406\u89E3\uFF0C\u4F7F\u7528{targetLanguage}\uFF1A\n\n{text}"
    },
    {
      id: "academicize",
      name: "\u5B66\u672F\u5316",
      enabled: true,
      modelMode: "inherit",
      baseUrl: "",
      apiKey: "",
      model: "",
      activeModel: "",
      models: "",
      systemPrompt: "You rewrite text in a formal academic style. Answer in Markdown.",
      userPrompt: "\u8BF7\u628A\u4E0B\u9762\u5185\u5BB9\u6539\u5199\u4E3A\u66F4\u5B66\u672F\u5316\u3001\u4E25\u8C28\u7684\u8868\u8FBE\uFF0C\u4F7F\u7528{targetLanguage}\uFF1A\n\n{text}"
    },
    {
      id: "code_comment",
      name: "\u4EE3\u7801\u6CE8\u91CA\u5316",
      enabled: true,
      modelMode: "inherit",
      baseUrl: "",
      apiKey: "",
      model: "",
      activeModel: "",
      models: "",
      systemPrompt: "You explain code or technical snippets with concise comments and notes. Answer in Markdown.",
      userPrompt: "\u8BF7\u628A\u4E0B\u9762\u5185\u5BB9\u6574\u7406\u4E3A\u9002\u5408\u4EE3\u7801\u6CE8\u91CA\u6216\u6280\u672F\u6CE8\u91CA\u7684\u8BF4\u660E\uFF0C\u4F7F\u7528{targetLanguage}\u3002\u5982\u679C\u662F\u4EE3\u7801\uFF0C\u8BF7\u4FDD\u7559\u4EE3\u7801\u542B\u4E49\u5E76\u89E3\u91CA\u5173\u952E\u903B\u8F91\uFF1A\n\n{text}"
    }
  ];
  var DEFAULT_COLLECTION_RULES = {
    blockTags: ["H1", "H2", "H3", "H4", "H5", "H6", "P", "LI", "BLOCKQUOTE", "FIGCAPTION", "TD", "TH", "DT", "DD"],
    formTags: ["LABEL", "LEGEND", "CAPTION", "SUMMARY"],
    supplementalTags: ["DIV", "SPAN"],
    supplementalContextPattern: "comment|comments|cmtx|review|feedback|discussion|reply",
    metadataPattern: "avatar|gravatar|author|user(name)?|date|time|timestamp|count|rating|stars|captcha|honeypot|pagination|page_number"
  };
  var DEFAULT_SKIP_RULES = {
    enabled: true,
    patterns: [
      "^[+-]?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:[.,]\\d+)?%?$",
      "^[+-]?\\d+(?:[.,]\\d+)?\\s?(?:[A-Za-z]{1,8}|[%\xB0\u2103\u2109\xA5$\u20AC\xA3\u20BD\u20B9\u20A9])$",
      "^[vV]?\\d+(?:\\.\\d+){1,4}(?:[-_+][A-Za-z0-9][A-Za-z0-9._-]*)?$",
      "^(?:alpha|beta|rc|release|stable|nightly|canary|dev|preview)(?:[-_ ]?\\d+)?$",
      "^\\d{4}[-/.\u5E74]\\d{1,2}(?:[-/.\u6708]\\d{1,2}\u65E5?)?$",
      "^\\d{1,2}[-/.]\\d{1,2}(?:[-/.]\\d{2,4})?$",
      "^\\d{1,2}:\\d{2}(?::\\d{2})?(?:\\s?(?:AM|PM))?$",
      "^(?:UTC|GMT)[+-]\\d{1,2}(?::?\\d{2})?$",
      "^(?:https?:\\/\\/|www\\.)\\S+$",
      "^[\\w.!#$%&'*+/=?^`{|}~-]+@[\\w-]+(?:\\.[\\w-]+)+$",
      "^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+(?:\\/\\S*)?$",
      "^(?:[A-Za-z]:\\\\|\\/|\\.\\.?\\/|~\\/).+",
      "^[\\w.-]+\\.(?:md|txt|json|ya?ml|toml|ini|env|js|mjs|cjs|ts|tsx|jsx|css|scss|html?|xml|svg|png|jpe?g|gif|webp|pdf|zip|tar|gz|7z|rar|exe|dmg|pkg|crx|xpi)$",
      "^(?:npm|pnpm|yarn|bun|git|node|python|python3|pip|uv|docker|kubectl|npx|deno)(?:\\s+[-\\w./:@=]+){0,8}$",
      "^--?[A-Za-z0-9][\\w-]*(?:=\\S+)?$",
      "^[A-Z_][A-Z0-9_]*=\\S+$",
      "^(?:true|false|null|undefined|NaN|Infinity)$",
      "^(?:[a-f0-9]{7,64}|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$",
      "^(?:sk|pk|ghp|gho|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{8,}$",
      "^Bearer\\s+\\S+$",
      "^(?:Ctrl|Control|Cmd|Command|Alt|Option|Shift|Meta|Win|Super)(?:\\s*\\+\\s*(?:Ctrl|Control|Cmd|Command|Alt|Option|Shift|Meta|Win|Super|[A-Za-z0-9]|F\\d{1,2}|Tab|Enter|Return|Esc|Escape|Space|Backspace|Delete|Home|End|PageUp|PageDown|Arrow(?:Up|Down|Left|Right)|Up|Down|Left|Right))+$",
      "^(?:\u2318|\u21E7|\u2325|\u2303)(?:\\s*\\+?\\s*(?:[A-Za-z0-9]|F\\d{1,2}|Tab|Enter|Return|Esc|Escape|Space|Backspace|Delete|\u2318|\u21E7|\u2325|\u2303))+$",
      "^\\d{2,5}\\s*[x\xD7]\\s*\\d{2,5}(?:\\s*[x\xD7]\\s*\\d{1,5})?$",
      "^\\d+(?:\\.\\d+)?\\s*:\\s*\\d+(?:\\.\\d+)?$",
      "^O\\([^)]{1,32}\\)$",
      "^<\\/?[a-z][\\w:-]*(?:\\s[^>]*)?>$",
      "^[.#][A-Za-z_-][\\w-]*$",
      "^:[A-Za-z-]+$",
      "^[A-Za-z-]+\\s*:\\s*[^;]+;?$",
      "^(?:RTX|GTX)\\s?\\d{3,5}(?:\\s?(?:Ti|SUPER))?$",
      "^(?:M\\d|A\\d{2})(?:\\s?(?:Pro|Max|Ultra))?$",
      "^(?:USB-C|Wi-?Fi\\s?\\dE?|Bluetooth\\s?\\d(?:\\.\\d)?)$"
    ]
  };
  var DEFAULT_SETTINGS = {
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-4o-mini",
    models: "gpt-4o-mini\n",
    activeModel: "gpt-4o-mini",
    uiLanguage: "zh-CN",
    sourceLanguage: "auto",
    targetLanguage: "\u4E2D\u6587",
    preserveOriginal: true,
    renderMode: "inline",
    translationColorEnabled: false,
    translationColor: "",
    translationCss: "",
    enableCache: true,
    enableAutoTranslate: false,
    autoTranslateRules: "",
    glossary: "",
    retryCount: 2,
    enableFloatingBall: true,
    floatingBallMode: "always",
    floatingBallPosition: {
      side: "right",
      top: 0.42
    },
    translationSystemPrompt: "",
    translationUserPrompt: "",
    collectionRules: DEFAULT_COLLECTION_RULES,
    skipRules: DEFAULT_SKIP_RULES,
    selectionTools: []
  };

  // src/core/storage-keys.ts
  var STORAGE_KEY_PREFIX = "vv_vanslate_";
  var CRYPTO_SECRET_KEY = "cryptoSecret";
  var ENCRYPTED_PREFIX = "vvenc1:";
  function storageKey(key) {
    return key.startsWith(STORAGE_KEY_PREFIX) ? key : `${STORAGE_KEY_PREFIX}${key}`;
  }
  function storageKeys(keys) {
    return keys.map(storageKey);
  }
  async function readStorageValues(area, keys) {
    const stored = await area.get(storageKeys(keys));
    const output = {};
    for (const key of keys) {
      const prefixedKey = storageKey(key);
      if (stored[prefixedKey] !== void 0) output[key] = await decryptStorageValue(area, key, stored[prefixedKey]);
    }
    return output;
  }
  async function writeStorageValues(area, values) {
    const prefixed = {};
    for (const [key, value] of Object.entries(values)) {
      prefixed[storageKey(key)] = await encryptStorageValue(area, key, value);
    }
    await area.set(prefixed);
  }
  function shouldEncryptStorageKey(key) {
    return key === "apiKey";
  }
  async function encryptStorageValue(area, key, value) {
    if (shouldEncryptStorageKey(key)) return encryptSecretString(area, String(value || ""));
    if (key === "selectionTools" && Array.isArray(value)) {
      return Promise.all(value.map(async (tool) => {
        if (!tool || typeof tool !== "object") return tool;
        const record = { ...tool };
        record.apiKey = await encryptSecretString(area, String(record.apiKey || ""));
        return record;
      }));
    }
    return value;
  }
  async function decryptStorageValue(area, key, value) {
    if (shouldEncryptStorageKey(key)) return decryptSecretString(area, value);
    if (key === "selectionTools" && Array.isArray(value)) {
      return Promise.all(value.map(async (tool) => {
        if (!tool || typeof tool !== "object") return tool;
        const record = { ...tool };
        record.apiKey = await decryptSecretString(area, record.apiKey);
        return record;
      }));
    }
    return value;
  }
  async function encryptSecretString(area, value) {
    const text = String(value || "");
    if (!text) return "";
    const crypto = globalThis.crypto;
    if (!crypto?.subtle) throw new Error("Web Crypto is required to encrypt API keys.");
    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);
    const key = await importCryptoKey(area);
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv) },
      key,
      toArrayBuffer(new TextEncoder().encode(text))
    );
    return `${ENCRYPTED_PREFIX}${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
  }
  async function decryptSecretString(area, value) {
    const text = String(value || "");
    if (!text || !text.startsWith(ENCRYPTED_PREFIX)) return text;
    const crypto = globalThis.crypto;
    if (!crypto?.subtle) return "";
    try {
      const [ivText, payloadText] = text.slice(ENCRYPTED_PREFIX.length).split(".");
      if (!ivText || !payloadText) return "";
      const key = await importCryptoKey(area);
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: toArrayBuffer(base64ToBytes(ivText)) },
        key,
        toArrayBuffer(base64ToBytes(payloadText))
      );
      return new TextDecoder().decode(decrypted);
    } catch {
      return "";
    }
  }
  async function importCryptoKey(area) {
    const crypto = globalThis.crypto;
    if (!crypto?.subtle) throw new Error("Web Crypto is required to encrypt API keys.");
    const secret = await getOrCreateSecret(area);
    return crypto.subtle.importKey("raw", toArrayBuffer(base64ToBytes(secret)), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  }
  async function getOrCreateSecret(area) {
    const key = storageKey(CRYPTO_SECRET_KEY);
    const stored = await area.get([key]);
    const existing = String(stored?.[key] || "");
    if (existing) return existing;
    const bytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(bytes);
    const secret = bytesToBase64(bytes);
    await area.set({ [key]: secret });
    return secret;
  }
  function bytesToBase64(bytes) {
    if (typeof btoa === "function") {
      let binary = "";
      bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
      });
      return btoa(binary);
    }
    const buffer = globalThis.Buffer;
    if (!buffer) throw new Error("Base64 encoding is unavailable.");
    return buffer.from(bytes).toString("base64");
  }
  function base64ToBytes(value) {
    if (typeof atob === "function") {
      return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
    }
    const buffer = globalThis.Buffer;
    if (!buffer) throw new Error("Base64 decoding is unavailable.");
    return new Uint8Array(buffer.from(value, "base64"));
  }
  function toArrayBuffer(bytes) {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }

  // src/core/utils.ts
  function compact(value) {
    return Object.fromEntries(
      Object.entries(value || {}).filter(([, item]) => item !== void 0 && item !== null)
    );
  }
  function normalizeModelsText(value) {
    return String(value || "").split(/\n+/).map((item) => item.trim()).filter(Boolean).join("\n");
  }
  function firstModel(modelsText) {
    return String(modelsText || "").split(/\n+/).map((item) => item.trim()).find(Boolean) || "";
  }
  function normalizeSelectionTools(value) {
    let tools = value;
    if (typeof tools === "string") {
      try {
        tools = JSON.parse(tools);
      } catch {
        tools = [];
      }
    }
    if (!Array.isArray(tools) || !tools.length) tools = DEFAULT_SELECTION_TOOLS;
    const toolList = tools;
    const normalized = toolList.map((tool, index) => {
      const models = normalizeModelsText(tool?.models || tool?.model || "");
      const model = String(tool?.activeModel || tool?.model || firstModel(models) || "").trim();
      return {
        id: String(tool?.id || `tool_${index + 1}`).trim().replace(/[^\w-]+/g, "_"),
        name: String(tool?.name || `\u5DE5\u5177 ${index + 1}`).trim(),
        enabled: tool?.enabled !== false,
        modelMode: tool?.modelMode === "custom" ? "custom" : "inherit",
        baseUrl: String(tool?.baseUrl || "").trim().replace(/\/+$/, ""),
        apiKey: String(tool?.apiKey || "").trim(),
        model,
        activeModel: model,
        models,
        systemPrompt: String(tool?.systemPrompt || "").trim(),
        userPrompt: String(tool?.userPrompt || "").trim()
      };
    }).filter((tool) => tool.id && tool.name && tool.userPrompt);
    return normalized.length ? normalized : DEFAULT_SELECTION_TOOLS;
  }
  function resolveToolModelSettings(settings, tool) {
    if (tool?.modelMode !== "custom") {
      return {
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        model: settings.activeModel || settings.model
      };
    }
    return {
      baseUrl: tool.baseUrl || settings.baseUrl,
      apiKey: tool.apiKey || settings.apiKey,
      model: tool.activeModel || tool.model || firstModel(tool.models) || settings.activeModel || settings.model
    };
  }
  function validateModelSettings(settings) {
    if (!settings.baseUrl) throw new Error("Base URL is required.");
    if (!settings.apiKey) throw new Error("API key is required. Open extension options first.");
    if (!settings.model) throw new Error("Model is required.");
    if (!isSecureApiBaseUrl(settings.baseUrl)) {
      throw new Error("Base URL must use HTTPS. HTTP is only allowed for localhost development.");
    }
  }
  function parseTranslations(content) {
    if (!content) throw new Error("The model returned an empty response.");
    const cleaned = extractJson(String(content).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, ""));
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed.translations)) {
      throw new Error("The model response does not contain translations[].");
    }
    return parsed.translations.map((item) => String(item || "").trim());
  }
  function extractJson(text) {
    if (text.startsWith("{") && text.endsWith("}")) return text;
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return text.slice(start, end + 1);
    return text;
  }
  function parseGlossary(value) {
    return String(value || "").split(/\n+/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const [source = "", ...rest] = line.split(/\s*(?:=>|=|,)\s*/);
      return { source: source.trim(), target: rest.join(" ").trim() };
    }).filter((item) => item.source && item.target);
  }
  function renderTemplate(template, values) {
    return String(template || "").replace(/\{(\w+)\}/g, (match, key) => {
      if (values[key] === void 0 || values[key] === null) return match;
      return String(values[key]);
    });
  }
  function buildToolMessages(tool, promptVars) {
    return [
      {
        role: "system",
        content: renderTemplate(tool.systemPrompt, promptVars)
      },
      {
        role: "user",
        content: renderTemplate(tool.userPrompt, promptVars)
      }
    ];
  }
  function normalizeInputItem(item, index) {
    if (item && typeof item === "object") {
      const record = item;
      return {
        id: String(record.id || `i${index}`),
        text: String(record.text || "").trim(),
        index
      };
    }
    return {
      id: `i${index}`,
      text: String(item || "").trim(),
      index
    };
  }
  function cacheKey(text, settings) {
    return hashString([
      settings.baseUrl,
      settings.model,
      settings.sourceLanguage,
      settings.targetLanguage,
      settings.glossary,
      settings.translationSystemPrompt,
      settings.translationUserPrompt,
      text
    ].join("\n"));
  }
  function sourceLanguagePrompt(sourceLanguage) {
    const source = String(sourceLanguage || "auto").trim();
    return !source || source.toLowerCase() === "auto" ? "from the detected source language" : `from ${source}`;
  }
  function shouldSkipTranslation(text, settings) {
    if (matchesTranslationSkipRule(text, settings.skipRules)) return true;
    const target = normalizeLanguageName(settings.targetLanguage);
    const source = normalizeLanguageName(settings.sourceLanguage);
    const stats = languageStats(text);
    const meaningfulLatinWords = stats.latinWords.filter((word) => !isProtectedLatinToken(word));
    const nonLatinSourceChars = stats.han + stats.kana + stats.hangul + stats.cyrillic;
    if (target === "zh") {
      return stats.han >= 2 && stats.kana === 0 && stats.hangul === 0 && stats.cyrillic === 0 && meaningfulLatinWords.length === 0;
    }
    if (target === "ja") {
      return stats.kana >= 2 && stats.hangul === 0 && stats.cyrillic === 0 && meaningfulLatinWords.length === 0;
    }
    if (target === "ko") {
      return stats.hangul >= 2 && stats.kana === 0 && stats.cyrillic === 0 && meaningfulLatinWords.length === 0;
    }
    if (target === "en") {
      if (source && source !== "auto" && source !== "en") return false;
      return nonLatinSourceChars === 0 && looksLikeEnglish(stats.latinWords);
    }
    return false;
  }
  function normalizeTranslationSkipRules(value) {
    const source = value && typeof value === "object" ? value : {};
    const patterns = Array.isArray(source.patterns) ? source.patterns : DEFAULT_SKIP_RULES.patterns;
    const normalizedPatterns = patterns.map((pattern) => String(pattern || "").trim()).filter(Boolean);
    return {
      enabled: source.enabled !== false,
      patterns: normalizedPatterns.length ? Array.from(new Set(normalizedPatterns)) : DEFAULT_SKIP_RULES.patterns
    };
  }
  var compiledSkipRulesCache = /* @__PURE__ */ new Map();
  function matchesTranslationSkipRule(text, value) {
    const source = String(text || "").trim();
    if (!source) return false;
    const rules = normalizeTranslationSkipRules(value);
    if (!rules.enabled) return false;
    return getCompiledSkipRules(rules).some((pattern) => pattern.test(source));
  }
  function getCompiledSkipRules(rules) {
    const cacheKey2 = JSON.stringify(rules.patterns);
    const cached = compiledSkipRulesCache.get(cacheKey2);
    if (cached) return cached;
    const compiled = rules.patterns.map(compileSkipPattern);
    compiledSkipRulesCache.set(cacheKey2, compiled);
    return compiled;
  }
  function compileSkipPattern(pattern) {
    const value = String(pattern || "").trim();
    const match = value.match(/^\/(.+)\/([dgimsuvy]*)$/);
    if (match?.[1]) return new RegExp(match[1], String(match[2] || "").replace(/[gy]/g, ""));
    return new RegExp(value, "i");
  }
  function normalizeLanguageName(value) {
    const text = String(value || "").trim().toLowerCase();
    if (!text || text === "auto" || text === "\u81EA\u52A8") return "auto";
    if (/^(zh|zh-cn|zh_cn|chinese|中文|简体中文|繁體中文|汉语|漢語)$/.test(text)) return "zh";
    if (/^(en|en-us|en_us|english|英文|英语)$/.test(text)) return "en";
    if (/^(ja|jp|japanese|日本語|日语|日文)$/.test(text)) return "ja";
    if (/^(ko|kr|korean|한국어|韩语|韓語)$/.test(text)) return "ko";
    return text;
  }
  function languageStats(text) {
    const value = String(text || "");
    return {
      han: countMatches(value, /[\u3400-\u9fff]/g),
      kana: countMatches(value, /[\u3040-\u30ff]/g),
      hangul: countMatches(value, /[\uac00-\ud7af]/g),
      cyrillic: countMatches(value, /[\u0400-\u04ff]/g),
      latinWords: value.match(/[A-Za-z][A-Za-z'-]*/g) || []
    };
  }
  function normalizeUsage(usage) {
    const record = usage || {};
    return {
      prompt_tokens: Number(record.prompt_tokens) || 0,
      completion_tokens: Number(record.completion_tokens) || 0,
      total_tokens: Number(record.total_tokens) || 0
    };
  }
  function zeroUsage() {
    return normalizeUsage(null);
  }
  function addUsage(left, right) {
    return {
      prompt_tokens: (Number(left?.prompt_tokens) || 0) + (Number(right?.prompt_tokens) || 0),
      completion_tokens: (Number(left?.completion_tokens) || 0) + (Number(right?.completion_tokens) || 0),
      total_tokens: (Number(left?.total_tokens) || 0) + (Number(right?.total_tokens) || 0)
    };
  }
  function extractReasoning(message) {
    return String(
      message?.reasoning || message?.reasoning_content || message?.thinking || message?.thoughts || ""
    ).trim();
  }
  function joinUrl(baseUrl, path) {
    return `${String(baseUrl).replace(/\/+$/, "")}${path}`;
  }
  function isQuotaLimit(error) {
    const record = error;
    return record?.status === 429 || /quota|rate.?limit|too many requests|insufficient_quota/i.test(readableError(error));
  }
  function readableError(error) {
    return error instanceof Error ? error.message : String(error);
  }
  function redact(settings) {
    return {
      ...settings,
      apiKey: settings.apiKey ? "configured" : "",
      selectionTools: normalizeSelectionTools(settings.selectionTools).map((tool) => ({
        ...tool,
        apiKey: tool.apiKey ? "configured" : ""
      }))
    };
  }
  function looksLikeEnglish(words) {
    const normalizedWords = words.map((word) => word.toLowerCase()).filter((word) => word.length >= 2);
    if (normalizedWords.length < 2) return false;
    const stopwords = /* @__PURE__ */ new Set([
      "a",
      "an",
      "and",
      "are",
      "as",
      "at",
      "be",
      "by",
      "can",
      "for",
      "from",
      "has",
      "have",
      "how",
      "in",
      "is",
      "it",
      "of",
      "on",
      "or",
      "that",
      "the",
      "this",
      "to",
      "using",
      "was",
      "we",
      "with",
      "you",
      "your"
    ]);
    return normalizedWords.some((word) => stopwords.has(word)) || normalizedWords.length >= 5;
  }
  function isProtectedLatinToken(word) {
    const value = String(word || "");
    const lower = value.toLowerCase();
    if (value.length <= 1) return true;
    if (/^(api|base|url|uri|key|token|json|html|css|http|https|sdk|id|ui|ux|faq|llm|ai|ml)$/.test(lower)) return true;
    if (/^(openai|chatgpt|codex|vanslate|github|chrome|firefox|safari|edge)$/.test(lower)) return true;
    if (/^(gpt|claude|gemini|deepseek|qwen|llama|mistral)/.test(lower)) return true;
    if (/[0-9_./:-]/.test(value)) return true;
    if (/^[A-Z]{2,}$/.test(value)) return true;
    return false;
  }
  function countMatches(value, pattern) {
    const matches = String(value || "").match(pattern);
    return matches ? matches.length : 0;
  }
  function hashString(value) {
    let hash = 5381;
    for (let index = 0; index < value.length; index += 1) {
      hash = hash * 33 ^ value.charCodeAt(index);
    }
    return `k${(hash >>> 0).toString(36)}`;
  }
  function isSecureApiBaseUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol === "https:") return true;
      if (url.protocol !== "http:") return false;
      return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    } catch {
      return false;
    }
  }

  // src/core/browser-adapters.ts
  var CACHE_KEY = "vv_vanslate_translation_cache";
  var MAX_CACHE_ITEMS = 800;
  var INDEXED_DB_NAME = "vv-vanslate-cache-db";
  var INDEXED_DB_VERSION = 2;
  var CACHE_STORE_NAME = "vv_vanslation_cache";
  var CACHE_META_KEY = "vv_vanslate_translation_cache_meta";
  var BrowserSettingsRepository = class {
    constructor(ext2) {
      this.ext = ext2;
    }
    async getSettings() {
      const stored = await readStorageValues(this.ext.storage.local, Object.keys(DEFAULT_SETTINGS));
      const settings = { ...DEFAULT_SETTINGS, ...compact(stored) };
      settings.model = settings.activeModel || settings.model;
      settings.translationSystemPrompt = DEFAULT_TRANSLATION_SYSTEM_PROMPT;
      settings.translationUserPrompt = DEFAULT_TRANSLATION_USER_PROMPT;
      settings.skipRules = normalizeTranslationSkipRules(settings.skipRules);
      settings.selectionTools = normalizeSelectionTools(settings.selectionTools);
      return settings;
    }
  };
  var BrowserTranslationCache = class {
    constructor(ext2) {
      this.ext = ext2;
    }
    async getMany(keys) {
      const uniqueKeys = Array.from(new Set(keys.filter(Boolean)));
      if (!uniqueKeys.length) return {};
      const db = await openVanslateCacheDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(CACHE_STORE_NAME, "readonly");
        const store = tx.objectStore(CACHE_STORE_NAME);
        const output = {};
        uniqueKeys.forEach((key) => {
          const request = store.get(key);
          request.onsuccess = () => {
            const record = request.result;
            if (record?.translation) {
              output[key] = {
                translation: record.translation,
                updatedAt: Number(record.updatedAt) || 0
              };
            }
          };
        });
        tx.oncomplete = () => resolve(output);
        tx.onerror = () => reject(tx.error);
      });
    }
    async setMany(entries) {
      const records = Object.entries(entries).filter(([, value]) => value?.translation);
      if (!records.length) return;
      const db = await openVanslateCacheDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(CACHE_STORE_NAME, "readwrite");
        const store = tx.objectStore(CACHE_STORE_NAME);
        records.forEach(([key, value]) => {
          store.put({
            vv_key: key,
            translation: value.translation,
            updatedAt: Number(value.updatedAt) || Date.now()
          });
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      await trimVanslateCache(db);
    }
    async clear() {
      const db = await openVanslateCacheDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(CACHE_STORE_NAME, "readwrite");
        tx.objectStore(CACHE_STORE_NAME).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      await this.ext.storage.local.remove([CACHE_KEY, CACHE_META_KEY]).catch(() => {
      });
    }
  };
  function openVanslateCacheDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(INDEXED_DB_NAME, INDEXED_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        let store;
        if (db.objectStoreNames.contains(CACHE_STORE_NAME)) {
          const existing = request.transaction?.objectStore(CACHE_STORE_NAME);
          if (existing?.keyPath !== "vv_key") {
            db.deleteObjectStore(CACHE_STORE_NAME);
            store = db.createObjectStore(CACHE_STORE_NAME, { keyPath: "vv_key" });
          } else {
            store = existing;
          }
        } else {
          store = db.createObjectStore(CACHE_STORE_NAME, { keyPath: "vv_key" });
        }
        if (store && !store.indexNames.contains("vv_updated_at")) {
          store.createIndex("vv_updated_at", "updatedAt");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function trimVanslateCache(db) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE_NAME, "readwrite");
      const store = tx.objectStore(CACHE_STORE_NAME);
      const countRequest = store.count();
      countRequest.onsuccess = () => {
        const overflow = Number(countRequest.result) - MAX_CACHE_ITEMS;
        if (overflow <= 0) return;
        const index = store.index("vv_updated_at");
        let removed = 0;
        const cursorRequest = index.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor || removed >= overflow) return;
          cursor.delete();
          removed += 1;
          cursor.continue();
        };
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  var TabProgressSink = class {
    constructor(ext2) {
      this.ext = ext2;
    }
    postItemResult(context, item) {
      if (!context?.tabId || !item?.id) return;
      this.ext.tabs.sendMessage(context.tabId, {
        type: "TRANSLATION_ITEM_RESULT",
        progressId: context.progressId,
        mode: context.mode,
        item
      }).catch(() => {
      });
    }
    postProgress(context, progress) {
      if (!context?.tabId) return;
      this.ext.tabs.sendMessage(context.tabId, {
        type: "TRANSLATION_PROGRESS",
        progressId: context.progressId,
        mode: context.mode,
        progress
      }).catch(() => {
      });
    }
  };

  // src/core/chat-client.ts
  var OpenAICompatibleChatClient = class {
    constructor(fetchImpl = globalThis.fetch.bind(globalThis), sleepImpl = sleep, retryBaseDelayMs = 1e3) {
      this.fetchImpl = fetchImpl;
      this.sleepImpl = sleepImpl;
      this.retryBaseDelayMs = retryBaseDelayMs;
    }
    async complete(request) {
      const payload = await this.fetchJsonWithRetry(request.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${request.apiKey}`
        },
        body: JSON.stringify({
          model: request.model,
          temperature: request.temperature,
          messages: request.messages
        })
      }, request.retryCount);
      const message = payload?.choices?.[0]?.message || {};
      return {
        message,
        content: String(message.content || "").trim(),
        usage: normalizeUsage(payload?.usage),
        raw: payload
      };
    }
    async fetchJsonWithRetry(endpoint, request, retryCount) {
      let lastError;
      for (let attempt = 0; attempt <= retryCount; attempt += 1) {
        try {
          const response = await this.fetchImpl(endpoint, request);
          const payload = await response.json().catch(() => null);
          if (response.ok) return payload;
          const message = payload?.error?.message || `${response.status} ${response.statusText}`;
          const error = new Error(`API request failed: ${message}`);
          error.status = response.status;
          error.retryAfter = Number(response.headers.get("retry-after")) || 0;
          throw error;
        } catch (error) {
          lastError = error;
          if (attempt >= retryCount || !this.shouldRetry(error)) break;
          await this.sleepImpl(this.retryDelay(error, attempt));
        }
      }
      throw lastError;
    }
    shouldRetry(error) {
      const record = error;
      if (record?.status === 429) return true;
      if (Number(record?.status) >= 500) return true;
      return /timeout|network|failed to fetch/i.test(readableError(error));
    }
    retryDelay(error, attempt) {
      const retryAfter = Number(error?.retryAfter) || 0;
      if (retryAfter > 0) return Math.min(retryAfter * 1e3, 15e3);
      return Math.min(this.retryBaseDelayMs * 2 ** attempt, 8e3);
    }
  };
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // src/core/translation-service.ts
  var VANSLATE_TRANSLATION_BATCH_SIZE = 4;
  var VANSLATE_TRANSLATION_CONCURRENCY = 2;
  var TranslationService = class {
    constructor(settingsRepository2, cacheStore, chatClient, progressSink, now = () => Date.now()) {
      this.settingsRepository = settingsRepository2;
      this.cacheStore = cacheStore;
      this.chatClient = chatClient;
      this.progressSink = progressSink;
      this.now = now;
    }
    async translateTexts(texts, context) {
      const settings = await this.settingsRepository.getSettings();
      this.validateSettings(settings);
      const normalizedItems = texts.map((item, index) => normalizeInputItem(item, index));
      const indexedTexts = normalizedItems.filter((item) => Boolean(item.text));
      if (!indexedTexts.length) {
        return { translations: [], cachedCount: 0 };
      }
      const translations = Array(normalizedItems.length).fill("");
      const misses = [];
      const cacheKeysByIndex = /* @__PURE__ */ new Map();
      let cachedCount = 0;
      let completedCount = 0;
      let skippedCount = 0;
      let usageTotal = zeroUsage();
      for (const item of indexedTexts) {
        if (shouldSkipTranslation(item.text, settings)) {
          completedCount += 1;
          skippedCount += 1;
          this.progressSink.postItemResult(context, {
            id: item.id,
            index: item.index,
            skipped: true,
            reason: "already-target-language",
            usage: zeroUsage()
          });
          continue;
        }
        const key = cacheKey(item.text, settings);
        cacheKeysByIndex.set(item.index, key);
      }
      const cache = settings.enableCache ? await this.cacheStore.getMany(Array.from(cacheKeysByIndex.values())) : {};
      for (const item of indexedTexts) {
        if (!cacheKeysByIndex.has(item.index)) continue;
        const key = cacheKeysByIndex.get(item.index) || "";
        if (settings.enableCache && cache[key]?.translation) {
          translations[item.index] = cache[key].translation;
          cachedCount += 1;
          completedCount += 1;
          this.progressSink.postItemResult(context, {
            id: item.id,
            index: item.index,
            translation: cache[key].translation,
            cached: true,
            usage: zeroUsage()
          });
        } else {
          misses.push({ ...item, cacheKey: key });
        }
      }
      this.progressSink.postProgress(context, {
        done: completedCount,
        total: indexedTexts.length,
        cachedCount,
        skippedCount,
        stage: misses.length ? "translating" : "done"
      });
      const batches = chunk(misses, VANSLATE_TRANSLATION_BATCH_SIZE);
      let nextBatchIndex = 0;
      const workerCount = Math.min(VANSLATE_TRANSLATION_CONCURRENCY, batches.length);
      await Promise.all(Array.from({ length: workerCount }, async () => {
        while (nextBatchIndex < batches.length) {
          const batch = batches[nextBatchIndex];
          nextBatchIndex += 1;
          if (!batch) continue;
          try {
            const result = await this.translateBatch(batch.map((item) => item.text), settings);
            const cacheUpdates = {};
            batch.forEach((item, index) => {
              const translatedText = result.translations[index] || "";
              translations[item.index] = translatedText;
              if (settings.enableCache && translatedText) {
                cacheUpdates[item.cacheKey] = {
                  translation: translatedText,
                  updatedAt: this.now()
                };
              }
              this.progressSink.postItemResult(context, {
                id: item.id,
                index: item.index,
                translation: translatedText,
                cached: false,
                usage: index === 0 ? result.usage : zeroUsage()
              });
            });
            if (settings.enableCache) await this.cacheStore.setMany(cacheUpdates);
            usageTotal = addUsage(usageTotal, result.usage);
          } catch (error) {
            batch.forEach((item) => {
              this.progressSink.postItemResult(context, {
                id: item.id,
                index: item.index,
                error: readableError(error)
              });
            });
          }
          completedCount += batch.length;
          this.progressSink.postProgress(context, {
            done: completedCount,
            total: indexedTexts.length,
            cachedCount,
            skippedCount,
            usage: usageTotal,
            stage: completedCount >= indexedTexts.length ? "done" : "translating"
          });
        }
      }));
      return { translations, cachedCount, skippedCount, translatedCount: completedCount, usage: usageTotal };
    }
    async runSelectionTool(toolId, text) {
      const settings = await this.settingsRepository.getSettings();
      this.validateSettings(settings);
      const tools = normalizeSelectionTools(settings.selectionTools);
      const enabledTools = tools.filter((item) => item.enabled !== false);
      const tool = enabledTools.find((item) => item.id === toolId) || enabledTools[0];
      if (!tool) throw new Error("\u672A\u914D\u7F6E\u53EF\u7528\u5DE5\u5177\u3002");
      const input = String(text || "").trim();
      if (!input) throw new Error("\u8BF7\u5148\u9009\u62E9\u8981\u5904\u7406\u7684\u6587\u672C\u3002");
      const result = await this.runToolRequest(settings, tool, input);
      return {
        toolId: tool.id,
        toolName: tool.name,
        text: result.content,
        reasoning: extractReasoning(result.message),
        usage: result.usage
      };
    }
    async debugSelectionTool(rawTool, text, settingsOverride) {
      const stored = await this.settingsRepository.getSettings();
      const settings = {
        ...stored,
        ...settingsOverride || {}
      };
      this.validateSettings(settings);
      const tool = normalizeSelectionTools([rawTool])[0];
      if (!tool) throw new Error("\u8C03\u8BD5\u5DE5\u5177\u914D\u7F6E\u4E0D\u5B8C\u6574\u3002");
      const input = String(text || "").trim();
      if (!input) throw new Error("\u8BF7\u8F93\u5165\u8C03\u8BD5\u6587\u672C\u3002");
      const promptVars = this.promptVars(settings, input);
      const effective = resolveToolModelSettings(settings, tool);
      validateModelSettings(effective);
      const messages = buildToolMessages(tool, promptVars);
      const endpoint = joinUrl(effective.baseUrl, "/chat/completions");
      const response = await this.chatClient.complete({
        endpoint,
        apiKey: effective.apiKey,
        model: effective.model,
        temperature: 0.3,
        messages,
        retryCount: Number(settings.retryCount) || 0
      });
      return {
        request: {
          endpoint,
          model: effective.model,
          messages
        },
        output: response.content,
        reasoning: extractReasoning(response.message),
        rawMessage: response.message,
        usage: response.usage
      };
    }
    async translateWord(text) {
      const settings = await this.settingsRepository.getSettings();
      this.validateSettings(settings);
      const word = String(text || "").trim();
      if (!word) throw new Error("No word selected.");
      const response = await this.chatClient.complete({
        endpoint: joinUrl(settings.baseUrl, "/chat/completions"),
        apiKey: settings.apiKey,
        model: settings.model,
        temperature: 0.2,
        retryCount: Number(settings.retryCount) || 0,
        messages: [
          {
            role: "system",
            content: "You are a bilingual dictionary engine. You only output valid JSON."
          },
          {
            role: "user",
            content: [
              `Explain the single word or short term "${word}" for a ${settings.targetLanguage} reader.`,
              "Return only JSON in this exact shape:",
              '{"word":"...","phonetic":"...","translation":"...","partOfSpeech":"...","definitions":["..."],"examples":[{"source":"...","translation":"..."}]}',
              "Definitions should be concise but useful. Include phonetic if available."
            ].join("\n")
          }
        ]
      });
      const parsed = JSON.parse(extractJson(response.content));
      return {
        word: String(parsed.word || word),
        phonetic: String(parsed.phonetic || ""),
        translation: String(parsed.translation || ""),
        partOfSpeech: String(parsed.partOfSpeech || ""),
        definitions: Array.isArray(parsed.definitions) ? parsed.definitions.map(String) : [],
        examples: Array.isArray(parsed.examples) ? parsed.examples.map((item) => ({
          source: String(item?.source || ""),
          translation: String(item?.translation || "")
        })).filter((item) => item.source || item.translation) : [],
        usage: response.usage
      };
    }
    async translateSingle(text, settings) {
      const result = await this.translateBatch([text], settings);
      return {
        text: result.translations[0] || "",
        usage: result.usage
      };
    }
    async translateBatch(texts, settings) {
      const glossary = parseGlossary(settings.glossary);
      const glossaryText = glossary.length ? `Use this glossary exactly when applicable:
${glossary.map((item) => `${item.source} => ${item.target}`).join("\n")}` : "No glossary is provided.";
      const prompt = renderTemplate(settings.translationUserPrompt || DEFAULT_TRANSLATION_USER_PROMPT, {
        text: texts.join("\n\n"),
        textsJson: JSON.stringify({ texts }),
        sourceLanguage: settings.sourceLanguage,
        sourceLanguagePrompt: sourceLanguagePrompt(settings.sourceLanguage),
        targetLanguage: settings.targetLanguage,
        glossary: settings.glossary,
        glossaryBlock: glossaryText,
        url: ""
      });
      const response = await this.chatClient.complete({
        endpoint: joinUrl(settings.baseUrl, "/chat/completions"),
        apiKey: settings.apiKey,
        model: settings.model,
        temperature: 0.2,
        retryCount: Number(settings.retryCount) || 0,
        messages: [
          {
            role: "system",
            content: settings.translationSystemPrompt || DEFAULT_TRANSLATION_SYSTEM_PROMPT
          },
          {
            role: "user",
            content: prompt
          }
        ]
      });
      const translations = parseTranslations(response.content);
      if (translations.length !== texts.length) {
        throw new Error("The model returned an unexpected translation count.");
      }
      return {
        translations,
        usage: response.usage
      };
    }
    async runToolRequest(settings, tool, input) {
      const effective = resolveToolModelSettings(settings, tool);
      validateModelSettings(effective);
      const messages = buildToolMessages(tool, this.promptVars(settings, input));
      return this.chatClient.complete({
        endpoint: joinUrl(effective.baseUrl, "/chat/completions"),
        apiKey: effective.apiKey,
        model: effective.model,
        temperature: 0.3,
        messages,
        retryCount: Number(settings.retryCount) || 0
      });
    }
    promptVars(settings, text) {
      return {
        text,
        sourceLanguage: settings.sourceLanguage,
        targetLanguage: settings.targetLanguage,
        glossary: settings.glossary,
        url: ""
      };
    }
    validateSettings(settings) {
      validateModelSettings({
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        model: settings.activeModel || settings.model
      });
    }
  };
  function chunk(items, size) {
    const output = [];
    for (let index = 0; index < items.length; index += size) {
      output.push(items.slice(index, index + size));
    }
    return output;
  }

  // src/entries/background.ts
  var ext = globalThis.browser || chrome;
  var CONTEXT_MENU_TRANSLATE_PAGE = "vv-vanslate-page";
  var settingsRepository = new BrowserSettingsRepository(ext);
  var translationCache = new BrowserTranslationCache(ext);
  var translationService = new TranslationService(
    settingsRepository,
    translationCache,
    new OpenAICompatibleChatClient(),
    new TabProgressSink(ext)
  );
  ext.runtime.onInstalled.addListener(async () => {
    const current = await readStorageValues(ext.storage.local, Object.keys(DEFAULT_SETTINGS));
    await writeStorageValues(ext.storage.local, { ...DEFAULT_SETTINGS, ...current });
    createContextMenus();
  });
  ext.runtime.onStartup?.addListener(() => {
    createContextMenus();
  });
  ext.contextMenus?.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== CONTEXT_MENU_TRANSLATE_PAGE || !tab?.id) return;
    await ensureContentScript(tab.id);
    await ext.tabs.sendMessage(tab.id, {
      type: "TRANSLATE_PAGE",
      options: { fromContextMenu: true }
    }).catch(() => {
    });
  });
  ext.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "TRANSLATE_TEXTS") {
      translationService.translateTexts(message.texts || [], {
        tabId: sender.tab?.id || message.tabId,
        progressId: message.progressId || "default",
        mode: message.mode || "page"
      }).then((result) => sendResponse({ ok: true, ...result })).catch((error) => sendResponse({ ok: false, error: readableError(error), quotaLimited: isQuotaLimit(error) }));
      return true;
    }
    if (message?.type === "TRANSLATE_WORD") {
      translationService.translateWord(message.text || "").then((result) => sendResponse({ ok: true, result })).catch((error) => sendResponse({ ok: false, error: readableError(error), quotaLimited: isQuotaLimit(error) }));
      return true;
    }
    if (message?.type === "RUN_SELECTION_TOOL") {
      translationService.runSelectionTool(message.toolId || "translate", message.text || "").then((result) => sendResponse({ ok: true, result })).catch((error) => sendResponse({ ok: false, error: readableError(error), quotaLimited: isQuotaLimit(error) }));
      return true;
    }
    if (message?.type === "DEBUG_SELECTION_TOOL") {
      translationService.debugSelectionTool(message.tool || null, message.text || "", message.settings || null).then((result) => sendResponse({ ok: true, result })).catch((error) => sendResponse({ ok: false, error: readableError(error), quotaLimited: isQuotaLimit(error) }));
      return true;
    }
    if (message?.type === "GET_SETTINGS") {
      settingsRepository.getSettings().then((settings) => sendResponse({ ok: true, settings: redact(settings) })).catch((error) => sendResponse({ ok: false, error: readableError(error) }));
      return true;
    }
    if (message?.type === "GET_DEFAULT_PROMPTS") {
      sendResponse({
        ok: true,
        translationSystemPrompt: DEFAULT_TRANSLATION_SYSTEM_PROMPT,
        translationUserPrompt: DEFAULT_TRANSLATION_USER_PROMPT,
        collectionRules: DEFAULT_COLLECTION_RULES,
        skipRules: DEFAULT_SKIP_RULES,
        selectionTools: DEFAULT_SELECTION_TOOLS
      });
      return false;
    }
    if (message?.type === "CLEAR_CACHE") {
      translationCache.clear().then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: readableError(error) }));
      return true;
    }
    return false;
  });
  function createContextMenus() {
    if (!ext.contextMenus) return;
    const create = () => {
      ext.contextMenus.create({
        id: CONTEXT_MENU_TRANSLATE_PAGE,
        title: "\u8587\u8BD1\uFF1A\u7FFB\u8BD1\u5168\u6587",
        contexts: ["page", "selection"]
      });
    };
    if (globalThis.browser && ext === globalThis.browser) {
      ext.contextMenus.removeAll().then(create).catch(() => {
      });
    } else {
      ext.contextMenus.removeAll(create);
    }
  }
  async function ensureContentScript(tabId) {
    try {
      await ext.tabs.sendMessage(tabId, { type: "PING" });
    } catch {
      if (!ext.scripting) return;
      await ext.scripting.executeScript({
        target: { tabId },
        files: ["content.js"]
      });
      await ext.scripting.insertCSS({
        target: { tabId },
        files: ["content.css"]
      });
    }
  }
})();
