import { BrowserSettingsRepository, BrowserTranslationCache, TabProgressSink } from "../core/browser-adapters";
import { OpenAICompatibleChatClient } from "../core/chat-client";
import { DEFAULT_COLLECTION_RULES, DEFAULT_SELECTION_TOOLS, DEFAULT_SETTINGS, DEFAULT_SKIP_RULES, DEFAULT_TRANSLATION_SYSTEM_PROMPT, DEFAULT_TRANSLATION_USER_PROMPT } from "../core/defaults";
import { readStorageValues, writeStorageValues } from "../core/storage-keys";
import { TranslationService } from "../core/translation-service";
import { isQuotaLimit, readableError, redact } from "../core/utils";

declare const chrome: any;
declare const browser: any;

const ext = (globalThis as any).browser || chrome;
const CONTEXT_MENU_TRANSLATE_PAGE = "vv-vanslate-page";

const settingsRepository = new BrowserSettingsRepository(ext);
const translationCache = new BrowserTranslationCache(ext);
const translationService = new TranslationService(
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

ext.contextMenus?.onClicked.addListener(async (info: any, tab: any) => {
  if (info.menuItemId !== CONTEXT_MENU_TRANSLATE_PAGE || !tab?.id) return;
  await ensureContentScript(tab.id);
  await ext.tabs.sendMessage(tab.id, {
    type: "TRANSLATE_PAGE",
    options: { fromContextMenu: true }
  }).catch(() => {});
});

ext.runtime.onMessage.addListener((message: any, sender: any, sendResponse: (value: unknown) => void) => {
  if (message?.type === "TRANSLATE_TEXTS") {
    translationService.translateTexts(message.texts || [], {
      tabId: sender.tab?.id || message.tabId,
      progressId: message.progressId || "default",
      mode: message.mode || "page"
    })
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: readableError(error), quotaLimited: isQuotaLimit(error) }));
    return true;
  }

  if (message?.type === "TRANSLATE_WORD") {
    translationService.translateWord(message.text || "")
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: readableError(error), quotaLimited: isQuotaLimit(error) }));
    return true;
  }

  if (message?.type === "RUN_SELECTION_TOOL") {
    translationService.runSelectionTool(message.toolId || "translate", message.text || "")
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: readableError(error), quotaLimited: isQuotaLimit(error) }));
    return true;
  }

  if (message?.type === "DEBUG_SELECTION_TOOL") {
    translationService.debugSelectionTool(message.tool || null, message.text || "", message.settings || null)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: readableError(error), quotaLimited: isQuotaLimit(error) }));
    return true;
  }

  if (message?.type === "GET_SETTINGS") {
    settingsRepository.getSettings()
      .then((settings) => sendResponse({ ok: true, settings: redact(settings) }))
      .catch((error) => sendResponse({ ok: false, error: readableError(error) }));
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
    translationCache.clear()
      .then(() => sendResponse({ ok: true }))
      .catch((error: unknown) => sendResponse({ ok: false, error: readableError(error) }));
    return true;
  }

  return false;
});

function createContextMenus(): void {
  if (!ext.contextMenus) return;
  const create = () => {
    ext.contextMenus.create({
      id: CONTEXT_MENU_TRANSLATE_PAGE,
      title: "薇译：翻译全文",
      contexts: ["page", "selection"]
    });
  };
  if ((globalThis as any).browser && ext === (globalThis as any).browser) {
    ext.contextMenus.removeAll().then(create).catch(() => {});
  } else {
    ext.contextMenus.removeAll(create);
  }
}

async function ensureContentScript(tabId: number): Promise<void> {
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
