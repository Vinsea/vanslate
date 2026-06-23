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

  // src/core/utils.ts
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

  // src/entries/popup.ts
  var ext = globalThis.browser || chrome;
  var statusNode = document.querySelector("#status");
  var translateBtn = document.querySelector("#translateBtn");
  var clearBtn = document.querySelector("#clearBtn");
  var optionsBtn = document.querySelector("#optionsBtn");
  var quickModel = document.querySelector("#quickModel");
  var quickSourceLanguage = document.querySelector("#quickSourceLanguage");
  var quickTargetLanguage = document.querySelector("#quickTargetLanguage");
  var swapLanguagesBtn = document.querySelector("#swapLanguagesBtn");
  var quickToolsList = document.querySelector("#quickToolsList");
  var currentSelectionTools = [];
  var currentGlobalModels = [];
  var currentUiLanguage = "zh-CN";
  init();
  async function init() {
    const response = await ext.runtime.sendMessage({ type: "GET_SETTINGS" });
    if (!response?.ok) {
      setStatus(response?.error || t("configReadFailed"), true);
      return;
    }
    const settings = response.settings;
    currentUiLanguage = VanslateI18n.normalizeLanguage(settings.uiLanguage || currentUiLanguage);
    applyI18n();
    renderModelOptions(settings);
    const raw = await readStorageValues(ext.storage.local, ["selectionTools"]);
    const storedTools = Array.isArray(raw.selectionTools) && raw.selectionTools.length ? raw.selectionTools : null;
    currentSelectionTools = normalizeTools(normalizeSelectionTools(storedTools || settings.selectionTools));
    renderQuickTools(settings);
    ensureSelectOption(quickSourceLanguage, settings.sourceLanguage || "auto");
    ensureSelectOption(quickTargetLanguage, settings.targetLanguage || "");
    quickSourceLanguage.value = settings.sourceLanguage || "auto";
    quickTargetLanguage.value = settings.targetLanguage || "";
  }
  swapLanguagesBtn.addEventListener("click", async () => {
    const source = quickSourceLanguage.value.trim();
    const target = quickTargetLanguage.value.trim();
    quickSourceLanguage.value = target || "auto";
    quickTargetLanguage.value = source && source.toLowerCase() !== "auto" ? source : "";
    await saveQuickSettings();
  });
  translateBtn.addEventListener("click", async () => {
    await runTabAction(t("translating"), async (tab) => {
      await saveQuickSettings();
      const response = await ext.tabs.sendMessage(tab.id, {
        type: "TRANSLATE_PAGE",
        options: {}
      });
      if (!response?.ok) throw new Error(response?.error || t("translateFailed"));
      return t("translateQueued", { count: response.queuedCount || response.translatedCount || 0 });
    });
  });
  clearBtn.addEventListener("click", async () => {
    await runTabAction(t("clearing"), async (tab) => {
      const response = await ext.tabs.sendMessage(tab.id, { type: "CLEAR_TRANSLATIONS" });
      if (!response?.ok) throw new Error(response?.error || t("clearFailed"));
      return t("currentPageCleared");
    });
  });
  optionsBtn.addEventListener("click", () => {
    ext.runtime.openOptionsPage();
  });
  async function saveQuickSettings() {
    syncQuickToolsFromUi();
    const settings = {
      model: quickModel.value.trim(),
      activeModel: quickModel.value.trim(),
      sourceLanguage: quickSourceLanguage.value.trim() || "auto",
      targetLanguage: quickTargetLanguage.value.trim(),
      selectionTools: currentSelectionTools
    };
    if (!settings.model || !settings.targetLanguage) {
      throw new Error(t("modelAndTargetRequired"));
    }
    await writeStorageValues(ext.storage.local, settings);
  }
  async function runTabAction(loadingText, action) {
    setStatus(loadingText);
    setBusy(true);
    try {
      const tab = await getActiveTab();
      await ensureContentScript(tab.id);
      const message = await action(tab);
      setStatus(message);
    } catch (error) {
      setStatus(readableError(error), true);
    } finally {
      setBusy(false);
    }
  }
  async function getActiveTab() {
    const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("\u627E\u4E0D\u5230\u5F53\u524D\u6807\u7B7E\u9875\u3002");
    return tab;
  }
  async function ensureContentScript(tabId) {
    try {
      await ext.tabs.sendMessage(tabId, { type: "PING" });
    } catch {
      if (!ext.scripting) {
        throw new Error("\u5F53\u524D\u9875\u9762\u672A\u6CE8\u5165\u5185\u5BB9\u811A\u672C\uFF0C\u8BF7\u5237\u65B0\u9875\u9762\u540E\u91CD\u8BD5\u3002");
      }
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
  function renderModelOptions(settings) {
    const activeModel = settings.activeModel || settings.model || "";
    const models = String(settings.models || activeModel || "").split(/\n+/).map((item) => item.trim()).filter(Boolean);
    if (activeModel && !models.includes(activeModel)) models.unshift(activeModel);
    currentGlobalModels = models;
    quickModel.textContent = "";
    models.forEach((model) => {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = model;
      quickModel.appendChild(option);
    });
    quickModel.value = activeModel || models[0] || "";
  }
  function renderQuickTools(settings) {
    quickToolsList.textContent = "";
    currentSelectionTools.forEach((tool) => {
      const row = document.createElement("div");
      row.className = "quickToolRow";
      row.dataset.toolId = tool.id;
      const toggle = document.createElement("label");
      toggle.className = "quickToolToggle";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = tool.enabled !== false;
      const name = document.createElement("span");
      name.textContent = tool.name;
      toggle.append(checkbox, name);
      const select = document.createElement("select");
      select.className = "quickToolModel";
      const inherit = document.createElement("option");
      inherit.value = "__inherit__";
      inherit.textContent = t("inheritModel", { model: settings.activeModel || settings.model || t("model") });
      select.appendChild(inherit);
      getToolModels(tool).forEach((model) => {
        const option = document.createElement("option");
        option.value = model;
        option.textContent = model;
        select.appendChild(option);
      });
      const active = tool.activeModel || tool.model || "";
      select.value = tool.modelMode === "custom" && active ? active : "__inherit__";
      row.append(toggle, select);
      quickToolsList.appendChild(row);
    });
  }
  function syncQuickToolsFromUi() {
    const rows = Array.from(quickToolsList.querySelectorAll(".quickToolRow"));
    rows.forEach((row) => {
      const tool = currentSelectionTools.find((item) => item.id === row.dataset.toolId);
      if (!tool) return;
      const checked = row.querySelector("input")?.checked !== false;
      const model = row.querySelector("select")?.value || "__inherit__";
      tool.enabled = checked;
      if (model === "__inherit__") {
        tool.modelMode = "inherit";
      } else {
        tool.modelMode = "custom";
        tool.model = model;
        tool.activeModel = model;
        const models = new Set(getToolModels(tool));
        models.add(model);
        tool.models = Array.from(models).join("\n");
      }
    });
  }
  function getToolModels(tool) {
    const models = String(tool.models || tool.model || "").split(/\n+/).map((item) => item.trim()).filter(Boolean);
    const active = tool.activeModel || tool.model || "";
    if (active && !models.includes(active)) models.unshift(active);
    currentGlobalModels.forEach((model) => {
      if (model && !models.includes(model)) models.push(model);
    });
    return models;
  }
  function normalizeTools(tools) {
    return (Array.isArray(tools) ? tools : []).map((tool, index) => ({
      ...tool,
      id: String(tool?.id || `tool_${index + 1}`),
      name: String(tool?.name || `\u5DE5\u5177 ${index + 1}`),
      enabled: tool?.enabled !== false,
      modelMode: tool?.modelMode === "custom" ? "custom" : "inherit",
      model: String(tool?.activeModel || tool?.model || ""),
      activeModel: String(tool?.activeModel || tool?.model || ""),
      models: String(tool?.models || tool?.model || "")
    }));
  }
  function ensureSelectOption(select, value) {
    if (!value) return;
    if (Array.from(select.options).some((option2) => option2.value === value)) return;
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
  function setBusy(isBusy) {
    translateBtn.disabled = isBusy;
    clearBtn.disabled = isBusy;
  }
  function setStatus(message, isError = false) {
    if (!statusNode) return;
    statusNode.textContent = message;
    statusNode.classList.toggle("error", isError);
  }
  function readableError(error) {
    return error instanceof Error ? error.message : String(error);
  }
  function t(key, values = {}) {
    return VanslateI18n.t(key, currentUiLanguage, values);
  }
  function applyI18n() {
    VanslateI18n.apply(document, currentUiLanguage);
  }
})();
