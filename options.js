"use strict";
(() => {
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
  function maskSecret(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    if (text.length <= 12) return `${text.slice(0, Math.min(4, text.length))}\u2022\u2022\u2022\u2022`;
    return `${text.slice(0, 8)}\u2022\u2022\u2022\u2022${text.slice(-4)}`;
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

  // src/core/utils.ts
  function normalizeTranslationSkipRules(value) {
    const source = value && typeof value === "object" ? value : {};
    const patterns = Array.isArray(source.patterns) ? source.patterns : DEFAULT_SKIP_RULES.patterns;
    const normalizedPatterns = patterns.map((pattern) => String(pattern || "").trim()).filter(Boolean);
    return {
      enabled: source.enabled !== false,
      patterns: normalizedPatterns.length ? Array.from(new Set(normalizedPatterns)) : DEFAULT_SKIP_RULES.patterns
    };
  }
  function validateTranslationSkipRules(value) {
    const rules = normalizeTranslationSkipRules(value);
    rules.patterns.forEach((pattern) => {
      compileSkipPattern(pattern);
    });
    return rules;
  }
  function compileSkipPattern(pattern) {
    const value = String(pattern || "").trim();
    const match = value.match(/^\/(.+)\/([dgimsuvy]*)$/);
    if (match?.[1]) return new RegExp(match[1], String(match[2] || "").replace(/[gy]/g, ""));
    return new RegExp(value, "i");
  }

  // src/entries/options-css-templates.ts
  var TRANSLATION_CSS_TEMPLATES = [
    {
      id: "inherit",
      nameKey: "cssTemplateInherit",
      descriptionKey: "cssTemplateInheritDesc",
      css: ""
    },
    {
      id: "soft-left",
      nameKey: "cssTemplateSoftLeft",
      descriptionKey: "cssTemplateSoftLeftDesc",
      css: "opacity: 0.88;\nborder-left: 2px solid #0867f2;\npadding-left: 0.45em;"
    },
    {
      id: "muted-note",
      nameKey: "cssTemplateMutedNote",
      descriptionKey: "cssTemplateMutedNoteDesc",
      css: "color: #58677f;\nfont-style: italic;"
    },
    {
      id: "focus-band",
      nameKey: "cssTemplateFocusBand",
      descriptionKey: "cssTemplateFocusBandDesc",
      css: ".vanslate-result {\n  background: rgba(8, 103, 242, 0.08);\n  border-radius: 4px;\n  padding: 0.05em 0.25em;\n}"
    }
  ];
  function createTranslationCssTemplatePicker(options) {
    const { container, textarea, t: t2 } = options;
    if (!container || !textarea) return { render: () => void 0 };
    const render = () => {
      container.textContent = "";
      TRANSLATION_CSS_TEMPLATES.forEach((template, index) => {
        const card = document.createElement("button");
        const scope = `css-template-${template.id}-${index}`;
        card.type = "button";
        card.className = "cssTemplateCard";
        card.dataset.templateId = template.id;
        card.dataset.active = normalizeCss(textarea.value) === normalizeCss(template.css) ? "true" : "false";
        card.innerHTML = `
        <span class="cssTemplateTitle">${escapeHtml(t2(template.nameKey))}</span>
        <span class="cssTemplatePreview" data-css-template-scope="${scope}">
          <span>${escapeHtml(t2("cssTemplateOriginal"))}</span>
          <span class="vanslate-result">${escapeHtml(t2("cssTemplateTranslated"))}</span>
        </span>
        <span class="cssTemplateDesc">${escapeHtml(t2(template.descriptionKey))}</span>
      `;
        const style = document.createElement("style");
        style.textContent = scopedTemplateCss(template.css, scope);
        card.appendChild(style);
        card.addEventListener("click", () => {
          textarea.value = template.css;
          textarea.dispatchEvent(new Event("input", { bubbles: true }));
          render();
        });
        container.appendChild(card);
      });
    };
    textarea.addEventListener("input", render);
    render();
    return { render };
  }
  function scopedTemplateCss(css, scope) {
    const value = String(css || "").trim();
    if (!value) return "";
    const selector = `[data-css-template-scope="${scope}"] .vanslate-result`;
    if (!value.includes("{")) return `${selector}{${value}}`;
    return value.replace(/\.vanslate-result/g, selector);
  }
  function normalizeCss(css) {
    return String(css || "").replace(/\s+/g, " ").trim();
  }
  function escapeHtml(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // src/entries/options.ts
  var ext = globalThis.browser || chrome;
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
    collectionRules: {
      blockTags: ["H1", "H2", "H3", "H4", "H5", "H6", "P", "LI", "BLOCKQUOTE", "FIGCAPTION", "TD", "TH", "DT", "DD"],
      formTags: ["LABEL", "LEGEND", "CAPTION", "SUMMARY"],
      supplementalTags: ["DIV", "SPAN"],
      supplementalContextPattern: "comment|comments|cmtx|review|feedback|discussion|reply",
      metadataPattern: "avatar|gravatar|author|user(name)?|date|time|timestamp|count|rating|stars|captcha|honeypot|pagination|page_number"
    },
    skipRules: DEFAULT_SKIP_RULES,
    selectionTools: []
  };
  var form = document.querySelector("#settingsForm");
  var statusNode = document.querySelector("#status");
  var testBtn = document.querySelector("#testBtn");
  var clearCacheBtn = document.querySelector("#clearCacheBtn");
  var resetPromptsBtn = document.querySelector("#resetPromptsBtn");
  var addSelectionToolBtn = document.querySelector("#addSelectionToolBtn");
  var toggleSelectionToolsJsonBtn = document.querySelector("#toggleSelectionToolsJsonBtn");
  var selectionToolsEditor = document.querySelector("#selectionToolsEditor");
  var selectionToolsJsonWrap = document.querySelector("#selectionToolsJsonWrap");
  var applySelectionToolsJsonBtn = document.querySelector("#applySelectionToolsJsonBtn");
  var closeSelectionToolsJsonBtn = document.querySelector("#closeSelectionToolsJsonBtn");
  var cancelSelectionToolsJsonBtn = document.querySelector("#cancelSelectionToolsJsonBtn");
  var promptDefaults = null;
  var currentSelectionTools = [];
  var currentUiLanguage = "zh-CN";
  var statusTimer = 0;
  var secretInputState = /* @__PURE__ */ new WeakMap();
  var translationCssTemplatePicker = null;
  var fields = {
    baseUrl: document.querySelector("#baseUrl"),
    apiKey: document.querySelector("#apiKey"),
    model: document.querySelector("#model"),
    models: document.querySelector("#models"),
    uiLanguage: document.querySelector("#uiLanguage"),
    sourceLanguage: document.querySelector("#sourceLanguage"),
    targetLanguage: document.querySelector("#targetLanguage"),
    renderMode: document.querySelector("#renderMode"),
    translationColorEnabled: document.querySelector("#translationColorEnabled"),
    translationColor: document.querySelector("#translationColor"),
    translationCss: document.querySelector("#translationCss"),
    translationCssTemplates: document.querySelector("#translationCssTemplates"),
    enableCache: document.querySelector("#enableCache"),
    floatingBallMode: document.querySelector("#floatingBallMode"),
    enableAutoTranslate: document.querySelector("#enableAutoTranslate"),
    autoTranslateRules: document.querySelector("#autoTranslateRules"),
    glossary: document.querySelector("#glossary"),
    retryCount: document.querySelector("#retryCount"),
    translationSystemPrompt: document.querySelector("#translationSystemPrompt"),
    translationUserPrompt: document.querySelector("#translationUserPrompt"),
    collectionRules: document.querySelector("#collectionRules"),
    skipRules: document.querySelector("#skipRules"),
    selectionTools: document.querySelector("#selectionTools")
  };
  loadSettings();
  installSecretInput(fields.apiKey);
  translationCssTemplatePicker = createTranslationCssTemplatePicker({
    container: fields.translationCssTemplates,
    textarea: fields.translationCss,
    t: (key) => t(key)
  });
  fields.uiLanguage.addEventListener("change", async () => {
    currentUiLanguage = VanslateI18n.normalizeLanguage(fields.uiLanguage.value);
    applyI18n();
    renderSelectionToolsEditor();
    await writeStorageValues(ext.storage.local, { uiLanguage: currentUiLanguage });
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await saveSettings();
      setStatus(t("settingsSaved"));
    } catch (error) {
      setStatus(readableError(error), true);
    }
  });
  testBtn.addEventListener("click", async () => {
    setStatus(t("testingApi"));
    testBtn.disabled = true;
    try {
      await saveSettings();
      const response = await ext.runtime.sendMessage({
        type: "TRANSLATE_TEXTS",
        texts: ["Hello, this is a connectivity test."]
      });
      if (!response?.ok) throw new Error(response?.error || t("testFailed"));
      setStatus(`${t("testSuccess")}\uFF1A${response.translations?.[0] || ""}`);
    } catch (error) {
      setStatus(readableError(error), true);
    } finally {
      testBtn.disabled = false;
    }
  });
  clearCacheBtn.addEventListener("click", async () => {
    setStatus(t("clearingCache"));
    clearCacheBtn.disabled = true;
    try {
      const response = await ext.runtime.sendMessage({ type: "CLEAR_CACHE" });
      if (!response?.ok) throw new Error(response?.error || t("clearFailed"));
      setStatus(t("cacheCleared"));
    } catch (error) {
      setStatus(readableError(error), true);
    } finally {
      clearCacheBtn.disabled = false;
    }
  });
  resetPromptsBtn.addEventListener("click", async () => {
    try {
      const defaults = await loadPromptDefaults();
      fillPromptFields(defaults);
      setStatus(t("promptsReset"));
    } catch (error) {
      setStatus(readableError(error), true);
    }
  });
  addSelectionToolBtn.addEventListener("click", () => {
    syncSelectionToolsFromVisibleMode();
    currentSelectionTools.push({
      id: uniqueToolId("custom_tool"),
      name: t("customTool"),
      enabled: true,
      modelMode: "inherit",
      baseUrl: "",
      apiKey: "",
      model: "",
      activeModel: "",
      models: "",
      systemPrompt: t("helpfulSystemPrompt"),
      userPrompt: t("helpfulUserPrompt")
    });
    renderSelectionToolsEditor();
    syncSelectionToolsJson();
  });
  toggleSelectionToolsJsonBtn.addEventListener("click", () => {
    try {
      syncSelectionToolsFromEditor();
      syncSelectionToolsJson();
      showSelectionToolsJson();
    } catch (error) {
      setStatus(readableError(error), true);
    }
  });
  applySelectionToolsJsonBtn.addEventListener("click", () => {
    try {
      currentSelectionTools = parseSelectionTools(fields.selectionTools.value);
      renderSelectionToolsEditor();
      hideSelectionToolsJson();
      setStatus(t("jsonApplied"));
    } catch (error) {
      setStatus(readableError(error), true);
    }
  });
  closeSelectionToolsJsonBtn.addEventListener("click", hideSelectionToolsJson);
  cancelSelectionToolsJsonBtn.addEventListener("click", hideSelectionToolsJson);
  selectionToolsJsonWrap.addEventListener("click", (event) => {
    if (event.target === selectionToolsJsonWrap) hideSelectionToolsJson();
  });
  async function loadSettings() {
    const defaults = await loadPromptDefaults();
    const stored = await readStorageValues(ext.storage.local, Object.keys(DEFAULT_SETTINGS));
    const settings = { ...DEFAULT_SETTINGS, ...stored };
    currentUiLanguage = VanslateI18n.normalizeLanguage(settings.uiLanguage || DEFAULT_SETTINGS.uiLanguage);
    VanslateI18n.populateLanguageSelect(fields.uiLanguage, currentUiLanguage);
    fields.uiLanguage.value = currentUiLanguage;
    applyI18n();
    fields.baseUrl.value = settings.baseUrl;
    setSecretInputValue(fields.apiKey, settings.apiKey);
    fields.model.value = settings.activeModel || settings.model;
    fields.models.value = settings.models || settings.model || DEFAULT_SETTINGS.models;
    ensureSelectOption(fields.sourceLanguage, settings.sourceLanguage || "auto");
    ensureSelectOption(fields.targetLanguage, settings.targetLanguage || "\u4E2D\u6587");
    fields.sourceLanguage.value = settings.sourceLanguage || "auto";
    fields.targetLanguage.value = settings.targetLanguage;
    fields.renderMode.value = settings.renderMode === "block" ? "block" : "inline";
    fields.translationColorEnabled.checked = Boolean(settings.translationColorEnabled);
    fields.translationColor.value = settings.translationColor || "#1d6fb8";
    fields.translationCss.value = settings.translationCss || "";
    fields.enableCache.checked = Boolean(settings.enableCache);
    fields.floatingBallMode.value = normalizeFloatingBallMode(settings);
    fields.enableAutoTranslate.checked = Boolean(settings.enableAutoTranslate);
    fields.autoTranslateRules.value = settings.autoTranslateRules || "";
    fields.glossary.value = settings.glossary || "";
    fields.retryCount.value = String(settings.retryCount ?? 2);
    fields.translationSystemPrompt.value = defaults.translationSystemPrompt || "";
    fields.translationUserPrompt.value = defaults.translationUserPrompt || "";
    fields.collectionRules.value = stringifyCollectionRules(settings.collectionRules || defaults.collectionRules);
    fields.skipRules.value = stringifySkipRules(settings.skipRules || defaults.skipRules);
    currentSelectionTools = Array.isArray(settings.selectionTools) && settings.selectionTools.length ? settings.selectionTools : defaults.selectionTools;
    renderSelectionToolsEditor();
    syncSelectionToolsJson();
  }
  async function saveSettings() {
    const defaults = await loadPromptDefaults();
    const selectionTools = syncSelectionToolsFromVisibleMode();
    const settings = {
      baseUrl: fields.baseUrl.value.trim().replace(/\/+$/, ""),
      apiKey: readSecretInputValue(fields.apiKey),
      model: fields.model.value.trim(),
      activeModel: fields.model.value.trim(),
      models: normalizeModelsText(fields.models.value, fields.model.value.trim()),
      uiLanguage: currentUiLanguage,
      sourceLanguage: fields.sourceLanguage.value.trim() || "auto",
      targetLanguage: fields.targetLanguage.value.trim(),
      preserveOriginal: true,
      renderMode: fields.renderMode.value === "block" ? "block" : "inline",
      translationColorEnabled: fields.translationColorEnabled.checked,
      translationColor: fields.translationColor.value,
      translationCss: fields.translationCss.value.trim(),
      enableCache: fields.enableCache.checked,
      floatingBallMode: fields.floatingBallMode.value,
      enableFloatingBall: fields.floatingBallMode.value !== "hidden",
      enableAutoTranslate: fields.enableAutoTranslate.checked,
      autoTranslateRules: fields.autoTranslateRules.value.trim(),
      glossary: fields.glossary.value.trim(),
      retryCount: Math.max(0, Math.min(5, Number(fields.retryCount.value) || 0)),
      translationSystemPrompt: defaults.translationSystemPrompt || "",
      translationUserPrompt: defaults.translationUserPrompt || "",
      collectionRules: parseCollectionRules(fields.collectionRules.value, defaults.collectionRules),
      skipRules: parseSkipRules(fields.skipRules.value, defaults.skipRules),
      selectionTools
    };
    if (!settings.baseUrl || !settings.apiKey || !settings.model || !settings.targetLanguage) {
      throw new Error(t("requiredFields"));
    }
    await writeStorageValues(ext.storage.local, settings);
    setSecretInputValue(fields.apiKey, settings.apiKey);
    currentSelectionTools = selectionTools;
    renderSelectionToolsEditor();
    syncSelectionToolsJson();
  }
  function normalizeFloatingBallMode(settings) {
    if (settings.floatingBallMode === "hidden" || settings.enableFloatingBall === false) return "hidden";
    if (settings.floatingBallMode === "hover") return "hover";
    return "always";
  }
  async function loadPromptDefaults() {
    if (promptDefaults) return promptDefaults;
    const response = await ext.runtime.sendMessage({ type: "GET_DEFAULT_PROMPTS" });
    if (!response?.ok) throw new Error(response?.error || t("testFailed"));
    promptDefaults = {
      translationSystemPrompt: response.translationSystemPrompt || "",
      translationUserPrompt: response.translationUserPrompt || "",
      collectionRules: response.collectionRules || DEFAULT_SETTINGS.collectionRules,
      skipRules: response.skipRules || DEFAULT_SETTINGS.skipRules,
      selectionTools: Array.isArray(response.selectionTools) ? response.selectionTools : []
    };
    return promptDefaults;
  }
  function fillPromptFields(defaults) {
    fields.translationSystemPrompt.value = defaults.translationSystemPrompt || "";
    fields.translationUserPrompt.value = defaults.translationUserPrompt || "";
    currentSelectionTools = defaults.selectionTools || [];
    renderSelectionToolsEditor();
    hideSelectionToolsJson();
    syncSelectionToolsJson();
  }
  function renderSelectionToolsEditor() {
    selectionToolsEditor.textContent = "";
    currentSelectionTools.forEach((tool, index) => {
      currentSelectionTools[index] = normalizeTool(tool, index);
      tool = currentSelectionTools[index];
      const card = document.createElement("details");
      card.className = "toolConfigCard";
      card.open = index === 0;
      const head = document.createElement("summary");
      head.className = "toolConfigHead";
      const titleWrap = document.createElement("label");
      titleWrap.className = "toolEnable";
      const enabled = document.createElement("input");
      enabled.type = "checkbox";
      enabled.checked = tool.enabled !== false;
      enabled.addEventListener("click", (event) => event.stopPropagation());
      enabled.addEventListener("change", () => {
        currentSelectionTools[index].enabled = enabled.checked;
        syncSelectionToolsJson();
      });
      const title = document.createElement("strong");
      title.textContent = tool.name || `\u5DE5\u5177 ${index + 1}`;
      titleWrap.append(enabled, title);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "secondary iconMiniButton";
      remove.textContent = "\xD7";
      remove.title = t("deleteTool");
      remove.disabled = currentSelectionTools.length <= 1;
      remove.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        currentSelectionTools.splice(index, 1);
        renderSelectionToolsEditor();
        syncSelectionToolsJson();
      });
      head.append(titleWrap, remove);
      const grid = document.createElement("div");
      grid.className = "toolConfigGrid";
      grid.append(
        createToolInput(t("toolName"), tool.name, "name", index),
        createToolInput(t("toolId"), tool.id, "id", index),
        createToolSelect(t("toolModelSource"), tool.modelMode, "modelMode", index, [
          ["inherit", t("inheritGlobal")],
          ["custom", t("customModel")]
        ]),
        createToolInput(t("toolDefaultModel"), tool.activeModel || tool.model, "model", index),
        createToolInput(t("toolApiUrl"), tool.baseUrl, "baseUrl", index, { placeholder: t("leaveBlankInherit") }),
        createToolInput(t("toolApiKey"), tool.apiKey, "apiKey", index, { type: "text", placeholder: t("leaveBlankInherit"), secret: true }),
        createToolTextarea(t("toolModels"), tool.models, "models", index, 3),
        createToolTextarea(t("systemPrompt"), tool.systemPrompt, "systemPrompt", index, 3),
        createToolTextarea(t("userPrompt"), tool.userPrompt, "userPrompt", index, 5)
      );
      const debug = createToolDebugPanel(index);
      const body = document.createElement("div");
      body.className = "toolConfigBody";
      body.append(grid, debug);
      card.append(head, body);
      selectionToolsEditor.appendChild(card);
    });
  }
  function createToolInput(labelText, value, key, index, options = {}) {
    const label = document.createElement("label");
    label.className = "toolField";
    const span = document.createElement("span");
    span.textContent = labelText;
    const input = document.createElement("input");
    input.type = options.type || "text";
    input.placeholder = options.placeholder || "";
    if (options.secret) {
      installSecretInput(input);
      setSecretInputValue(input, value || "");
    } else {
      input.value = value || "";
    }
    input.addEventListener("input", () => {
      currentSelectionTools[index][key] = options.secret ? readSecretInputValue(input) : input.value;
      if (key === "model") currentSelectionTools[index].activeModel = input.value;
      if (key === "name") {
        const card = input.closest(".toolConfigCard");
        const title = card?.querySelector(".toolConfigHead strong");
        if (title) title.textContent = input.value || `\u5DE5\u5177 ${index + 1}`;
      }
      syncSelectionToolsJson();
    });
    label.append(span, input);
    return label;
  }
  function createToolSelect(labelText, value, key, index, options) {
    const label = document.createElement("label");
    label.className = "toolField";
    const span = document.createElement("span");
    span.textContent = labelText;
    const select = document.createElement("select");
    options.forEach(([optionValue, optionLabel]) => {
      const option = document.createElement("option");
      option.value = optionValue;
      option.textContent = optionLabel;
      select.appendChild(option);
    });
    select.value = value || "inherit";
    select.addEventListener("change", () => {
      currentSelectionTools[index][key] = select.value;
      syncSelectionToolsJson();
    });
    label.append(span, select);
    return label;
  }
  function createToolTextarea(labelText, value, key, index, rows) {
    const label = document.createElement("label");
    label.className = "toolField full";
    const span = document.createElement("span");
    span.textContent = labelText;
    const textarea = document.createElement("textarea");
    textarea.rows = rows;
    textarea.value = value || "";
    textarea.addEventListener("input", () => {
      currentSelectionTools[index][key] = textarea.value;
      syncSelectionToolsJson();
    });
    label.append(span, textarea);
    return label;
  }
  function createToolDebugPanel(index) {
    const wrap = document.createElement("details");
    wrap.className = "toolDebug";
    const summary = document.createElement("summary");
    summary.textContent = t("debugTool");
    const input = document.createElement("textarea");
    input.rows = 4;
    input.placeholder = t("debugPlaceholder");
    const run = document.createElement("button");
    run.type = "button";
    run.className = "secondary miniButton";
    run.textContent = t("runDebug");
    const output = document.createElement("pre");
    output.className = "toolDebugOutput";
    run.addEventListener("click", async () => {
      try {
        syncSelectionToolsFromEditor();
        const tool = currentSelectionTools[index];
        run.disabled = true;
        output.textContent = t("debugRequesting");
        const response = await ext.runtime.sendMessage({
          type: "DEBUG_SELECTION_TOOL",
          tool,
          text: input.value.trim(),
          settings: collectSettingsForDebug()
        });
        if (!response?.ok) throw new Error(response?.error || t("debugFailed"));
        output.textContent = JSON.stringify(response.result, null, 2);
      } catch (error) {
        output.textContent = readableError(error);
      } finally {
        run.disabled = false;
      }
    });
    wrap.append(summary, input, run, output);
    return wrap;
  }
  function syncSelectionToolsFromVisibleMode() {
    if (selectionToolsJsonWrap.open) {
      currentSelectionTools = parseSelectionTools(fields.selectionTools.value);
      renderSelectionToolsEditor();
    } else {
      syncSelectionToolsFromEditor();
    }
    syncSelectionToolsJson();
    return currentSelectionTools;
  }
  function syncSelectionToolsFromEditor() {
    const cards = Array.from(selectionToolsEditor.querySelectorAll(".toolConfigCard"));
    currentSelectionTools = cards.map((card, index) => {
      const enabled = card.querySelector(".toolEnable input")?.checked !== false;
      const inputs = card.querySelectorAll(".toolConfigGrid input");
      const selects = card.querySelectorAll(".toolConfigGrid select");
      const textareas = card.querySelectorAll(".toolConfigGrid textarea");
      const models = textareas[0]?.value.trim() || "";
      const model = inputs[2]?.value.trim() || firstModel(models);
      return {
        enabled,
        name: inputs[0]?.value.trim() || "",
        id: inputs[1]?.value.trim() || `tool_${index + 1}`,
        modelMode: selects[0]?.value === "custom" ? "custom" : "inherit",
        model,
        activeModel: model,
        baseUrl: inputs[3]?.value.trim().replace(/\/+$/, "") || "",
        apiKey: readSecretInputValue(inputs[4]) || "",
        models,
        systemPrompt: textareas[1]?.value.trim() || "",
        userPrompt: textareas[2]?.value.trim() || ""
      };
    });
  }
  function syncSelectionToolsJson() {
    fields.selectionTools.value = JSON.stringify(maskSelectionToolsForDisplay(currentSelectionTools || []), null, 2);
  }
  function showSelectionToolsJson() {
    if (selectionToolsJsonWrap.showModal) {
      selectionToolsJsonWrap.showModal();
    } else {
      selectionToolsJsonWrap.setAttribute("open", "");
    }
    fields.selectionTools.focus();
  }
  function hideSelectionToolsJson() {
    if (selectionToolsJsonWrap.close) {
      selectionToolsJsonWrap.close();
    } else {
      selectionToolsJsonWrap.removeAttribute("open");
    }
  }
  function uniqueToolId(base) {
    const used = new Set(currentSelectionTools.map((tool) => tool.id));
    let index = currentSelectionTools.length + 1;
    let id = `${base}_${index}`;
    while (used.has(id)) {
      index += 1;
      id = `${base}_${index}`;
    }
    return id;
  }
  function normalizeTool(tool, index) {
    const models = normalizeModelsText(tool?.models || tool?.model || "");
    const model = String(tool?.activeModel || tool?.model || firstModel(models) || "").trim();
    return {
      id: String(tool?.id || `tool_${index + 1}`).trim(),
      name: String(tool?.name || `${t("tools")} ${index + 1}`).trim(),
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
  }
  function installSecretInput(input) {
    if (!input || secretInputState.has(input)) return;
    secretInputState.set(input, { actual: "", masked: "", changed: false });
    input.autocomplete = "off";
    input.addEventListener("focus", () => {
      const state = secretInputState.get(input);
      if (!state?.actual || input.value !== state.masked) return;
      input.value = "";
      input.placeholder = t("enterNewApiKeyKeepExisting");
    });
    input.addEventListener("input", () => {
      const state = secretInputState.get(input) || { actual: "", masked: "", changed: false };
      state.changed = true;
      secretInputState.set(input, state);
    });
    input.addEventListener("blur", () => {
      const state = secretInputState.get(input);
      if (!state) return;
      if (!state.changed && state.actual) input.value = state.masked;
      input.placeholder = input.getAttribute("data-original-placeholder") || "";
    });
  }
  function setSecretInputValue(input, value) {
    if (!input) return;
    const actual = String(value || "").trim();
    const masked = maskSecret(actual);
    if (!input.getAttribute("data-original-placeholder")) {
      input.setAttribute("data-original-placeholder", input.placeholder || "");
    }
    secretInputState.set(input, { actual, masked, changed: false });
    input.value = masked;
  }
  function readSecretInputValue(input) {
    if (!input) return "";
    const state = secretInputState.get(input);
    if (!state) return String(input.value || "").trim();
    const value = String(input.value || "").trim();
    if (!state.changed || value === state.masked) return state.actual;
    return value;
  }
  function maskSelectionToolsForDisplay(tools) {
    return tools.map((tool) => ({
      ...tool,
      apiKey: maskSecret(tool?.apiKey || "")
    }));
  }
  function collectSettingsForDebug() {
    return {
      baseUrl: fields.baseUrl.value.trim().replace(/\/+$/, ""),
      apiKey: readSecretInputValue(fields.apiKey),
      model: fields.model.value.trim(),
      activeModel: fields.model.value.trim(),
      sourceLanguage: fields.sourceLanguage.value.trim() || "auto",
      targetLanguage: fields.targetLanguage.value.trim(),
      glossary: fields.glossary.value.trim(),
      retryCount: Math.max(0, Math.min(5, Number(fields.retryCount.value) || 0))
    };
  }
  function stringifyCollectionRules(value) {
    return JSON.stringify(normalizeCollectionRules(value), null, 2);
  }
  function parseCollectionRules(value, fallback) {
    try {
      return normalizeCollectionRules(value ? JSON.parse(value) : fallback);
    } catch {
      throw new Error(t("collectionRulesInvalid"));
    }
  }
  function stringifySkipRules(value) {
    return JSON.stringify(validateTranslationSkipRules(value || DEFAULT_SETTINGS.skipRules), null, 2);
  }
  function parseSkipRules(value, fallback) {
    try {
      return validateTranslationSkipRules(value ? JSON.parse(value) : fallback);
    } catch {
      throw new Error(t("skipRulesInvalid"));
    }
  }
  function normalizeCollectionRules(value) {
    const source = value && typeof value === "object" ? value : {};
    const fallback = DEFAULT_SETTINGS.collectionRules;
    return {
      blockTags: normalizeTagList(source.blockTags, fallback.blockTags),
      formTags: normalizeTagList(source.formTags, fallback.formTags),
      supplementalTags: normalizeTagList(source.supplementalTags, fallback.supplementalTags),
      supplementalContextPattern: normalizePatternSource(source.supplementalContextPattern, fallback.supplementalContextPattern),
      metadataPattern: normalizePatternSource(source.metadataPattern, fallback.metadataPattern)
    };
  }
  function normalizeTagList(value, fallback) {
    const list = Array.isArray(value) ? value : fallback;
    const tags = list.map((tag) => String(tag || "").trim().toUpperCase()).filter(Boolean);
    return tags.length ? Array.from(new Set(tags)) : fallback;
  }
  function normalizePatternSource(value, fallback) {
    const pattern = String(value || "").trim();
    try {
      new RegExp(pattern || fallback, "i");
    } catch {
      throw new Error(t("collectionRulesInvalid"));
    }
    return pattern || fallback;
  }
  function parseSelectionTools(value) {
    let parsed;
    try {
      parsed = JSON.parse(value || "[]");
    } catch {
      throw new Error(t("jsonInvalid"));
    }
    if (!Array.isArray(parsed) || !parsed.length) {
      throw new Error(t("toolRequired"));
    }
    return parsed.map((tool, index) => {
      const normalized = normalizeTool(tool, index);
      normalized.apiKey = restoreMaskedToolApiKey(normalized);
      const { id, name, systemPrompt, userPrompt } = normalized;
      if (!id || !name || !systemPrompt || !userPrompt) {
        throw new Error(t("toolFieldsRequired"));
      }
      return normalized;
    });
  }
  function restoreMaskedToolApiKey(tool) {
    const apiKey = String(tool?.apiKey || "").trim();
    if (!isMaskedSecretValue(apiKey)) return apiKey;
    const existing = currentSelectionTools.find((item) => item.id === tool.id);
    const existingApiKey = String(existing?.apiKey || "").trim();
    return maskSecret(existingApiKey) === apiKey ? existingApiKey : "";
  }
  function isMaskedSecretValue(value) {
    return String(value || "").includes("\u2022\u2022\u2022\u2022");
  }
  function setStatus(message, isError = false) {
    window.clearTimeout(statusTimer);
    statusNode.textContent = message;
    statusNode.classList.toggle("error", isError);
    statusNode.classList.toggle("is-visible", Boolean(message));
    if (!isError && message) {
      statusTimer = window.setTimeout(() => {
        statusNode.classList.remove("is-visible");
      }, 2600);
    }
  }
  function t(key, values = {}) {
    return VanslateI18n.t(key, currentUiLanguage, values);
  }
  function applyI18n() {
    VanslateI18n.apply(document, currentUiLanguage);
    document.documentElement.style.setProperty("--i18n-expand", `"${t("expand")}"`);
    document.documentElement.style.setProperty("--i18n-collapse", `"${t("collapse")}"`);
    translationCssTemplatePicker?.render();
  }
  function readableError(error) {
    return error instanceof Error ? error.message : String(error);
  }
  function normalizeModelsText(value, activeModel) {
    const models = String(value || "").split(/\n+/).map((item) => item.trim()).filter(Boolean);
    if (activeModel && !models.includes(activeModel)) models.unshift(activeModel);
    return `${models.join("\n")}
`;
  }
  function firstModel(modelsText) {
    return String(modelsText || "").split(/\n+/).map((item) => item.trim()).find(Boolean) || "";
  }
  function ensureSelectOption(select, value) {
    if (!value) return;
    if (Array.from(select.options).some((option2) => option2.value === value)) return;
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
})();
