import { DEFAULT_SETTINGS, DEFAULT_TRANSLATION_SYSTEM_PROMPT, DEFAULT_TRANSLATION_USER_PROMPT } from "./defaults";
import type { ExtensionSettings, ProgressSink, TranslateTextContext, TranslationCacheMap, TranslationCacheStore } from "./types";
import { readStorageValues } from "./storage-keys";
import { compact, normalizeSelectionTools, normalizeTranslationSkipRules } from "./utils";

export const CACHE_KEY = "vv_vanslate_translation_cache";
export const MAX_CACHE_ITEMS = 800;
const INDEXED_DB_NAME = "vv-vanslate-cache-db";
const INDEXED_DB_VERSION = 2;
const CACHE_STORE_NAME = "vv_vanslation_cache";
const CACHE_META_KEY = "vv_vanslate_translation_cache_meta";

export class BrowserSettingsRepository {
  constructor(private readonly ext: any) {}

  async getSettings(): Promise<ExtensionSettings> {
    const stored = await readStorageValues(this.ext.storage.local, Object.keys(DEFAULT_SETTINGS));
    const settings = { ...DEFAULT_SETTINGS, ...compact(stored) } as ExtensionSettings;
    settings.model = settings.activeModel || settings.model;
    settings.translationSystemPrompt = DEFAULT_TRANSLATION_SYSTEM_PROMPT;
    settings.translationUserPrompt = DEFAULT_TRANSLATION_USER_PROMPT;
    settings.skipRules = normalizeTranslationSkipRules(settings.skipRules);
    settings.selectionTools = normalizeSelectionTools(settings.selectionTools);
    return settings;
  }
}

export class BrowserTranslationCache implements TranslationCacheStore {
  constructor(private readonly ext: any) {}

  async getMany(keys: string[]): Promise<TranslationCacheMap> {
    const uniqueKeys = Array.from(new Set(keys.filter(Boolean)));
    if (!uniqueKeys.length) return {};
    const db = await openVanslateCacheDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE_NAME, "readonly");
      const store = tx.objectStore(CACHE_STORE_NAME);
      const output: TranslationCacheMap = {};
      uniqueKeys.forEach((key) => {
        const request = store.get(key);
        request.onsuccess = () => {
          const record = request.result as (TranslationCacheEntryRecord | undefined);
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

  async setMany(entries: TranslationCacheMap): Promise<void> {
    const records = Object.entries(entries).filter(([, value]) => value?.translation);
    if (!records.length) return;
    const db = await openVanslateCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE_NAME, "readwrite");
      const store = tx.objectStore(CACHE_STORE_NAME);
      records.forEach(([key, value]) => {
        store.put({
          vv_key: key,
          translation: value.translation,
          updatedAt: Number(value.updatedAt) || Date.now()
        } satisfies TranslationCacheEntryRecord);
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    await trimVanslateCache(db);
  }

  async clear(): Promise<void> {
    const db = await openVanslateCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE_NAME, "readwrite");
      tx.objectStore(CACHE_STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    await this.ext.storage.local.remove([CACHE_KEY, CACHE_META_KEY]).catch(() => {});
  }
}

interface TranslationCacheEntryRecord {
  vv_key: string;
  translation: string;
  updatedAt: number;
}

function openVanslateCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(INDEXED_DB_NAME, INDEXED_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      let store: IDBObjectStore | undefined;
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

async function trimVanslateCache(db: IDBDatabase): Promise<void> {
  await new Promise<void>((resolve, reject) => {
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

export class TabProgressSink implements ProgressSink {
  constructor(private readonly ext: any) {}

  postItemResult(context: TranslateTextContext, item: Record<string, unknown>): void {
    if (!context?.tabId || !item?.id) return;
    this.ext.tabs.sendMessage(context.tabId, {
      type: "TRANSLATION_ITEM_RESULT",
      progressId: context.progressId,
      mode: context.mode,
      item
    }).catch(() => {});
  }

  postProgress(context: TranslateTextContext, progress: Record<string, unknown>): void {
    if (!context?.tabId) return;
    this.ext.tabs.sendMessage(context.tabId, {
      type: "TRANSLATION_PROGRESS",
      progressId: context.progressId,
      mode: context.mode,
      progress
    }).catch(() => {});
  }
}
