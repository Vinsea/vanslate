declare const chrome: any;

import { storageKey, writeStorageValues } from "../core/storage-keys";
import { DEFAULT_COLLECTION_RULES } from "../core/defaults";

const ext = (globalThis as any).browser || chrome;

const TRANSLATION_CLASS = "vanslate-result";
const LOADING_CLASS = "vanslate-loading";
const TOOLBAR_ID = "vanslate-toolbar";
const PANEL_ID = "vanslate-selection-panel";
const PROGRESS_ID = "vanslate-progress";
const FLOATING_BALL_ID = "vanslate-floating-ball";
const STATE_ATTR = "data-vanslate-state";
const ID_ATTR = "data-vanslate-id";
const CLONE_ATTR = "data-vanslate-clone";
const SAFE_INLINE_TAGS = new Set(["A", "B", "BR", "CODE", "EM", "I", "KBD", "MARK", "S", "SAMP", "SMALL", "SPAN", "STRONG", "SUB", "SUP", "U", "VAR"]);
const SAFE_INLINE_STYLE_PROPS = ["color", "background-color", "font-weight", "font-style", "text-decoration"];
const MAX_BLOCKS_PER_PASS = 80;
const FLOATING_DRAG_THRESHOLD = 4;

const pendingElements = new Map();
const failedElements = new Map();
let latestProgress = null;
let lastSelectionSignature = "";
let dismissedSelectionSignature = "";
let selectionTimer = 0;
let suppressSelectionToolbarUntil = 0;
let pointerDownSelectionSignature = "";
let pointerDownX = 0;
let pointerDownY = 0;
let pointerDownWasOutsideSelectionUi = false;
let nextElementId = 1;
let virtualObserver = null;
let virtualModeEnabled = false;
let collectTimer = 0;
let virtualCollectInFlight = false;
let virtualCollectQueued = false;
const virtualDirtyRoots = new Set();
let translatedCount = 0;
let selectionTools = [];
let usageTotal = {
  prompt_tokens: 0,
  completion_tokens: 0,
  total_tokens: 0
};
let extensionContextInvalidated = false;
let currentSettings = {
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
    translatePage(message.options || {})
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: readableError(error), quotaLimited: isQuotaLimit(error) }));
    return true;
  }

  if (message?.type === "TRANSLATE_SELECTION") {
    translateSelection()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: readableError(error), quotaLimited: isQuotaLimit(error) }));
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
    if (
      !changes[storageKey("floatingBallMode")] &&
      !changes[storageKey("enableFloatingBall")] &&
      !changes[storageKey("floatingBallPosition")]
    ) return;
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
    ...(latestProgress || {}),
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
  const seen = new Set();
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
  const normalized = list
    .map((tag) => String(tag || "").trim().toUpperCase())
    .filter(Boolean);
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
  selectionTools = tools
    .filter((tool) => tool?.enabled !== false)
    .map((tool) => ({
      id: String(tool?.id || "").trim(),
      name: String(tool?.name || "").trim()
    }))
    .filter((tool) => tool.id && tool.name);
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

function renderWordCard(panel, result) {
  panel.textContent = "";
  panel.classList.add("is-word-card");

  const header = document.createElement("div");
  header.className = "vanslate-word-header";

  const wordWrap = document.createElement("div");
  const word = document.createElement("strong");
  word.textContent = result.word || "";
  const phonetic = document.createElement("span");
  phonetic.className = "vanslate-phonetic";
  phonetic.textContent = result.phonetic || "";
  wordWrap.append(word, phonetic);

  const speak = document.createElement("button");
  speak.type = "button";
  speak.className = "vanslate-speak";
  speak.textContent = "▶";
  speak.title = tc("speak");
  speak.addEventListener("click", () => speakText(result.word || ""));
  header.append(wordWrap, speak);

  const translation = document.createElement("div");
  translation.className = "vanslate-word-translation";
  translation.textContent = [result.partOfSpeech, result.translation].filter(Boolean).join(" · ");
  panel.append(header, translation);

  const definitions = document.createElement("ul");
  definitions.className = "vanslate-definitions";
  (result.definitions || []).slice(0, 5).forEach((definition) => {
    const li = document.createElement("li");
    li.textContent = definition;
    definitions.appendChild(li);
  });
  if (definitions.children.length) panel.appendChild(definitions);

  (result.examples || []).slice(0, 2).forEach((example) => {
    const item = document.createElement("div");
    item.className = "vanslate-example";
    item.textContent = `${example.source}${example.translation ? `\n${example.translation}` : ""}`;
    panel.appendChild(item);
  });
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
        // Ignore pages that block selection mutation.
      }
    }, 0);
  }
}

function isSelectionUiActive() {
  const toolbar = document.getElementById(TOOLBAR_ID);
  const panel = document.getElementById(PANEL_ID);
  return Boolean(
    toolbar && !toolbar.hidden && (
      toolbar.matches(":hover, :focus-within") ||
      toolbar.classList.contains("is-open") ||
      panel?.matches(":hover, :focus-within")
    )
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
  node.textContent = total
    ? tc("progress", { done, total, cached: cached ? tc("cached", { count: cached }) : "", skipped: skipped ? tc("skipped", { count: skipped }) : "", token: usage?.total_tokens ? ` · Token ${usage.total_tokens}` : "" })
    : usage?.total_tokens ? `Token ${usage.total_tokens}` : tc("preparing");
  if (usage?.total_tokens) {
    node.title = `Token usage\nPrompt: ${usage.prompt_tokens || 0}\nCompletion: ${usage.completion_tokens || 0}\nTotal: ${usage.total_tokens || 0}`;
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
  const rules = String(rulesText || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

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
  const escaped = rule
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
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
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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

function isSingleWord(text) {
  return /^[A-Za-z][A-Za-z'-]{1,39}$/.test(text.trim());
}

function speakText(text) {
  if (!text || !globalThis.speechSynthesis) return;
  const utterance = new SpeechSynthesisUtterance(text);
  if (/^[A-Za-z'-]+$/.test(text)) utterance.lang = "en-US";
  globalThis.speechSynthesis.cancel();
  globalThis.speechSynthesis.speak(utterance);
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
    fullTranslate: "全文翻译",
    toolbar: "薇译工具栏",
    tools: "薇译工具",
    expandToolbar: "展开薇译划词工具",
    useTool: "使用「{name}」处理选中文本",
    translate: "翻译",
    result: "结果",
    copy: "复制",
    copied: "已复制",
    emptyOutput: "无输出。",
    processingTool: "{name}处理中",
    speak: "发音",
    progress: "翻译进度 {done}/{total}{cached}{skipped}{token}",
    cached: "，缓存 {count}",
    skipped: "，跳过 {count}",
    preparing: "准备翻译...",
    translationFailedRetry: "翻译失败，点击重试",
    selectTextFirst: "请先选择要处理的文本。",
    toolFailed: "工具执行失败"
  };
  const en = {
    fullTranslate: "Translate Page",
    toolbar: "Vanslate toolbar",
    tools: "Vanslate tools",
    expandToolbar: "Expand Vanslate selection tools",
    useTool: "Use \"{name}\" on selected text",
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
      fullTranslate: "ページを翻訳",
      toolbar: "Vanslate ツールバー",
      tools: "Vanslate ツール",
      expandToolbar: "Vanslate 選択ツールを展開",
      useTool: "選択テキストに「{name}」を使用",
      translate: "翻訳",
      result: "結果",
      copy: "コピー",
      copied: "コピーしました",
      emptyOutput: "出力がありません。",
      processingTool: "{name} 処理中",
      speak: "発音",
      progress: "翻訳進捗 {done}/{total}{cached}{skipped}{token}",
      cached: "、キャッシュ {count}",
      skipped: "、スキップ {count}",
      preparing: "翻訳を準備中...",
      selectTextFirst: "先に処理するテキストを選択してください。",
      toolFailed: "ツール実行に失敗しました"
    },
    "ko-KR": {
      fullTranslate: "페이지 번역",
      toolbar: "Vanslate 도구 모음",
      tools: "Vanslate 도구",
      expandToolbar: "Vanslate 선택 도구 펼치기",
      useTool: "선택한 텍스트에 “{name}” 사용",
      translate: "번역",
      result: "결과",
      copy: "복사",
      copied: "복사됨",
      emptyOutput: "출력이 없습니다.",
      processingTool: "{name} 처리 중",
      speak: "발음",
      progress: "번역 진행 {done}/{total}{cached}{skipped}{token}",
      cached: ", 캐시 {count}",
      skipped: ", 건너뜀 {count}",
      preparing: "번역 준비 중...",
      selectTextFirst: "처리할 텍스트를 먼저 선택하세요.",
      toolFailed: "도구 실행 실패"
    },
    "fr-FR": {
      fullTranslate: "Traduire la page",
      toolbar: "Barre Vanslate",
      tools: "Outils Vanslate",
      expandToolbar: "Afficher les outils de sélection Vanslate",
      useTool: "Utiliser « {name} » sur le texte sélectionné",
      translate: "Traduire",
      result: "Résultat",
      copy: "Copier",
      copied: "Copié",
      emptyOutput: "Aucune sortie.",
      processingTool: "{name} en cours",
      speak: "Prononcer",
      progress: "Progression {done}/{total}{cached}{skipped}{token}",
      cached: ", cache {count}",
      skipped: ", ignorés {count}",
      preparing: "Préparation de la traduction...",
      selectTextFirst: "Sélectionnez d'abord du texte.",
      toolFailed: "Échec de l'outil"
    },
    "de-DE": {
      fullTranslate: "Seite übersetzen",
      toolbar: "Vanslate-Werkzeugleiste",
      tools: "Vanslate-Werkzeuge",
      expandToolbar: "Vanslate-Auswahlwerkzeuge öffnen",
      useTool: "„{name}“ auf ausgewählten Text anwenden",
      translate: "Übersetzen",
      result: "Ergebnis",
      copy: "Kopieren",
      copied: "Kopiert",
      emptyOutput: "Keine Ausgabe.",
      processingTool: "{name} wird ausgeführt",
      speak: "Aussprache",
      progress: "Übersetzungsfortschritt {done}/{total}{cached}{skipped}{token}",
      cached: ", Cache {count}",
      skipped: ", übersprungen {count}",
      preparing: "Übersetzung wird vorbereitet...",
      selectTextFirst: "Bitte zuerst Text auswählen.",
      toolFailed: "Werkzeug fehlgeschlagen"
    },
    "es-ES": {
      fullTranslate: "Traducir página",
      toolbar: "Barra de Vanslate",
      tools: "Herramientas Vanslate",
      expandToolbar: "Abrir herramientas de selección Vanslate",
      useTool: "Usar “{name}” en el texto seleccionado",
      translate: "Traducir",
      result: "Resultado",
      copy: "Copiar",
      copied: "Copiado",
      emptyOutput: "Sin salida.",
      processingTool: "{name} procesando",
      speak: "Pronunciar",
      progress: "Progreso {done}/{total}{cached}{skipped}{token}",
      cached: ", caché {count}",
      skipped: ", omitidos {count}",
      preparing: "Preparando traducción...",
      selectTextFirst: "Selecciona texto primero.",
      toolFailed: "La herramienta falló"
    },
    "pt-BR": {
      fullTranslate: "Traduzir página",
      toolbar: "Barra do Vanslate",
      tools: "Ferramentas Vanslate",
      expandToolbar: "Abrir ferramentas de seleção Vanslate",
      useTool: "Usar “{name}” no texto selecionado",
      translate: "Traduzir",
      result: "Resultado",
      copy: "Copiar",
      copied: "Copiado",
      emptyOutput: "Sem saída.",
      processingTool: "{name} processando",
      speak: "Pronunciar",
      progress: "Progresso {done}/{total}{cached}{skipped}{token}",
      cached: ", cache {count}",
      skipped: ", ignorados {count}",
      preparing: "Preparando tradução...",
      selectTextFirst: "Selecione um texto primeiro.",
      toolFailed: "Falha na ferramenta"
    },
    "it-IT": {
      fullTranslate: "Traduci pagina",
      toolbar: "Barra Vanslate",
      tools: "Strumenti Vanslate",
      expandToolbar: "Apri strumenti di selezione Vanslate",
      useTool: "Usa “{name}” sul testo selezionato",
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
      fullTranslate: "Перевести страницу",
      toolbar: "Панель Vanslate",
      tools: "Инструменты Vanslate",
      expandToolbar: "Открыть инструменты выделения Vanslate",
      useTool: "Применить «{name}» к выделенному тексту",
      translate: "Перевести",
      result: "Результат",
      copy: "Копировать",
      copied: "Скопировано",
      emptyOutput: "Нет вывода.",
      processingTool: "{name} выполняется",
      speak: "Произнести",
      progress: "Прогресс перевода {done}/{total}{cached}{skipped}{token}",
      cached: ", кэш {count}",
      skipped: ", пропущено {count}",
      preparing: "Подготовка перевода...",
      selectTextFirst: "Сначала выделите текст.",
      toolFailed: "Ошибка инструмента"
    },
    "ar-SA": {
      fullTranslate: "ترجمة الصفحة",
      toolbar: "شريط أدوات Vanslate",
      tools: "أدوات Vanslate",
      expandToolbar: "توسيع أدوات التحديد",
      useTool: "استخدام \"{name}\" على النص المحدد",
      translate: "ترجمة",
      result: "النتيجة",
      copy: "نسخ",
      copied: "تم النسخ",
      emptyOutput: "لا يوجد إخراج.",
      processingTool: "{name} قيد المعالجة",
      speak: "نطق",
      progress: "تقدم الترجمة {done}/{total}{cached}{skipped}{token}",
      cached: "، مخبأ {count}",
      skipped: "، تم تخطي {count}",
      preparing: "جارٍ تجهيز الترجمة...",
      selectTextFirst: "حدد النص أولاً.",
      toolFailed: "فشل تنفيذ الأداة"
    },
    "hi-IN": {
      fullTranslate: "पेज अनुवाद करें",
      toolbar: "Vanslate टूलबार",
      tools: "Vanslate टूल",
      expandToolbar: "Vanslate चयन टूल खोलें",
      useTool: "चयनित टेक्स्ट पर “{name}” चलाएँ",
      translate: "अनुवाद",
      result: "परिणाम",
      copy: "कॉपी",
      copied: "कॉपी हो गया",
      emptyOutput: "कोई आउटपुट नहीं।",
      processingTool: "{name} चल रहा है",
      speak: "उच्चारण",
      progress: "अनुवाद प्रगति {done}/{total}{cached}{skipped}{token}",
      cached: ", कैश {count}",
      skipped: ", छोड़ा {count}",
      preparing: "अनुवाद तैयार हो रहा है...",
      selectTextFirst: "पहले टेक्स्ट चुनें।",
      toolFailed: "टूल विफल हुआ"
    },
    "id-ID": {
      fullTranslate: "Terjemahkan Halaman",
      toolbar: "Bilah alat Vanslate",
      tools: "Alat Vanslate",
      expandToolbar: "Buka alat seleksi Vanslate",
      useTool: "Gunakan “{name}” pada teks terpilih",
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
      fullTranslate: "Dịch trang",
      toolbar: "Thanh công cụ Vanslate",
      tools: "Công cụ Vanslate",
      expandToolbar: "Mở công cụ chọn Vanslate",
      useTool: "Dùng “{name}” cho văn bản đã chọn",
      translate: "Dịch",
      result: "Kết quả",
      copy: "Sao chép",
      copied: "Đã sao chép",
      emptyOutput: "Không có đầu ra.",
      processingTool: "{name} đang xử lý",
      speak: "Phát âm",
      progress: "Tiến độ dịch {done}/{total}{cached}{skipped}{token}",
      cached: ", cache {count}",
      skipped: ", bỏ qua {count}",
      preparing: "Đang chuẩn bị dịch...",
      selectTextFirst: "Hãy chọn văn bản trước.",
      toolFailed: "Công cụ thất bại"
    },
    "th-TH": {
      fullTranslate: "แปลหน้า",
      toolbar: "แถบเครื่องมือ Vanslate",
      tools: "เครื่องมือ Vanslate",
      expandToolbar: "เปิดเครื่องมือเลือกข้อความ Vanslate",
      useTool: "ใช้ “{name}” กับข้อความที่เลือก",
      translate: "แปล",
      result: "ผลลัพธ์",
      copy: "คัดลอก",
      copied: "คัดลอกแล้ว",
      emptyOutput: "ไม่มีผลลัพธ์",
      processingTool: "{name} กำลังประมวลผล",
      speak: "ออกเสียง",
      progress: "ความคืบหน้าการแปล {done}/{total}{cached}{skipped}{token}",
      cached: ", แคช {count}",
      skipped: ", ข้าม {count}",
      preparing: "กำลังเตรียมการแปล...",
      selectTextFirst: "โปรดเลือกข้อความก่อน",
      toolFailed: "เครื่องมือทำงานล้มเหลว"
    }
  }[language] || zh;
  const template = dict[key] || key;
  return String(template).replace(/\{(\w+)\}/g, (match, name) => {
    return values[name] === undefined ? match : String(values[name]);
  });
}
