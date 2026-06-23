"use strict";
(() => {
  // src/core/storage-keys.ts
  var STORAGE_KEY_PREFIX = "vv_vanslate_";
  var CRYPTO_SECRET_KEY = "cryptoSecret";
  var ENCRYPTED_PREFIX = "vvenc1:";
  function storageKey(key) {
    return key.startsWith(STORAGE_KEY_PREFIX) ? key : `${STORAGE_KEY_PREFIX}${key}`;
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
  var DEFAULT_COLLECTION_RULES = {
    blockTags: ["H1", "H2", "H3", "H4", "H5", "H6", "P", "LI", "BLOCKQUOTE", "FIGCAPTION", "TD", "TH", "DT", "DD"],
    formTags: ["LABEL", "LEGEND", "CAPTION", "SUMMARY"],
    supplementalTags: ["DIV", "SPAN"],
    supplementalContextPattern: "comment|comments|cmtx|review|feedback|discussion|reply",
    metadataPattern: "avatar|gravatar|author|user(name)?|date|time|timestamp|count|rating|stars|captcha|honeypot|pagination|page_number"
  };

  // src/entries/content.ts
  var ext = globalThis.browser || chrome;
  var TRANSLATION_CLASS = "vanslate-result";
  var LOADING_CLASS = "vanslate-loading";
  var TOOLBAR_ID = "vanslate-toolbar";
  var PANEL_ID = "vanslate-selection-panel";
  var PROGRESS_ID = "vanslate-progress";
  var FLOATING_BALL_ID = "vanslate-floating-ball";
  var STATE_ATTR = "data-vanslate-state";
  var ID_ATTR = "data-vanslate-id";
  var CLONE_ATTR = "data-vanslate-clone";
  var SAFE_INLINE_TAGS = /* @__PURE__ */ new Set(["A", "B", "BR", "CODE", "EM", "I", "KBD", "MARK", "S", "SAMP", "SMALL", "SPAN", "STRONG", "SUB", "SUP", "U", "VAR"]);
  var SAFE_INLINE_STYLE_PROPS = ["color", "background-color", "font-weight", "font-style", "text-decoration"];
  var MAX_BLOCKS_PER_PASS = 80;
  var FLOATING_DRAG_THRESHOLD = 4;
  var pendingElements = /* @__PURE__ */ new Map();
  var failedElements = /* @__PURE__ */ new Map();
  var latestProgress = null;
  var lastSelectionSignature = "";
  var dismissedSelectionSignature = "";
  var selectionTimer = 0;
  var suppressSelectionToolbarUntil = 0;
  var pointerDownSelectionSignature = "";
  var pointerDownX = 0;
  var pointerDownY = 0;
  var pointerDownWasOutsideSelectionUi = false;
  var nextElementId = 1;
  var virtualObserver = null;
  var virtualModeEnabled = false;
  var collectTimer = 0;
  var virtualCollectInFlight = false;
  var virtualCollectQueued = false;
  var virtualDirtyRoots = /* @__PURE__ */ new Set();
  var translatedCount = 0;
  var selectionTools = [];
  var usageTotal = {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0
  };
  var extensionContextInvalidated = false;
  var currentSettings = {
    renderMode: "inline",
    translationColorEnabled: false,
    translationColor: "",
    translationCss: "",
    uiLanguage: "zh-CN",
    enableFloatingBall: true,
    floatingBallMode: "always",
    collectionRules: DEFAULT_COLLECTION_RULES,
    floatingBallPosition: {
      side: "right",
      top: 0.42
    }
  };
  ext.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "PING") {
      sendResponse({ ok: true });
      return false;
    }
    if (message?.type === "TRANSLATE_PAGE") {
      translatePage(message.options || {}).then((result) => sendResponse({ ok: true, ...result })).catch((error) => sendResponse({ ok: false, error: readableError(error), quotaLimited: isQuotaLimit(error) }));
      return true;
    }
    if (message?.type === "TRANSLATE_SELECTION") {
      translateSelection().then((result) => sendResponse({ ok: true, ...result })).catch((error) => sendResponse({ ok: false, error: readableError(error), quotaLimited: isQuotaLimit(error) }));
      return true;
    }
    if (message?.type === "TRANSLATION_ITEM_RESULT") {
      applyItemResult(message.item);
      sendResponse({ ok: true });
      return false;
    }
    if (message?.type === "CLEAR_TRANSLATIONS") {
      clearTranslations();
      sendResponse({ ok: true });
      return false;
    }
    if (message?.type === "TRANSLATION_PROGRESS") {
      latestProgress = message.progress;
      renderProgress(latestProgress);
      sendResponse({ ok: true });
      return false;
    }
    if (message?.type === "GET_PAGE_STATE") {
      sendResponse({
        ok: true,
        url: location.href,
        progress: latestProgress,
        translatedCount,
        pendingCount: pendingElements.size,
        virtualModeEnabled,
        selection: normalizeText(getSelectionText())
      });
      return false;
    }
    return false;
  });
  document.addEventListener("mouseup", scheduleSelectionToolbar);
  document.addEventListener("keyup", scheduleSelectionToolbar);
  document.addEventListener("pointerdown", handleSelectionUiPointerDown, true);
  document.addEventListener("click", handleSelectionUiClick, true);
  document.addEventListener("selectionchange", () => {
    window.clearTimeout(selectionTimer);
    selectionTimer = window.setTimeout(scheduleSelectionToolbar, 120);
  });
  initAutoTranslate();
  initFloatingBall();
  try {
    ext.storage?.onChanged?.addListener((changes, areaName) => {
      if (areaName && areaName !== "local") return;
      if (!changes[storageKey("floatingBallMode")] && !changes[storageKey("enableFloatingBall")] && !changes[storageKey("floatingBallPosition")]) return;
      initFloatingBall().catch(handleAsyncExtensionError);
    });
  } catch (error) {
    handleAsyncExtensionError(error);
  }
  async function initAutoTranslate() {
    const response = await safeRuntimeSendMessage({ type: "GET_SETTINGS" });
    const settings = response?.settings;
    if (!settings?.enableAutoTranslate) return;
    if (!matchesRules(location.href, settings.autoTranslateRules)) return;
    window.setTimeout(() => {
      translatePage({ preserveOriginal: settings.preserveOriginal !== false, auto: true }).catch((error) => {
        showProgressError(readableError(error));
      });
    }, 900);
  }
  async function translatePage(options) {
    currentSettings = await loadRenderSettings();
    virtualModeEnabled = true;
    startVirtualObserver();
    const items = await collectAndMarkTextBlocks();
    if (!items.length) {
      return { translatedCount: 0, message: "No translatable text blocks found." };
    }
    setBusy(true);
    renderProgress({ done: 0, total: items.length, cachedCount: 0, stage: "translating" });
    try {
      const response = await safeRuntimeSendMessage({
        type: "TRANSLATE_TEXTS",
        texts: items,
        progressId: `page-${Date.now()}`,
        mode: options.auto ? "auto" : "page"
      });
      if (extensionContextInvalidated) return { translatedCount: 0, queuedCount: 0 };
      if (!response?.ok) {
        markItemsFailed(items, response?.error || "Translation failed.");
        const error = new Error(response?.error || "Translation failed.");
        error.quotaLimited = response?.quotaLimited;
        throw error;
      }
      return {
        translatedCount: response.translatedCount || items.length,
        cachedCount: response.cachedCount || 0,
        queuedCount: items.length
      };
    } finally {
      setBusy(false);
      scheduleVirtualCollect();
    }
  }
  async function translateSelection(toolId = "translate", toolName = "") {
    const text = normalizeText(getSelectionText());
    if (!text) throw new Error(tc("selectTextFirst"));
    const panel = ensureSelectionPanel();
    panel.classList.remove("is-word-card");
    renderSelectionLoading(panel, toolName);
    panel.hidden = false;
    positionSelectionPanel(panel);
    const response = await safeRuntimeSendMessage({
      type: "RUN_SELECTION_TOOL",
      toolId,
      text
    });
    if (extensionContextInvalidated) throw new Error("Extension context invalidated. Please refresh this page.");
    if (!response?.ok) {
      const error = new Error(response?.error || tc("toolFailed"));
      error.quotaLimited = response?.quotaLimited;
      throw error;
    }
    renderToolResult(panel, response.result);
    usageTotal = addUsage(usageTotal, response.result?.usage);
    renderProgress({
      ...latestProgress || {},
      usage: usageTotal,
      total: latestProgress?.total || 0,
      done: latestProgress?.done || 0
    });
    return { result: response.result?.text || "" };
  }
  async function collectAndMarkTextBlocks(roots = [document.body || document.documentElement]) {
    const blocks = await collectTextBlocks(roots);
    const items = [];
    for (let index = 0; index < blocks.length; index += 1) {
      const element = blocks[index];
      const id = ensureElementId(element);
      const text = getElementSourceText(element);
      markElementLoading(element, id, text);
      items.push({ id, text });
      if (index % 8 === 7) await yieldToPage();
    }
    return items;
  }
  async function collectTextBlocks(roots = [document.body || document.documentElement]) {
    const candidates = [];
    const seen = /* @__PURE__ */ new Set();
    let visited = 0;
    for (const root of normalizeCollectRoots(roots)) {
      if (!root || !root.isConnected) continue;
      pushTextCandidate(root, candidates, seen);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      let node = walker.nextNode();
      while (node) {
        if (node instanceof HTMLElement) pushTextCandidate(node, candidates, seen);
        visited += 1;
        if (visited % 280 === 0) await yieldToPage();
        node = walker.nextNode();
      }
    }
    candidates.sort((a, b) => getElementDepth(b) - getElementDepth(a));
    const blocks = [];
    for (let index = 0; index < candidates.length; index += 1) {
      const element = candidates[index];
      if (blocks.length >= MAX_BLOCKS_PER_PASS) break;
      if (!(element instanceof HTMLElement)) continue;
      if (element.hasAttribute(STATE_ATTR)) continue;
      if (element.hasAttribute(CLONE_ATTR) || element.classList.contains(TRANSLATION_CLASS)) continue;
      if (element.closest(`#${PANEL_ID}, #${PROGRESS_ID}, #${TOOLBAR_ID}`)) continue;
      if (element.closest(`[${CLONE_ATTR}], .${TRANSLATION_CLASS}`)) continue;
      if (isIgnoredCandidate(element)) continue;
      if (!isVisible(element)) continue;
      const text = getElementSourceText(element);
      if (!isUsefulText(text, element)) continue;
      if (overlapsQueuedBlock(element, blocks)) continue;
      blocks.push(element);
      if (index % 24 === 23) await yieldToPage();
    }
    return blocks;
  }
  function normalizeCollectRoots(roots) {
    const fallback = document.body || document.documentElement;
    const input = Array.isArray(roots) && roots.length ? roots : [fallback];
    const output = [];
    input.forEach((root) => {
      const element = normalizeCollectRoot(root) || fallback;
      if (!(element instanceof HTMLElement)) return;
      if (!element.isConnected) return;
      if (element.closest(`#${PANEL_ID}, #${PROGRESS_ID}, #${TOOLBAR_ID}, #${FLOATING_BALL_ID}`)) return;
      const covered = output.some((item) => item === element || item.contains(element));
      if (covered) return;
      for (let index = output.length - 1; index >= 0; index -= 1) {
        if (element.contains(output[index])) output.splice(index, 1);
      }
      output.push(element);
    });
    return output.length ? output : [fallback].filter(Boolean);
  }
  function normalizeCollectRoot(root) {
    if (!root) return null;
    if (root instanceof HTMLElement) return root;
    if (root instanceof Text) return root.parentElement;
    if (root instanceof Node && root.parentElement) return root.parentElement;
    return null;
  }
  function pushTextCandidate(element, candidates, seen) {
    if (!(element instanceof HTMLElement)) return;
    if (seen.has(element)) return;
    if (!isPotentialTextBlock(element)) return;
    seen.add(element);
    candidates.push(element);
  }
  function isPotentialTextBlock(element) {
    const rules = currentSettings.collectionRules || DEFAULT_COLLECTION_RULES;
    const tag = element.tagName;
    if (rules.blockTags.includes(tag)) {
      return true;
    }
    if (rules.formTags.includes(tag)) {
      return true;
    }
    if (rules.supplementalTags.includes(tag) && isSupplementalTextBlock(element)) {
      return true;
    }
    if (tag === "A" || tag === "SPAN") {
      return Boolean(element.closest("nav, aside, [role='navigation'], [aria-label*='content' i], [aria-label*='table' i], [aria-label*='toc' i], [aria-label*='article' i], [class*='toc' i], [class*='table-of-contents' i], [data-testid*='toc' i]"));
    }
    return false;
  }
  function isSupplementalTextBlock(element) {
    if (isLikelyMetadataText(element)) return false;
    if (!hasDirectUsefulText(element)) return false;
    if (hasUsefulElementChild(element)) return false;
    if (element.closest("form, [role='form']")) return true;
    const signature = elementSignature(element);
    return safePattern(currentSettings.collectionRules?.supplementalContextPattern, DEFAULT_COLLECTION_RULES.supplementalContextPattern).test(signature);
  }
  function hasDirectUsefulText(element) {
    return Array.from(element.childNodes).some((node) => {
      if (node.nodeType !== Node.TEXT_NODE) return false;
      return /[A-Za-z\u4e00-\u9fff]/.test(normalizeText(node.textContent));
    });
  }
  function hasUsefulElementChild(element) {
    return Array.from(element.children).some((child) => {
      if (!(child instanceof HTMLElement)) return false;
      if (child.matches(`.${TRANSLATION_CLASS}, .${LOADING_CLASS}, .vanslate-inline-row, .vanslate-error-retry`)) return false;
      if (child.matches("br, wbr, img, svg, i")) return false;
      return /[A-Za-z\u4e00-\u9fff]/.test(normalizeText(child.textContent));
    });
  }
  function isLikelyMetadataText(element) {
    const signature = elementSignature(element);
    return safePattern(currentSettings.collectionRules?.metadataPattern, DEFAULT_COLLECTION_RULES.metadataPattern).test(signature);
  }
  function elementSignature(element) {
    return [element.id, element.className, element.getAttribute("role"), element.getAttribute("aria-label")].join(" ");
  }
  function normalizeCollectionRules(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
      blockTags: normalizeTagList(source.blockTags, DEFAULT_COLLECTION_RULES.blockTags),
      formTags: normalizeTagList(source.formTags, DEFAULT_COLLECTION_RULES.formTags),
      supplementalTags: normalizeTagList(source.supplementalTags, DEFAULT_COLLECTION_RULES.supplementalTags),
      supplementalContextPattern: normalizePatternSource(source.supplementalContextPattern, DEFAULT_COLLECTION_RULES.supplementalContextPattern),
      metadataPattern: normalizePatternSource(source.metadataPattern, DEFAULT_COLLECTION_RULES.metadataPattern)
    };
  }
  function normalizeTagList(value, fallback) {
    const list = Array.isArray(value) ? value : fallback;
    const normalized = list.map((tag) => String(tag || "").trim().toUpperCase()).filter(Boolean);
    return normalized.length ? Array.from(new Set(normalized)) : fallback;
  }
  function normalizePatternSource(value, fallback) {
    const pattern = String(value || "").trim();
    return pattern ? pattern : fallback;
  }
  function safePattern(value, fallback) {
    try {
      return new RegExp(normalizePatternSource(value, fallback), "i");
    } catch {
      return new RegExp(fallback, "i");
    }
  }
  function markElementLoading(element, id, text = "") {
    element.setAttribute(STATE_ATTR, "pending");
    pendingElements.set(id, {
      element,
      text,
      settings: { ...currentSettings }
    });
    element.querySelectorAll(".vanslate-error-retry").forEach((node) => node.remove());
    const loading = document.createElement("span");
    loading.className = LOADING_CLASS;
    loading.setAttribute("aria-label", "translating");
    loading.textContent = "";
    appendInlineResult(element, loading);
  }
  function applyItemResult(item) {
    if (!item?.id) return;
    const pending = pendingElements.get(item.id);
    const element = pending?.element || document.querySelector(`[${ID_ATTR}="${cssEscape(item.id)}"]`);
    if (!element) return;
    pendingElements.delete(item.id);
    usageTotal = addUsage(usageTotal, item.usage);
    element.querySelectorAll(`.${LOADING_CLASS}`).forEach((node) => node.remove());
    element.querySelectorAll(".vanslate-inline-row").forEach((node) => {
      if (!normalizeText(node.textContent)) node.remove();
    });
    if (item.error) {
      element.setAttribute(STATE_ATTR, "error");
      element.querySelectorAll(".vanslate-error-retry").forEach((node) => node.remove());
      failedElements.set(item.id, {
        element,
        text: pending?.text || item.text || getElementSourceText(element),
        settings: pending?.settings || currentSettings,
        error: readableError(item.error)
      });
      appendInlineResult(element, createErrorRetryButton(item.id, readableError(item.error)));
      return;
    }
    failedElements.delete(item.id);
    if (item.skipped) {
      element.setAttribute(STATE_ATTR, "skipped");
      return;
    }
    const text = String(item.translation || "").trim();
    if (!text) {
      element.setAttribute(STATE_ATTR, "skipped");
      return;
    }
    element.setAttribute(STATE_ATTR, "done");
    renderTranslation(element, text, pending?.settings || currentSettings);
    translatedCount += 1;
  }
  function renderTranslation(element, text, settings) {
    if (settings.renderMode === "block" && isBlockElement(element)) {
      appendBlockClone(element, text, settings);
      return;
    }
    const translationNode = document.createElement("span");
    translationNode.className = TRANSLATION_CLASS;
    setTranslationContent(translationNode, text);
    applyTranslationStyle(translationNode, settings);
    appendInlineResult(element, translationNode);
  }
  function appendBlockClone(element, text, settings) {
    const clone = element.cloneNode(true);
    clone.querySelectorAll(`.${TRANSLATION_CLASS}, .${LOADING_CLASS}, .vanslate-inline-row`).forEach((node) => node.remove());
    clone.removeAttribute(STATE_ATTR);
    clone.removeAttribute(ID_ATTR);
    clone.setAttribute(CLONE_ATTR, "true");
    clone.classList.add(TRANSLATION_CLASS, "is-block-clone");
    setTranslationContent(clone, text);
    applyTranslationStyle(clone, settings);
    element.insertAdjacentElement("afterend", clone);
  }
  function appendInlineResult(element, node) {
    const tag = element.tagName;
    if (["TR", "TBODY", "THEAD", "TFOOT", "TABLE", "UL", "OL"].includes(tag)) return;
    if (tag === "TD" || tag === "TH") {
      node.classList.add("is-table-cell-result");
      element.appendChild(node);
      return;
    }
    if (tag === "LI" && hasBlockChild(element)) {
      const wrapper = document.createElement("p");
      wrapper.className = "vanslate-inline-row";
      wrapper.appendChild(node);
      element.appendChild(wrapper);
      return;
    }
    element.appendChild(node);
  }
  function markItemsFailed(items, message) {
    items.forEach((item) => {
      applyItemResult({ id: item.id, error: message });
    });
  }
  function createErrorRetryButton(id, message) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "vanslate-error-retry";
    button.textContent = "!";
    button.title = `${tc("translationFailedRetry")}: ${message}`;
    button.setAttribute("aria-label", tc("translationFailedRetry"));
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      retryFailedItem(id).catch((error) => {
        const failed = failedElements.get(id);
        const element = failed?.element || document.querySelector(`[${ID_ATTR}="${cssEscape(id)}"]`);
        if (!element) return;
        element.querySelectorAll(`.${LOADING_CLASS}`).forEach((node) => node.remove());
        element.querySelectorAll(".vanslate-error-retry").forEach((node) => node.remove());
        appendInlineResult(element, createErrorRetryButton(id, readableError(error)));
      });
    });
    return button;
  }
  async function retryFailedItem(id) {
    const failed = failedElements.get(id);
    if (!failed?.element || !failed.text) return;
    currentSettings = await loadRenderSettings();
    failed.element.querySelectorAll(".vanslate-error-retry").forEach((node) => node.remove());
    markElementLoading(failed.element, id, failed.text);
    const response = await safeRuntimeSendMessage({
      type: "TRANSLATE_TEXTS",
      texts: [{ id, text: failed.text }],
      progressId: `retry-${Date.now()}`,
      mode: "retry"
    });
    if (extensionContextInvalidated) return;
    if (!response?.ok) {
      markItemsFailed([{ id, text: failed.text }], response?.error || "Translation failed.");
    }
  }
  function clearTranslations() {
    stopVirtualObserver();
    virtualDirtyRoots.clear();
    virtualCollectQueued = false;
    virtualCollectInFlight = false;
    document.querySelectorAll(`[${CLONE_ATTR}], .${TRANSLATION_CLASS}, .${LOADING_CLASS}, .vanslate-inline-row`).forEach((node) => node.remove());
    document.querySelectorAll(`[${STATE_ATTR}]`).forEach((node) => {
      node.removeAttribute(STATE_ATTR);
      node.removeAttribute(ID_ATTR);
    });
    pendingElements.clear();
    failedElements.clear();
    translatedCount = 0;
    usageTotal = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    };
    renderProgress(null);
  }
  async function initFloatingBall() {
    currentSettings = await loadRenderSettings();
    if (currentSettings.floatingBallMode === "hidden" || !currentSettings.enableFloatingBall) {
      document.getElementById(FLOATING_BALL_ID)?.remove();
      return;
    }
    ensureFloatingBall();
  }
  function ensureFloatingBall() {
    const existing = document.getElementById(FLOATING_BALL_ID);
    if (existing) {
      existing.dataset.mode = currentSettings.floatingBallMode;
      existing.classList.toggle("is-corner-hover", currentSettings.floatingBallMode === "hover");
      applyFloatingBallPosition(existing, currentSettings.floatingBallPosition);
      if (currentSettings.floatingBallMode !== "hover" && existing.dataset.dragReady !== "true") {
        initFloatingBallDrag(existing);
        existing.dataset.dragReady = "true";
      }
      return;
    }
    const ball = document.createElement("button");
    ball.id = FLOATING_BALL_ID;
    ball.type = "button";
    ball.title = tc("fullTranslate");
    ball.setAttribute("aria-label", tc("fullTranslate"));
    ball.dataset.mode = currentSettings.floatingBallMode;
    ball.classList.toggle("is-corner-hover", currentSettings.floatingBallMode === "hover");
    ball.appendChild(createLogoImage(tc("fullTranslate"), "icons/vanslate-floating.svg"));
    ball.addEventListener("click", (event) => {
      if (ball.dataset.dragged === "true") {
        event.preventDefault();
        return;
      }
      translatePage({ fromFloatingBall: true }).catch((error) => {
        showProgressError(readableError(error));
      });
    });
    document.documentElement.appendChild(ball);
    applyFloatingBallPosition(ball, currentSettings.floatingBallPosition);
    if (currentSettings.floatingBallMode !== "hover") {
      initFloatingBallDrag(ball);
      ball.dataset.dragReady = "true";
    }
    window.addEventListener("resize", () => applyFloatingBallPosition(ball, currentSettings.floatingBallPosition), { passive: true });
  }
  function startVirtualObserver() {
    if (virtualObserver) return;
    virtualObserver = new MutationObserver((mutations) => {
      if (!virtualModeEnabled) return;
      if (!markVirtualMutationRoots(mutations)) return;
      scheduleVirtualCollect();
    });
    virtualObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
    window.addEventListener("scroll", scheduleViewportVirtualCollect, { passive: true });
    window.addEventListener("resize", scheduleViewportVirtualCollect, { passive: true });
  }
  function stopVirtualObserver() {
    virtualModeEnabled = false;
    if (virtualObserver) {
      virtualObserver.disconnect();
      virtualObserver = null;
    }
    window.removeEventListener("scroll", scheduleViewportVirtualCollect);
    window.removeEventListener("resize", scheduleViewportVirtualCollect);
  }
  function scheduleViewportVirtualCollect() {
    markVirtualDirtyRoot(document.body || document.documentElement);
    scheduleVirtualCollect();
  }
  function scheduleVirtualCollect(root = null) {
    if (!virtualModeEnabled) return;
    markVirtualDirtyRoot(root);
    if (virtualCollectInFlight) {
      virtualCollectQueued = true;
      return;
    }
    window.clearTimeout(collectTimer);
    collectTimer = window.setTimeout(runVirtualCollect, 350);
  }
  async function runVirtualCollect() {
    if (!virtualModeEnabled) return;
    if (virtualCollectInFlight) {
      virtualCollectQueued = true;
      return;
    }
    virtualCollectInFlight = true;
    let items = [];
    try {
      currentSettings = await loadRenderSettings();
      items = await collectAndMarkTextBlocks(takeVirtualDirtyRoots());
      if (!items.length) return;
      renderProgress({
        done: latestProgress?.done || translatedCount,
        total: (latestProgress?.total || translatedCount) + items.length,
        cachedCount: latestProgress?.cachedCount || 0,
        skippedCount: latestProgress?.skippedCount || 0,
        stage: "translating"
      });
      const response = await safeRuntimeSendMessage({
        type: "TRANSLATE_TEXTS",
        texts: items,
        progressId: `virtual-${Date.now()}`,
        mode: "virtual-scroll"
      });
      if (extensionContextInvalidated) return;
      if (!response?.ok) markItemsFailed(items, response?.error || "Translation failed.");
    } catch (error) {
      if (items.length) markItemsFailed(items, readableError(error));
    } finally {
      virtualCollectInFlight = false;
      if (virtualCollectQueued || virtualDirtyRoots.size) {
        virtualCollectQueued = false;
        scheduleVirtualCollect();
      }
    }
  }
  function markVirtualMutationRoots(mutations) {
    let hasRoots = false;
    mutations.forEach((mutation) => {
      if (mutation.target) {
        hasRoots = markVirtualDirtyRoot(mutation.target) || hasRoots;
      }
      mutation.addedNodes.forEach((node) => {
        hasRoots = markVirtualDirtyRoot(node) || hasRoots;
      });
    });
    return hasRoots;
  }
  function markVirtualDirtyRoot(root) {
    const element = normalizeCollectRoot(root);
    if (!(element instanceof HTMLElement)) return false;
    if (!element.isConnected) return false;
    if (element.closest(`#${PANEL_ID}, #${PROGRESS_ID}, #${TOOLBAR_ID}, #${FLOATING_BALL_ID}, [${CLONE_ATTR}], .${TRANSLATION_CLASS}`)) return false;
    virtualDirtyRoots.add(element);
    return true;
  }
  function takeVirtualDirtyRoots() {
    if (!virtualDirtyRoots.size) {
      return [document.body || document.documentElement].filter(Boolean);
    }
    const roots = normalizeCollectRoots(Array.from(virtualDirtyRoots));
    virtualDirtyRoots.clear();
    return roots;
  }
  function scheduleSelectionToolbar() {
    if (Date.now() < suppressSelectionToolbarUntil) return;
    const info = getSelectionInfo();
    if (!info) {
      if (isSelectionUiActive()) return;
      hideSelectionUi();
      return;
    }
    if (info.signature === dismissedSelectionSignature) return;
    const toolbar = document.getElementById(TOOLBAR_ID);
    if (info.signature === lastSelectionSignature && toolbar && !toolbar.hidden) return;
    dismissedSelectionSignature = "";
    lastSelectionSignature = info.signature;
    showSelectionToolbar(info);
  }
  function getSelectionInfo() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const text = normalizeText(selection.toString());
    if (!text || text.length < 2) return null;
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    if (!rect.width && !rect.height) return null;
    return {
      text,
      rect,
      signature: [
        text,
        Math.round(rect.left + window.scrollX),
        Math.round(rect.top + window.scrollY),
        Math.round(rect.width),
        Math.round(rect.height)
      ].join("|")
    };
  }
  function showSelectionToolbar(selectionInfo = getSelectionInfo()) {
    if (!selectionInfo) return;
    const { rect } = selectionInfo;
    const toolbar = ensureToolbar();
    renderSelectionToolButtons(toolbar);
    toolbar.style.left = `${Math.max(8, rect.left + window.scrollX)}px`;
    toolbar.style.top = `${Math.max(8, rect.bottom + window.scrollY + 8)}px`;
    toolbar.style.display = "inline-flex";
    toolbar.hidden = false;
  }
  function ensureToolbar() {
    let toolbar = document.getElementById(TOOLBAR_ID);
    if (toolbar) return toolbar;
    toolbar = document.createElement("div");
    toolbar.id = TOOLBAR_ID;
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", tc("toolbar"));
    toolbar.addEventListener("mousedown", (event) => event.preventDefault());
    toolbar.addEventListener("click", (event) => {
      if (event.target.closest(".vanslate-toolbar-trigger")) {
        toolbar.classList.toggle("is-open");
      }
    });
    document.documentElement.appendChild(toolbar);
    return toolbar;
  }
  async function renderSelectionToolButtons(toolbar) {
    const tools = await loadSelectionTools();
    const signature = tools.map((tool) => `${tool.id}:${tool.name}`).join("|");
    if (toolbar.dataset.signature === signature) return;
    toolbar.dataset.signature = signature;
    toolbar.textContent = "";
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "vanslate-toolbar-trigger";
    trigger.title = tc("tools");
    trigger.setAttribute("aria-label", tc("expandToolbar"));
    const logo = document.createElement("img");
    logo.src = safeRuntimeGetURL("icons/png/vanslate-128.png");
    logo.alt = "";
    trigger.appendChild(logo);
    const menu = document.createElement("div");
    menu.className = "vanslate-tool-menu";
    menu.setAttribute("role", "menu");
    tools.forEach((tool) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "vanslate-tool-button";
      button.textContent = tool.name;
      button.title = tc("useTool", { name: tool.name });
      button.setAttribute("role", "menuitem");
      button.addEventListener("click", async () => {
        toolbar.classList.remove("is-open");
        button.classList.add("is-loading");
        button.disabled = true;
        try {
          await translateSelection(tool.id, tool.name);
        } catch (error) {
          const panel = ensureSelectionPanel();
          panel.textContent = readableError(error);
          panel.hidden = false;
          positionSelectionPanel(panel);
        } finally {
          button.classList.remove("is-loading");
          button.disabled = false;
        }
      });
      menu.appendChild(button);
    });
    toolbar.append(trigger, menu);
  }
  function initFloatingBallDrag(ball) {
    let drag = null;
    ball.addEventListener("pointerdown", (event) => {
      if (currentSettings.floatingBallMode === "hover") return;
      if (event.button !== 0) return;
      const rect = ball.getBoundingClientRect();
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        moved: false
      };
      ball.setPointerCapture?.(event.pointerId);
    });
    ball.addEventListener("pointermove", (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (distance < FLOATING_DRAG_THRESHOLD && !drag.moved) return;
      drag.moved = true;
      ball.classList.add("is-dragging");
      const left = clamp(event.clientX - drag.offsetX, 0, Math.max(0, window.innerWidth - ball.offsetWidth));
      const top = clamp(event.clientY - drag.offsetY, 8, Math.max(8, window.innerHeight - ball.offsetHeight - 8));
      ball.style.left = `${left}px`;
      ball.style.right = "auto";
      ball.style.top = `${top}px`;
      ball.classList.toggle("is-left", left < window.innerWidth / 2);
    });
    ball.addEventListener("pointerup", (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      ball.releasePointerCapture?.(event.pointerId);
      ball.classList.remove("is-dragging");
      if (drag.moved) {
        ball.dataset.dragged = "true";
        window.setTimeout(() => {
          delete ball.dataset.dragged;
        }, 0);
        const rect = ball.getBoundingClientRect();
        const position = {
          side: rect.left + rect.width / 2 < window.innerWidth / 2 ? "left" : "right",
          top: clamp(rect.top / Math.max(window.innerHeight, 1), 0.02, 0.9)
        };
        currentSettings.floatingBallPosition = position;
        applyFloatingBallPosition(ball, position);
        safeStorageSet({ floatingBallPosition: position });
      }
      drag = null;
    });
    ball.addEventListener("pointercancel", () => {
      ball.classList.remove("is-dragging");
      drag = null;
    });
  }
  function applyFloatingBallPosition(ball, position = {}) {
    if (currentSettings.floatingBallMode === "hover") {
      ball.style.top = "88px";
      ball.style.left = "auto";
      ball.style.right = "0";
      ball.classList.remove("is-left");
      return;
    }
    const side = position.side === "left" ? "left" : "right";
    const topRatio = Number(position.top) || 0.42;
    const top = clamp(Math.round(window.innerHeight * topRatio), 8, Math.max(8, window.innerHeight - ball.offsetHeight - 8));
    ball.style.top = `${top}px`;
    ball.style.left = side === "left" ? "0" : "auto";
    ball.style.right = side === "right" ? "0" : "auto";
    ball.classList.toggle("is-left", side === "left");
  }
  function ensureSelectionPanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;
    panel = document.createElement("div");
    panel.id = PANEL_ID;
    document.documentElement.appendChild(panel);
    positionSelectionPanel(panel);
    return panel;
  }
  async function loadSelectionTools() {
    const response = await safeRuntimeSendMessage({ type: "GET_SETTINGS" });
    const tools = Array.isArray(response?.settings?.selectionTools) ? response.settings.selectionTools : [];
    selectionTools = tools.filter((tool) => tool?.enabled !== false).map((tool) => ({
      id: String(tool?.id || "").trim(),
      name: String(tool?.name || "").trim()
    })).filter((tool) => tool.id && tool.name);
    if (!selectionTools.length) selectionTools = [{ id: "translate", name: tc("translate") }];
    return selectionTools;
  }
  function renderToolResult(panel, result) {
    const raw = String(result?.text || "").trim();
    panel.textContent = "";
    panel.classList.remove("is-word-card");
    const header = document.createElement("div");
    header.className = "vanslate-result-header";
    const title = document.createElement("strong");
    title.textContent = result?.toolName || tc("result");
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "vanslate-copy";
    copy.textContent = tc("copy");
    copy.addEventListener("click", async () => {
      await copyText(raw);
      copy.textContent = tc("copied");
      window.setTimeout(() => {
        copy.textContent = tc("copy");
      }, 1300);
    });
    header.append(title, copy);
    const body = document.createElement("div");
    body.className = "vanslate-markdown";
    body.appendChild(renderMarkdown(raw || tc("emptyOutput")));
    panel.append(header, body);
  }
  function renderSelectionLoading(panel, toolName) {
    panel.textContent = "";
    const loading = document.createElement("div");
    loading.className = "vanslate-selection-loading";
    const spinner = document.createElement("span");
    spinner.className = "vanslate-selection-spinner";
    const text = document.createElement("span");
    text.textContent = tc("processingTool", { name: toolName || tc("tools") });
    loading.append(spinner, text);
    panel.appendChild(loading);
  }
  function renderMarkdown(markdown) {
    const root = document.createElement("div");
    const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
    let inCode = false;
    let codeLines = [];
    let list = null;
    const flushList = () => {
      if (list) {
        root.appendChild(list);
        list = null;
      }
    };
    const flushCode = () => {
      if (inCode) {
        const pre = document.createElement("pre");
        const code = document.createElement("code");
        code.textContent = codeLines.join("\n");
        pre.appendChild(code);
        root.appendChild(pre);
        codeLines = [];
        inCode = false;
      }
    };
    lines.forEach((line) => {
      if (/^```/.test(line.trim())) {
        if (inCode) {
          flushCode();
        } else {
          flushList();
          inCode = true;
          codeLines = [];
        }
        return;
      }
      if (inCode) {
        codeLines.push(line);
        return;
      }
      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        flushList();
        const node = document.createElement(`h${heading[1].length + 2}`);
        appendInlineMarkdown(node, heading[2]);
        root.appendChild(node);
        return;
      }
      const bullet = line.match(/^\s*[-*]\s+(.+)$/);
      if (bullet) {
        if (!list) list = document.createElement("ul");
        const item = document.createElement("li");
        appendInlineMarkdown(item, bullet[1]);
        list.appendChild(item);
        return;
      }
      flushList();
      if (!line.trim()) return;
      const p = document.createElement("p");
      appendInlineMarkdown(p, line);
      root.appendChild(p);
    });
    flushList();
    flushCode();
    return root;
  }
  function appendInlineMarkdown(parent, text) {
    const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
    String(text || "").split(pattern).filter(Boolean).forEach((part) => {
      if (part.startsWith("`") && part.endsWith("`")) {
        const code = document.createElement("code");
        code.textContent = part.slice(1, -1);
        parent.appendChild(code);
        return;
      }
      if (part.startsWith("**") && part.endsWith("**")) {
        const strong = document.createElement("strong");
        strong.textContent = part.slice(2, -2);
        parent.appendChild(strong);
        return;
      }
      const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        const a = document.createElement("a");
        a.textContent = link[1];
        a.href = link[2];
        a.target = "_blank";
        a.rel = "noreferrer";
        parent.appendChild(a);
        return;
      }
      parent.appendChild(document.createTextNode(part));
    });
  }
  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.documentElement.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  function positionSelectionPanel(panel) {
    const toolbar = document.getElementById(TOOLBAR_ID);
    const rect = toolbar?.getBoundingClientRect();
    panel.style.display = "block";
    panel.style.left = `${Math.max(8, (rect?.left || 8) + window.scrollX)}px`;
    panel.style.top = `${Math.max(8, (rect?.bottom || 8) + window.scrollY + 8)}px`;
  }
  function hideSelectionUi() {
    const toolbar = document.getElementById(TOOLBAR_ID);
    const panel = document.getElementById(PANEL_ID);
    lastSelectionSignature = "";
    if (toolbar) {
      toolbar.classList.remove("is-open");
      toolbar.hidden = true;
      toolbar.style.display = "none";
    }
    if (panel) {
      panel.hidden = true;
      panel.style.display = "none";
    }
  }
  function handleSelectionUiPointerDown(event) {
    const toolbar = document.getElementById(TOOLBAR_ID);
    const panel = document.getElementById(PANEL_ID);
    const target = event.target;
    const info = getSelectionInfo();
    pointerDownSelectionSignature = info?.signature || "";
    pointerDownX = event.clientX || 0;
    pointerDownY = event.clientY || 0;
    pointerDownWasOutsideSelectionUi = Boolean(toolbar && !toolbar.hidden && !toolbar.contains(target) && !panel?.contains(target));
    if (!pointerDownWasOutsideSelectionUi) return;
    window.clearTimeout(selectionTimer);
    hideSelectionUi();
  }
  function handleSelectionUiClick(event) {
    const toolbar = document.getElementById(TOOLBAR_ID);
    const panel = document.getElementById(PANEL_ID);
    const target = event.target;
    if (toolbar?.contains(target) || panel?.contains(target)) return;
    const info = getSelectionInfo();
    if (info && info.signature !== pointerDownSelectionSignature) {
      dismissedSelectionSignature = "";
      suppressSelectionToolbarUntil = 0;
      lastSelectionSignature = "";
      showSelectionToolbar(info);
      return;
    }
    if (!pointerDownWasOutsideSelectionUi && info) return;
    const moved = Math.hypot((event.clientX || 0) - pointerDownX, (event.clientY || 0) - pointerDownY);
    if (moved > 6 && info) {
      showSelectionToolbar(info);
      return;
    }
    if (info) dismissedSelectionSignature = info.signature;
    suppressSelectionToolbarUntil = Date.now() + 120;
    window.clearTimeout(selectionTimer);
    hideSelectionUi();
    setTimeout(() => {
      if (Date.now() >= suppressSelectionToolbarUntil) dismissedSelectionSignature = "";
    }, 160);
    if (info) {
      setTimeout(() => {
        try {
          window.getSelection()?.removeAllRanges();
        } catch {
        }
      }, 0);
    }
  }
  function isSelectionUiActive() {
    const toolbar = document.getElementById(TOOLBAR_ID);
    const panel = document.getElementById(PANEL_ID);
    return Boolean(
      toolbar && !toolbar.hidden && (toolbar.matches(":hover, :focus-within") || toolbar.classList.contains("is-open") || panel?.matches(":hover, :focus-within"))
    );
  }
  function renderProgress(progress) {
    latestProgress = progress;
    let node = document.getElementById(PROGRESS_ID);
    if (!progress) {
      if (node) node.remove();
      return;
    }
    if (!node) {
      node = document.createElement("div");
      node.id = PROGRESS_ID;
      document.documentElement.appendChild(node);
    }
    if (progress.error) {
      node.textContent = progress.error;
      node.classList.add("is-error");
      return;
    }
    const total = progress.total || 0;
    const done = progress.done || 0;
    const cached = progress.cachedCount || 0;
    const skipped = progress.skippedCount || 0;
    const usage = progress.usage || usageTotal;
    node.classList.remove("is-error");
    node.textContent = total ? tc("progress", { done, total, cached: cached ? tc("cached", { count: cached }) : "", skipped: skipped ? tc("skipped", { count: skipped }) : "", token: usage?.total_tokens ? ` \xB7 Token ${usage.total_tokens}` : "" }) : usage?.total_tokens ? `Token ${usage.total_tokens}` : tc("preparing");
    if (usage?.total_tokens) {
      node.title = `Token usage
Prompt: ${usage.prompt_tokens || 0}
Completion: ${usage.completion_tokens || 0}
Total: ${usage.total_tokens || 0}`;
    } else {
      node.removeAttribute("title");
    }
    if (progress.stage === "done") {
      window.setTimeout(() => {
        if (node?.isConnected) node.remove();
      }, 2200);
    }
  }
  function showProgressError(message) {
    renderProgress({ error: message });
  }
  function matchesRules(url, rulesText) {
    const rules = String(rulesText || "").split(/\n+/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
    if (!rules.length) return false;
    return rules.some((rule) => matchRule(url, rule));
  }
  function matchRule(url, rule) {
    if (rule.startsWith("/") && rule.endsWith("/")) {
      try {
        return new RegExp(rule.slice(1, -1)).test(url);
      } catch {
        return false;
      }
    }
    const escaped = rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`).test(url);
  }
  function ensureElementId(element) {
    const existing = element.getAttribute(ID_ATTR);
    if (existing) return existing;
    const id = `e${Date.now().toString(36)}-${nextElementId++}`;
    element.setAttribute(ID_ATTR, id);
    return id;
  }
  function getElementSourceText(element) {
    const clone = element.cloneNode(true);
    clone.querySelectorAll(`.${TRANSLATION_CLASS}, .${LOADING_CLASS}, .vanslate-inline-row`).forEach((node) => node.remove());
    if (hasSafeInlineMarkup(clone)) {
      return normalizeText(serializeInlineContent(clone));
    }
    return normalizeText(clone.textContent);
  }
  function hasSafeInlineMarkup(element) {
    return Array.from(element.querySelectorAll(Array.from(SAFE_INLINE_TAGS).map((tag) => tag.toLowerCase()).join(","))).some((node) => {
      if (!(node instanceof HTMLElement)) return false;
      if (node.matches(`.${TRANSLATION_CLASS}, .${LOADING_CLASS}, .vanslate-inline-row, .vanslate-error-retry`)) return false;
      return node.tagName !== "SPAN" || Boolean(safeInlineStyleText(node));
    });
  }
  function serializeInlineContent(node) {
    return Array.from(node.childNodes).map(serializeInlineNode).join("");
  }
  function serializeInlineNode(node) {
    if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent || "");
    if (!(node instanceof HTMLElement)) return "";
    if (node.matches(`.${TRANSLATION_CLASS}, .${LOADING_CLASS}, .vanslate-inline-row, .vanslate-error-retry`)) return "";
    if (node.tagName === "BR") return "<br>";
    const content = serializeInlineContent(node);
    if (SAFE_INLINE_TAGS.has(node.tagName) && (node.tagName !== "SPAN" || safeInlineStyleText(node))) {
      const style = safeInlineStyleText(node);
      const styleAttr = style ? ` style="${escapeAttribute(style)}"` : "";
      return `<${node.tagName.toLowerCase()}${styleAttr}>${content}</${node.tagName.toLowerCase()}>`;
    }
    return content;
  }
  function setTranslationContent(node, text) {
    const content = String(text || "").trim();
    if (!containsSafeInlineTag(content)) {
      node.textContent = content;
      return;
    }
    node.replaceChildren(...sanitizeInlineTranslationNodes(content));
  }
  function containsSafeInlineTag(text) {
    return /<\/?(strong|b|em|i|code|kbd|samp|var|s|u|mark|small|sub|sup|br|a|span)\b/i.test(String(text || ""));
  }
  function sanitizeInlineTranslationNodes(html) {
    const template = document.createElement("template");
    template.innerHTML = String(html || "");
    const nodes = [];
    template.content.childNodes.forEach((node) => {
      nodes.push(...sanitizeInlineNode(node));
    });
    return nodes;
  }
  function sanitizeInlineNode(node) {
    if (node.nodeType === Node.TEXT_NODE) return [document.createTextNode(node.textContent || "")];
    if (!(node instanceof HTMLElement)) return [];
    const tag = node.tagName;
    if (tag === "BR") return [document.createElement("br")];
    const children = [];
    node.childNodes.forEach((child) => {
      children.push(...sanitizeInlineNode(child));
    });
    if (!SAFE_INLINE_TAGS.has(tag)) return children;
    const output = document.createElement(tag.toLowerCase());
    output.append(...children);
    if (tag === "A") {
      const href = node.getAttribute("href") || "";
      if (/^(https?:|mailto:|#|\/)/i.test(href)) {
        output.setAttribute("href", href);
        output.setAttribute("rel", "noreferrer noopener");
      }
    }
    const style = safeInlineStyleText(node);
    if (style) output.setAttribute("style", style);
    return [output];
  }
  function safeInlineStyleText(element) {
    const declarations = [];
    SAFE_INLINE_STYLE_PROPS.forEach((property) => {
      const value = element.style?.getPropertyValue(property);
      if (isSafeInlineStyleValue(property, value)) declarations.push(`${property}: ${value.trim()}`);
    });
    return declarations.join("; ");
  }
  function isSafeInlineStyleValue(property, value) {
    const text = String(value || "").trim();
    if (!text) return false;
    if (/url\s*\(|expression\s*\(|javascript:/i.test(text)) return false;
    if (property === "color" || property === "background-color") {
      return /^(#[0-9a-f]{3,8}|rgba?\([0-9.,%\s]+\)|hsla?\([0-9.,%\s]+\)|[a-z]+)$/i.test(text);
    }
    if (property === "font-weight") return /^(normal|bold|bolder|lighter|[1-9]00)$/i.test(text);
    if (property === "font-style") return /^(normal|italic|oblique)$/i.test(text);
    if (property === "text-decoration") return /^[a-z\s-]+$/i.test(text);
    return false;
  }
  function escapeHtml(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function escapeAttribute(value) {
    return escapeHtml(value).replace(/"/g, "&quot;");
  }
  function hasBlockChild(element) {
    return Array.from(element.children).some((child) => {
      const display = window.getComputedStyle(child).display;
      return display === "block" || display === "list-item" || display === "flex" || display === "grid";
    });
  }
  async function loadRenderSettings() {
    const response = await safeRuntimeSendMessage({ type: "GET_SETTINGS" });
    const settings = response?.settings || {};
    const renderSettings = {
      renderMode: settings.renderMode === "block" ? "block" : "inline",
      translationColorEnabled: Boolean(settings.translationColorEnabled),
      translationColor: settings.translationColor || "",
      translationCss: settings.translationCss || "",
      uiLanguage: settings.uiLanguage || "zh-CN",
      floatingBallMode: normalizeFloatingBallMode(settings),
      enableFloatingBall: normalizeFloatingBallMode(settings) !== "hidden",
      collectionRules: normalizeCollectionRules(settings.collectionRules),
      floatingBallPosition: normalizeFloatingBallPosition(settings.floatingBallPosition)
    };
    ensureTranslationCss(renderSettings.translationCss);
    return renderSettings;
  }
  function createLogoImage(alt, path = "icons/png/vanslate-128.png") {
    const image = document.createElement("img");
    image.src = safeRuntimeGetURL(path);
    image.alt = alt;
    image.decoding = "async";
    image.draggable = false;
    return image;
  }
  function normalizeFloatingBallPosition(position) {
    return {
      side: position?.side === "left" ? "left" : "right",
      top: clamp(Number(position?.top) || 0.42, 0.02, 0.9)
    };
  }
  function normalizeFloatingBallMode(settings) {
    if (settings?.floatingBallMode === "hidden" || settings?.enableFloatingBall === false) return "hidden";
    if (settings?.floatingBallMode === "hover") return "hover";
    return "always";
  }
  async function safeRuntimeSendMessage(message) {
    if (!isExtensionContextAlive()) return null;
    try {
      return await ext.runtime.sendMessage(message);
    } catch (error) {
      if (isExtensionContextInvalidatedError(error)) {
        handleExtensionContextInvalidated();
        return null;
      }
      throw error;
    }
  }
  function safeRuntimeGetURL(path) {
    if (!isExtensionContextAlive()) return "";
    try {
      return ext.runtime.getURL(path);
    } catch (error) {
      if (isExtensionContextInvalidatedError(error)) {
        handleExtensionContextInvalidated();
        return "";
      }
      throw error;
    }
  }
  function safeStorageSet(value) {
    if (!isExtensionContextAlive()) return;
    if (!ext.storage?.local) return;
    try {
      writeStorageValues(ext.storage.local, value)?.catch(handleAsyncExtensionError);
    } catch (error) {
      handleAsyncExtensionError(error);
    }
  }
  function handleAsyncExtensionError(error) {
    if (isExtensionContextInvalidatedError(error)) {
      handleExtensionContextInvalidated();
    }
  }
  function isExtensionContextAlive() {
    if (extensionContextInvalidated) return false;
    try {
      return Boolean(ext?.runtime?.id);
    } catch (error) {
      if (isExtensionContextInvalidatedError(error)) {
        handleExtensionContextInvalidated();
        return false;
      }
      throw error;
    }
  }
  function isExtensionContextInvalidatedError(error) {
    return /extension context invalidated|context invalidated|extension context/i.test(readableError(error));
  }
  function handleExtensionContextInvalidated() {
    if (extensionContextInvalidated) return;
    extensionContextInvalidated = true;
    stopVirtualObserver();
    window.clearTimeout(selectionTimer);
    window.clearTimeout(collectTimer);
    document.getElementById(FLOATING_BALL_ID)?.remove();
    document.getElementById(TOOLBAR_ID)?.remove();
    document.getElementById(PANEL_ID)?.remove();
    document.getElementById(PROGRESS_ID)?.remove();
  }
  function isBlockElement(element) {
    const display = window.getComputedStyle(element).display;
    return display === "block" || display === "list-item" || display === "flow-root";
  }
  function applyTranslationStyle(node, settings) {
    if (settings.translationColorEnabled && settings.translationColor) {
      node.style.color = settings.translationColor;
    }
    const css = String(settings.translationCss || "").trim();
    if (css && !css.includes("{")) {
      node.style.cssText += `;${css}`;
    }
  }
  function ensureTranslationCss(css) {
    const id = "vanslate-custom-css";
    let style = document.getElementById(id);
    const value = String(css || "").trim();
    if (!value || !value.includes("{")) {
      if (style) style.remove();
      return;
    }
    if (!style) {
      style = document.createElement("style");
      style.id = id;
      document.documentElement.appendChild(style);
    }
    style.textContent = value;
  }
  function yieldToPage() {
    return new Promise((resolve) => {
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(resolve, { timeout: 80 });
      } else {
        window.setTimeout(resolve, 0);
      }
    });
  }
  function addUsage(left, right) {
    return {
      prompt_tokens: (Number(left?.prompt_tokens) || 0) + (Number(right?.prompt_tokens) || 0),
      completion_tokens: (Number(left?.completion_tokens) || 0) + (Number(right?.completion_tokens) || 0),
      total_tokens: (Number(left?.total_tokens) || 0) + (Number(right?.total_tokens) || 0)
    };
  }
  function cssEscape(value) {
    if (globalThis.CSS?.escape) return CSS.escape(value);
    return String(value).replace(/["\\]/g, "\\$&");
  }
  function isIgnoredCandidate(element) {
    if (element.closest("pre, code, script, style, textarea, input, select, button, [contenteditable='true']")) {
      return true;
    }
    const insideArticle = Boolean(element.closest("article, main"));
    if (element.closest("header, footer") && !insideArticle) return true;
    const navContext = element.closest("nav, aside, [role='navigation'], [aria-label], [data-testid]");
    if (!navContext) return false;
    return !isArticleNavigationCandidate(element, navContext);
  }
  function isArticleNavigationCandidate(element, navContext) {
    if (element.closest("article, main")) return true;
    if (navContext.matches("aside")) return true;
    const signature = [
      navContext.id,
      navContext.className,
      navContext.getAttribute("role"),
      navContext.getAttribute("aria-label"),
      navContext.getAttribute("data-testid")
    ].join(" ");
    if (/toc|table.?of.?contents|contents|article|anchor|section|目录|本文|outline/i.test(signature)) {
      return true;
    }
    const links = navContext.querySelectorAll("a[href^='#'], a[href*='#']").length;
    const totalLinks = navContext.querySelectorAll("a[href]").length;
    if (totalLinks >= 2 && links / totalLinks >= 0.5) return true;
    const style = window.getComputedStyle(navContext);
    return (style.position === "sticky" || style.position === "fixed") && totalLinks >= 2 && !element.closest("header, footer");
  }
  function overlapsQueuedBlock(element, blocks) {
    return blocks.some((block) => block !== element && (block.contains(element) || element.contains(block)));
  }
  function getElementDepth(element) {
    let depth = 0;
    for (let node = element; node; node = node.parentElement) depth += 1;
    return depth;
  }
  function setBusy(isBusy) {
    document.documentElement.toggleAttribute("data-vanslate-busy", isBusy);
  }
  function getSelectionText() {
    return window.getSelection()?.toString() || "";
  }
  function isVisible(element) {
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight * 1.5;
  }
  function normalizeText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }
  function isUsefulText(text, element) {
    const inArticleNav = Boolean(element?.closest("nav, aside, [role='navigation']"));
    if (text.length < (inArticleNav ? 2 : 8)) return false;
    if (text.length > (inArticleNav ? 260 : 1800)) return false;
    if (!/[A-Za-z\u4e00-\u9fff]/.test(text)) return false;
    return true;
  }
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }
  function isQuotaLimit(error) {
    return error?.quotaLimited || /quota|rate.?limit|too many requests|insufficient_quota/i.test(readableError(error));
  }
  function readableError(error) {
    return error instanceof Error ? error.message : String(error);
  }
  function tc(key, values = {}) {
    const language = currentSettings.uiLanguage || "zh-CN";
    const zh = {
      fullTranslate: "\u5168\u6587\u7FFB\u8BD1",
      toolbar: "\u8587\u8BD1\u5DE5\u5177\u680F",
      tools: "\u8587\u8BD1\u5DE5\u5177",
      expandToolbar: "\u5C55\u5F00\u8587\u8BD1\u5212\u8BCD\u5DE5\u5177",
      useTool: "\u4F7F\u7528\u300C{name}\u300D\u5904\u7406\u9009\u4E2D\u6587\u672C",
      translate: "\u7FFB\u8BD1",
      result: "\u7ED3\u679C",
      copy: "\u590D\u5236",
      copied: "\u5DF2\u590D\u5236",
      emptyOutput: "\u65E0\u8F93\u51FA\u3002",
      processingTool: "{name}\u5904\u7406\u4E2D",
      speak: "\u53D1\u97F3",
      progress: "\u7FFB\u8BD1\u8FDB\u5EA6 {done}/{total}{cached}{skipped}{token}",
      cached: "\uFF0C\u7F13\u5B58 {count}",
      skipped: "\uFF0C\u8DF3\u8FC7 {count}",
      preparing: "\u51C6\u5907\u7FFB\u8BD1...",
      translationFailedRetry: "\u7FFB\u8BD1\u5931\u8D25\uFF0C\u70B9\u51FB\u91CD\u8BD5",
      selectTextFirst: "\u8BF7\u5148\u9009\u62E9\u8981\u5904\u7406\u7684\u6587\u672C\u3002",
      toolFailed: "\u5DE5\u5177\u6267\u884C\u5931\u8D25"
    };
    const en = {
      fullTranslate: "Translate Page",
      toolbar: "Vanslate toolbar",
      tools: "Vanslate tools",
      expandToolbar: "Expand Vanslate selection tools",
      useTool: 'Use "{name}" on selected text',
      translate: "Translate",
      result: "Result",
      copy: "Copy",
      copied: "Copied",
      emptyOutput: "No output.",
      processingTool: "{name} is processing",
      speak: "Pronounce",
      progress: "Translation progress {done}/{total}{cached}{skipped}{token}",
      cached: ", cached {count}",
      skipped: ", skipped {count}",
      preparing: "Preparing translation...",
      translationFailedRetry: "Translation failed. Click to retry",
      selectTextFirst: "Select text first.",
      toolFailed: "Tool execution failed"
    };
    const dict = {
      "zh-CN": zh,
      "en-US": en,
      "ja-JP": {
        fullTranslate: "\u30DA\u30FC\u30B8\u3092\u7FFB\u8A33",
        toolbar: "Vanslate \u30C4\u30FC\u30EB\u30D0\u30FC",
        tools: "Vanslate \u30C4\u30FC\u30EB",
        expandToolbar: "Vanslate \u9078\u629E\u30C4\u30FC\u30EB\u3092\u5C55\u958B",
        useTool: "\u9078\u629E\u30C6\u30AD\u30B9\u30C8\u306B\u300C{name}\u300D\u3092\u4F7F\u7528",
        translate: "\u7FFB\u8A33",
        result: "\u7D50\u679C",
        copy: "\u30B3\u30D4\u30FC",
        copied: "\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F",
        emptyOutput: "\u51FA\u529B\u304C\u3042\u308A\u307E\u305B\u3093\u3002",
        processingTool: "{name} \u51E6\u7406\u4E2D",
        speak: "\u767A\u97F3",
        progress: "\u7FFB\u8A33\u9032\u6357 {done}/{total}{cached}{skipped}{token}",
        cached: "\u3001\u30AD\u30E3\u30C3\u30B7\u30E5 {count}",
        skipped: "\u3001\u30B9\u30AD\u30C3\u30D7 {count}",
        preparing: "\u7FFB\u8A33\u3092\u6E96\u5099\u4E2D...",
        selectTextFirst: "\u5148\u306B\u51E6\u7406\u3059\u308B\u30C6\u30AD\u30B9\u30C8\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
        toolFailed: "\u30C4\u30FC\u30EB\u5B9F\u884C\u306B\u5931\u6557\u3057\u307E\u3057\u305F"
      },
      "ko-KR": {
        fullTranslate: "\uD398\uC774\uC9C0 \uBC88\uC5ED",
        toolbar: "Vanslate \uB3C4\uAD6C \uBAA8\uC74C",
        tools: "Vanslate \uB3C4\uAD6C",
        expandToolbar: "Vanslate \uC120\uD0DD \uB3C4\uAD6C \uD3BC\uCE58\uAE30",
        useTool: "\uC120\uD0DD\uD55C \uD14D\uC2A4\uD2B8\uC5D0 \u201C{name}\u201D \uC0AC\uC6A9",
        translate: "\uBC88\uC5ED",
        result: "\uACB0\uACFC",
        copy: "\uBCF5\uC0AC",
        copied: "\uBCF5\uC0AC\uB428",
        emptyOutput: "\uCD9C\uB825\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
        processingTool: "{name} \uCC98\uB9AC \uC911",
        speak: "\uBC1C\uC74C",
        progress: "\uBC88\uC5ED \uC9C4\uD589 {done}/{total}{cached}{skipped}{token}",
        cached: ", \uCE90\uC2DC {count}",
        skipped: ", \uAC74\uB108\uB700 {count}",
        preparing: "\uBC88\uC5ED \uC900\uBE44 \uC911...",
        selectTextFirst: "\uCC98\uB9AC\uD560 \uD14D\uC2A4\uD2B8\uB97C \uBA3C\uC800 \uC120\uD0DD\uD558\uC138\uC694.",
        toolFailed: "\uB3C4\uAD6C \uC2E4\uD589 \uC2E4\uD328"
      },
      "fr-FR": {
        fullTranslate: "Traduire la page",
        toolbar: "Barre Vanslate",
        tools: "Outils Vanslate",
        expandToolbar: "Afficher les outils de s\xE9lection Vanslate",
        useTool: "Utiliser \xAB {name} \xBB sur le texte s\xE9lectionn\xE9",
        translate: "Traduire",
        result: "R\xE9sultat",
        copy: "Copier",
        copied: "Copi\xE9",
        emptyOutput: "Aucune sortie.",
        processingTool: "{name} en cours",
        speak: "Prononcer",
        progress: "Progression {done}/{total}{cached}{skipped}{token}",
        cached: ", cache {count}",
        skipped: ", ignor\xE9s {count}",
        preparing: "Pr\xE9paration de la traduction...",
        selectTextFirst: "S\xE9lectionnez d'abord du texte.",
        toolFailed: "\xC9chec de l'outil"
      },
      "de-DE": {
        fullTranslate: "Seite \xFCbersetzen",
        toolbar: "Vanslate-Werkzeugleiste",
        tools: "Vanslate-Werkzeuge",
        expandToolbar: "Vanslate-Auswahlwerkzeuge \xF6ffnen",
        useTool: "\u201E{name}\u201C auf ausgew\xE4hlten Text anwenden",
        translate: "\xDCbersetzen",
        result: "Ergebnis",
        copy: "Kopieren",
        copied: "Kopiert",
        emptyOutput: "Keine Ausgabe.",
        processingTool: "{name} wird ausgef\xFChrt",
        speak: "Aussprache",
        progress: "\xDCbersetzungsfortschritt {done}/{total}{cached}{skipped}{token}",
        cached: ", Cache {count}",
        skipped: ", \xFCbersprungen {count}",
        preparing: "\xDCbersetzung wird vorbereitet...",
        selectTextFirst: "Bitte zuerst Text ausw\xE4hlen.",
        toolFailed: "Werkzeug fehlgeschlagen"
      },
      "es-ES": {
        fullTranslate: "Traducir p\xE1gina",
        toolbar: "Barra de Vanslate",
        tools: "Herramientas Vanslate",
        expandToolbar: "Abrir herramientas de selecci\xF3n Vanslate",
        useTool: "Usar \u201C{name}\u201D en el texto seleccionado",
        translate: "Traducir",
        result: "Resultado",
        copy: "Copiar",
        copied: "Copiado",
        emptyOutput: "Sin salida.",
        processingTool: "{name} procesando",
        speak: "Pronunciar",
        progress: "Progreso {done}/{total}{cached}{skipped}{token}",
        cached: ", cach\xE9 {count}",
        skipped: ", omitidos {count}",
        preparing: "Preparando traducci\xF3n...",
        selectTextFirst: "Selecciona texto primero.",
        toolFailed: "La herramienta fall\xF3"
      },
      "pt-BR": {
        fullTranslate: "Traduzir p\xE1gina",
        toolbar: "Barra do Vanslate",
        tools: "Ferramentas Vanslate",
        expandToolbar: "Abrir ferramentas de sele\xE7\xE3o Vanslate",
        useTool: "Usar \u201C{name}\u201D no texto selecionado",
        translate: "Traduzir",
        result: "Resultado",
        copy: "Copiar",
        copied: "Copiado",
        emptyOutput: "Sem sa\xEDda.",
        processingTool: "{name} processando",
        speak: "Pronunciar",
        progress: "Progresso {done}/{total}{cached}{skipped}{token}",
        cached: ", cache {count}",
        skipped: ", ignorados {count}",
        preparing: "Preparando tradu\xE7\xE3o...",
        selectTextFirst: "Selecione um texto primeiro.",
        toolFailed: "Falha na ferramenta"
      },
      "it-IT": {
        fullTranslate: "Traduci pagina",
        toolbar: "Barra Vanslate",
        tools: "Strumenti Vanslate",
        expandToolbar: "Apri strumenti di selezione Vanslate",
        useTool: "Usa \u201C{name}\u201D sul testo selezionato",
        translate: "Traduci",
        result: "Risultato",
        copy: "Copia",
        copied: "Copiato",
        emptyOutput: "Nessun output.",
        processingTool: "{name} in elaborazione",
        speak: "Pronuncia",
        progress: "Avanzamento {done}/{total}{cached}{skipped}{token}",
        cached: ", cache {count}",
        skipped: ", saltati {count}",
        preparing: "Preparazione traduzione...",
        selectTextFirst: "Seleziona prima il testo.",
        toolFailed: "Strumento non riuscito"
      },
      "ru-RU": {
        fullTranslate: "\u041F\u0435\u0440\u0435\u0432\u0435\u0441\u0442\u0438 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443",
        toolbar: "\u041F\u0430\u043D\u0435\u043B\u044C Vanslate",
        tools: "\u0418\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442\u044B Vanslate",
        expandToolbar: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0438\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442\u044B \u0432\u044B\u0434\u0435\u043B\u0435\u043D\u0438\u044F Vanslate",
        useTool: "\u041F\u0440\u0438\u043C\u0435\u043D\u0438\u0442\u044C \xAB{name}\xBB \u043A \u0432\u044B\u0434\u0435\u043B\u0435\u043D\u043D\u043E\u043C\u0443 \u0442\u0435\u043A\u0441\u0442\u0443",
        translate: "\u041F\u0435\u0440\u0435\u0432\u0435\u0441\u0442\u0438",
        result: "\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442",
        copy: "\u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C",
        copied: "\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u043E",
        emptyOutput: "\u041D\u0435\u0442 \u0432\u044B\u0432\u043E\u0434\u0430.",
        processingTool: "{name} \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F",
        speak: "\u041F\u0440\u043E\u0438\u0437\u043D\u0435\u0441\u0442\u0438",
        progress: "\u041F\u0440\u043E\u0433\u0440\u0435\u0441\u0441 \u043F\u0435\u0440\u0435\u0432\u043E\u0434\u0430 {done}/{total}{cached}{skipped}{token}",
        cached: ", \u043A\u044D\u0448 {count}",
        skipped: ", \u043F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043E {count}",
        preparing: "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0430 \u043F\u0435\u0440\u0435\u0432\u043E\u0434\u0430...",
        selectTextFirst: "\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0432\u044B\u0434\u0435\u043B\u0438\u0442\u0435 \u0442\u0435\u043A\u0441\u0442.",
        toolFailed: "\u041E\u0448\u0438\u0431\u043A\u0430 \u0438\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442\u0430"
      },
      "ar-SA": {
        fullTranslate: "\u062A\u0631\u062C\u0645\u0629 \u0627\u0644\u0635\u0641\u062D\u0629",
        toolbar: "\u0634\u0631\u064A\u0637 \u0623\u062F\u0648\u0627\u062A Vanslate",
        tools: "\u0623\u062F\u0648\u0627\u062A Vanslate",
        expandToolbar: "\u062A\u0648\u0633\u064A\u0639 \u0623\u062F\u0648\u0627\u062A \u0627\u0644\u062A\u062D\u062F\u064A\u062F",
        useTool: '\u0627\u0633\u062A\u062E\u062F\u0627\u0645 "{name}" \u0639\u0644\u0649 \u0627\u0644\u0646\u0635 \u0627\u0644\u0645\u062D\u062F\u062F',
        translate: "\u062A\u0631\u062C\u0645\u0629",
        result: "\u0627\u0644\u0646\u062A\u064A\u062C\u0629",
        copy: "\u0646\u0633\u062E",
        copied: "\u062A\u0645 \u0627\u0644\u0646\u0633\u062E",
        emptyOutput: "\u0644\u0627 \u064A\u0648\u062C\u062F \u0625\u062E\u0631\u0627\u062C.",
        processingTool: "{name} \u0642\u064A\u062F \u0627\u0644\u0645\u0639\u0627\u0644\u062C\u0629",
        speak: "\u0646\u0637\u0642",
        progress: "\u062A\u0642\u062F\u0645 \u0627\u0644\u062A\u0631\u062C\u0645\u0629 {done}/{total}{cached}{skipped}{token}",
        cached: "\u060C \u0645\u062E\u0628\u0623 {count}",
        skipped: "\u060C \u062A\u0645 \u062A\u062E\u0637\u064A {count}",
        preparing: "\u062C\u0627\u0631\u064D \u062A\u062C\u0647\u064A\u0632 \u0627\u0644\u062A\u0631\u062C\u0645\u0629...",
        selectTextFirst: "\u062D\u062F\u062F \u0627\u0644\u0646\u0635 \u0623\u0648\u0644\u0627\u064B.",
        toolFailed: "\u0641\u0634\u0644 \u062A\u0646\u0641\u064A\u0630 \u0627\u0644\u0623\u062F\u0627\u0629"
      },
      "hi-IN": {
        fullTranslate: "\u092A\u0947\u091C \u0905\u0928\u0941\u0935\u093E\u0926 \u0915\u0930\u0947\u0902",
        toolbar: "Vanslate \u091F\u0942\u0932\u092C\u093E\u0930",
        tools: "Vanslate \u091F\u0942\u0932",
        expandToolbar: "Vanslate \u091A\u092F\u0928 \u091F\u0942\u0932 \u0916\u094B\u0932\u0947\u0902",
        useTool: "\u091A\u092F\u0928\u093F\u0924 \u091F\u0947\u0915\u094D\u0938\u094D\u091F \u092A\u0930 \u201C{name}\u201D \u091A\u0932\u093E\u090F\u0901",
        translate: "\u0905\u0928\u0941\u0935\u093E\u0926",
        result: "\u092A\u0930\u093F\u0923\u093E\u092E",
        copy: "\u0915\u0949\u092A\u0940",
        copied: "\u0915\u0949\u092A\u0940 \u0939\u094B \u0917\u092F\u093E",
        emptyOutput: "\u0915\u094B\u0908 \u0906\u0909\u091F\u092A\u0941\u091F \u0928\u0939\u0940\u0902\u0964",
        processingTool: "{name} \u091A\u0932 \u0930\u0939\u093E \u0939\u0948",
        speak: "\u0909\u091A\u094D\u091A\u093E\u0930\u0923",
        progress: "\u0905\u0928\u0941\u0935\u093E\u0926 \u092A\u094D\u0930\u0917\u0924\u093F {done}/{total}{cached}{skipped}{token}",
        cached: ", \u0915\u0948\u0936 {count}",
        skipped: ", \u091B\u094B\u0921\u093C\u093E {count}",
        preparing: "\u0905\u0928\u0941\u0935\u093E\u0926 \u0924\u0948\u092F\u093E\u0930 \u0939\u094B \u0930\u0939\u093E \u0939\u0948...",
        selectTextFirst: "\u092A\u0939\u0932\u0947 \u091F\u0947\u0915\u094D\u0938\u094D\u091F \u091A\u0941\u0928\u0947\u0902\u0964",
        toolFailed: "\u091F\u0942\u0932 \u0935\u093F\u092B\u0932 \u0939\u0941\u0906"
      },
      "id-ID": {
        fullTranslate: "Terjemahkan Halaman",
        toolbar: "Bilah alat Vanslate",
        tools: "Alat Vanslate",
        expandToolbar: "Buka alat seleksi Vanslate",
        useTool: "Gunakan \u201C{name}\u201D pada teks terpilih",
        translate: "Terjemahkan",
        result: "Hasil",
        copy: "Salin",
        copied: "Disalin",
        emptyOutput: "Tidak ada output.",
        processingTool: "{name} memproses",
        speak: "Ucapkan",
        progress: "Progres terjemahan {done}/{total}{cached}{skipped}{token}",
        cached: ", cache {count}",
        skipped: ", dilewati {count}",
        preparing: "Menyiapkan terjemahan...",
        selectTextFirst: "Pilih teks terlebih dahulu.",
        toolFailed: "Alat gagal"
      },
      "vi-VN": {
        fullTranslate: "D\u1ECBch trang",
        toolbar: "Thanh c\xF4ng c\u1EE5 Vanslate",
        tools: "C\xF4ng c\u1EE5 Vanslate",
        expandToolbar: "M\u1EDF c\xF4ng c\u1EE5 ch\u1ECDn Vanslate",
        useTool: "D\xF9ng \u201C{name}\u201D cho v\u0103n b\u1EA3n \u0111\xE3 ch\u1ECDn",
        translate: "D\u1ECBch",
        result: "K\u1EBFt qu\u1EA3",
        copy: "Sao ch\xE9p",
        copied: "\u0110\xE3 sao ch\xE9p",
        emptyOutput: "Kh\xF4ng c\xF3 \u0111\u1EA7u ra.",
        processingTool: "{name} \u0111ang x\u1EED l\xFD",
        speak: "Ph\xE1t \xE2m",
        progress: "Ti\u1EBFn \u0111\u1ED9 d\u1ECBch {done}/{total}{cached}{skipped}{token}",
        cached: ", cache {count}",
        skipped: ", b\u1ECF qua {count}",
        preparing: "\u0110ang chu\u1EA9n b\u1ECB d\u1ECBch...",
        selectTextFirst: "H\xE3y ch\u1ECDn v\u0103n b\u1EA3n tr\u01B0\u1EDBc.",
        toolFailed: "C\xF4ng c\u1EE5 th\u1EA5t b\u1EA1i"
      },
      "th-TH": {
        fullTranslate: "\u0E41\u0E1B\u0E25\u0E2B\u0E19\u0E49\u0E32",
        toolbar: "\u0E41\u0E16\u0E1A\u0E40\u0E04\u0E23\u0E37\u0E48\u0E2D\u0E07\u0E21\u0E37\u0E2D Vanslate",
        tools: "\u0E40\u0E04\u0E23\u0E37\u0E48\u0E2D\u0E07\u0E21\u0E37\u0E2D Vanslate",
        expandToolbar: "\u0E40\u0E1B\u0E34\u0E14\u0E40\u0E04\u0E23\u0E37\u0E48\u0E2D\u0E07\u0E21\u0E37\u0E2D\u0E40\u0E25\u0E37\u0E2D\u0E01\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21 Vanslate",
        useTool: "\u0E43\u0E0A\u0E49 \u201C{name}\u201D \u0E01\u0E31\u0E1A\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E17\u0E35\u0E48\u0E40\u0E25\u0E37\u0E2D\u0E01",
        translate: "\u0E41\u0E1B\u0E25",
        result: "\u0E1C\u0E25\u0E25\u0E31\u0E1E\u0E18\u0E4C",
        copy: "\u0E04\u0E31\u0E14\u0E25\u0E2D\u0E01",
        copied: "\u0E04\u0E31\u0E14\u0E25\u0E2D\u0E01\u0E41\u0E25\u0E49\u0E27",
        emptyOutput: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E1C\u0E25\u0E25\u0E31\u0E1E\u0E18\u0E4C",
        processingTool: "{name} \u0E01\u0E33\u0E25\u0E31\u0E07\u0E1B\u0E23\u0E30\u0E21\u0E27\u0E25\u0E1C\u0E25",
        speak: "\u0E2D\u0E2D\u0E01\u0E40\u0E2A\u0E35\u0E22\u0E07",
        progress: "\u0E04\u0E27\u0E32\u0E21\u0E04\u0E37\u0E1A\u0E2B\u0E19\u0E49\u0E32\u0E01\u0E32\u0E23\u0E41\u0E1B\u0E25 {done}/{total}{cached}{skipped}{token}",
        cached: ", \u0E41\u0E04\u0E0A {count}",
        skipped: ", \u0E02\u0E49\u0E32\u0E21 {count}",
        preparing: "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E40\u0E15\u0E23\u0E35\u0E22\u0E21\u0E01\u0E32\u0E23\u0E41\u0E1B\u0E25...",
        selectTextFirst: "\u0E42\u0E1B\u0E23\u0E14\u0E40\u0E25\u0E37\u0E2D\u0E01\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E01\u0E48\u0E2D\u0E19",
        toolFailed: "\u0E40\u0E04\u0E23\u0E37\u0E48\u0E2D\u0E07\u0E21\u0E37\u0E2D\u0E17\u0E33\u0E07\u0E32\u0E19\u0E25\u0E49\u0E21\u0E40\u0E2B\u0E25\u0E27"
      }
    }[language] || zh;
    const template = dict[key] || key;
    return String(template).replace(/\{(\w+)\}/g, (match, name) => {
      return values[name] === void 0 ? match : String(values[name]);
    });
  }
})();
