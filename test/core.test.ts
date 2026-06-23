import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, DEFAULT_TRANSLATION_SYSTEM_PROMPT, DEFAULT_TRANSLATION_USER_PROMPT } from "../src/core/defaults";
import { TranslationService } from "../src/core/translation-service";
import { OpenAICompatibleChatClient, type ChatClient } from "../src/core/chat-client";
import { readStorageValues, storageKey, writeStorageValues } from "../src/core/storage-keys";
import type { ExtensionSettings, ProgressSink, SettingsRepository, TranslationCacheMap, TranslationCacheStore } from "../src/core/types";
import {
  normalizeSelectionTools,
  normalizeTranslationSkipRules,
  parseGlossary,
  parseTranslations,
  renderTemplate,
  shouldSkipTranslation
} from "../src/core/utils";

test("parseGlossary supports common separators", () => {
  assert.deepEqual(parseGlossary("LLM => 大语言模型\nAPI = 接口\nbrowser, 浏览器"), [
    { source: "LLM", target: "大语言模型" },
    { source: "API", target: "接口" },
    { source: "browser", target: "浏览器" }
  ]);
});

test("renderTemplate preserves unknown placeholders", () => {
  assert.equal(
    renderTemplate("Translate {text} to {targetLanguage}; keep {unknown}.", {
      text: "hello",
      targetLanguage: "中文"
    }),
    "Translate hello to 中文; keep {unknown}."
  );
});

test("parseTranslations extracts JSON from fenced model output", () => {
  assert.deepEqual(parseTranslations("```json\n{\"translations\":[\"你好\",\"世界\"]}\n```"), ["你好", "世界"]);
});

test("shouldSkipTranslation only skips high-confidence target-language text", () => {
  const zhSettings = settings({ targetLanguage: "中文", sourceLanguage: "auto" });
  assert.equal(shouldSkipTranslation("这是中文内容。", zhSettings), true);
  assert.equal(shouldSkipTranslation("这是中文 with English words.", zhSettings), false);
  assert.equal(shouldSkipTranslation("2MB", zhSettings), true);
  assert.equal(shouldSkipTranslation("3RMB", zhSettings), true);
  assert.equal(shouldSkipTranslation("1.0.0", zhSettings), true);
  assert.equal(shouldSkipTranslation("1.20-beta", zhSettings), true);
  assert.equal(shouldSkipTranslation("alpha", zhSettings), true);
  assert.equal(shouldSkipTranslation("v2.1.3-rc.1", zhSettings), true);
  assert.equal(shouldSkipTranslation("123", zhSettings), true);
  assert.equal(shouldSkipTranslation("50%", zhSettings), true);
  assert.equal(shouldSkipTranslation("2026-05-18", zhSettings), true);
  assert.equal(shouldSkipTranslation("10:30 PM", zhSettings), true);
  assert.equal(shouldSkipTranslation("https://example.com/docs", zhSettings), true);
  assert.equal(shouldSkipTranslation("support@example.com", zhSettings), true);
  assert.equal(shouldSkipTranslation("README.md", zhSettings), true);
  assert.equal(shouldSkipTranslation("/usr/local/bin", zhSettings), true);
  assert.equal(shouldSkipTranslation("npm install", zhSettings), true);
  assert.equal(shouldSkipTranslation("NODE_ENV=production", zhSettings), true);
  assert.equal(shouldSkipTranslation("550e8400-e29b-41d4-a716-446655440000", zhSettings), true);
  assert.equal(shouldSkipTranslation("Ctrl+Shift+P", zhSettings), true);
  assert.equal(shouldSkipTranslation("1920x1080", zhSettings), true);
  assert.equal(shouldSkipTranslation(".container", zhSettings), true);
  assert.equal(shouldSkipTranslation("<div>", zhSettings), true);
  assert.equal(shouldSkipTranslation("RTX 4090", zhSettings), true);

  const enSettings = settings({ targetLanguage: "English", sourceLanguage: "auto" });
  assert.equal(shouldSkipTranslation("This is already English content.", enSettings), true);
  assert.equal(shouldSkipTranslation("这是中文内容。", enSettings), false);
});

test("translation skip rules are user configurable", () => {
  const disabled = settings({
    targetLanguage: "中文",
    skipRules: { enabled: false, patterns: [] }
  });
  assert.equal(shouldSkipTranslation("README.md", disabled), false);

  const custom = settings({
    targetLanguage: "中文",
    skipRules: { enabled: true, patterns: ["^DO_NOT_TRANSLATE$"] }
  });
  assert.equal(shouldSkipTranslation("DO_NOT_TRANSLATE", custom), true);
  assert.equal(shouldSkipTranslation("README.md", custom), false);
  assert.deepEqual(normalizeTranslationSkipRules({ patterns: ["^A$", "^A$", ""] }).patterns, ["^A$"]);
});

test("normalizeSelectionTools sanitizes ids and keeps model inheritance", () => {
  const [tool] = normalizeSelectionTools([
    {
      id: "my tool!",
      name: "My Tool",
      enabled: true,
      userPrompt: "Process {text}",
      systemPrompt: "You help",
      modelMode: "inherit"
    }
  ]);
  assert.equal(tool.id, "my_tool_");
  assert.equal(tool.modelMode, "inherit");
  assert.equal(tool.enabled, true);
});

test("storage helpers only read and write vv-prefixed keys", async () => {
  const state: Record<string, unknown> = { ignoredApiKey: "ignored-key" };
  const area = {
    async get(keys: string[]) {
      return Object.fromEntries(keys.filter((key) => state[key] !== undefined).map((key) => [key, state[key]]));
    },
    async set(values: Record<string, unknown>) {
      Object.assign(state, values);
    }
  };

  assert.equal(storageKey("apiKey"), "vv_vanslate_apiKey");
  assert.deepEqual(await readStorageValues(area, ["apiKey"]), {});
  await writeStorageValues(area, { apiKey: "new-key" });
  assert.equal(typeof state.vv_vanslate_cryptoSecret, "string");
  assert.match(String(state.vv_vanslate_apiKey), /^vvenc1:/);
  assert.notEqual(state.vv_vanslate_apiKey, "new-key");
  assert.equal(state.ignoredApiKey, "ignored-key");
  assert.deepEqual(await readStorageValues(area, ["apiKey"]), { apiKey: "new-key" });
  await writeStorageValues(area, {
    selectionTools: [{ id: "custom", name: "Custom", apiKey: "tool-key" }]
  });
  assert.match(String((state.vv_vanslate_selectionTools as any[])[0].apiKey), /^vvenc1:/);
  assert.deepEqual(await readStorageValues(area, ["selectionTools"]), {
    selectionTools: [{ id: "custom", name: "Custom", apiKey: "tool-key" }]
  });
});

test("OpenAICompatibleChatClient retries retryable failures and normalizes usage", async () => {
  const endpoints: string[] = [];
  const delays: number[] = [];
  const fetchImpl = (async (input) => {
    endpoints.push(String(input));
    if (endpoints.length === 1) {
      return jsonResponse(500, { error: { message: "temporary overload" } });
    }
    return jsonResponse(200, {
      choices: [{ message: { content: " 完成 ", reasoning_content: "thinking" } }],
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 }
    });
  }) as typeof fetch;

  const client = new OpenAICompatibleChatClient(fetchImpl, async (ms) => {
    delays.push(ms);
  }, 5);

  const result = await client.complete({
    endpoint: "https://api.example.com/v1/chat/completions",
    apiKey: "test-key",
    model: "test-model",
    temperature: 0.2,
    retryCount: 1,
    messages: [
      { role: "system", content: "You help." },
      { role: "user", content: "Hello" }
    ]
  });

  assert.equal(endpoints.length, 2);
  assert.deepEqual(delays, [5]);
  assert.equal(result.content, "完成");
  assert.deepEqual(result.usage, {
    prompt_tokens: 1,
    completion_tokens: 2,
    total_tokens: 3
  });
  assert.equal((result.message as Record<string, unknown>).reasoning_content, "thinking");
});

test("TranslationService uses cache, skip rule, and per-item progress", async () => {
  const cache: TranslationCacheMap = {};
  const settingsValue = settings({
    targetLanguage: "中文",
    sourceLanguage: "auto",
    enableCache: true
  });
  const repository: SettingsRepository = {
    async getSettings() {
      return settingsValue;
    }
  };
  const cacheStore: TranslationCacheStore = {
    async getMany(keys) {
      return Object.fromEntries(keys.filter((key) => cache[key]).map((key) => [key, cache[key]]));
    },
    async setMany(entries) {
      Object.assign(cache, entries);
    }
  };
  const calls: string[] = [];
  const chat: ChatClient = {
    async complete(request) {
      calls.push(request.messages[1].content);
      return {
        message: { content: "{\"translations\":[\"你好\"]}" },
        content: "{\"translations\":[\"你好\"]}",
        usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
        raw: {}
      };
    }
  };
  const events: Array<Record<string, unknown>> = [];
  const sink: ProgressSink = {
    postItemResult(_context, item) {
      events.push({ type: "item", ...item });
    },
    postProgress(_context, progress) {
      events.push({ type: "progress", ...progress });
    }
  };

  const service = new TranslationService(repository, cacheStore, chat, sink, () => 123);
  const first = await service.translateTexts([
    { id: "a", text: "这是中文内容。" },
    { id: "b", text: "Hello" }
  ], { progressId: "p1", mode: "page" });

  assert.equal(first.skippedCount, 1);
  assert.equal(first.translatedCount, 2);
  assert.equal(calls.length, 1);
  assert.equal(events.some((event) => event.type === "item" && event.id === "a" && event.skipped === true), true);

  const second = await service.translateTexts([
    { id: "c", text: "Hello" }
  ], { progressId: "p2", mode: "page" });

  assert.equal(second.cachedCount, 1);
  assert.equal(calls.length, 1);
});

test("TranslationService batches misses and writes cache incrementally", async () => {
  const cache: TranslationCacheMap = {};
  const repository: SettingsRepository = {
    async getSettings() {
      return settings({
        targetLanguage: "中文",
        sourceLanguage: "auto",
        enableCache: true
      });
    }
  };
  const cacheWrites: number[] = [];
  const cacheStore: TranslationCacheStore = {
    async getMany(keys) {
      return Object.fromEntries(keys.filter((key) => cache[key]).map((key) => [key, cache[key]]));
    },
    async setMany(entries) {
      cacheWrites.push(Object.keys(entries).length);
      Object.assign(cache, entries);
    }
  };
  const calls: number[] = [];
  const chat: ChatClient = {
    async complete(request) {
      const content = request.messages[1].content;
      const jsonStart = content.lastIndexOf("{\"texts\":");
      const texts = JSON.parse(content.slice(jsonStart)).texts as string[];
      calls.push(texts.length);
      return {
        message: { content: JSON.stringify({ translations: texts.map((text) => `${text}-译`) }) },
        content: JSON.stringify({ translations: texts.map((text) => `${text}-译`) }),
        usage: { prompt_tokens: texts.length, completion_tokens: texts.length, total_tokens: texts.length * 2 },
        raw: {}
      };
    }
  };
  const sink: ProgressSink = {
    postItemResult() {},
    postProgress() {}
  };

  const service = new TranslationService(repository, cacheStore, chat, sink, () => 456);
  const result = await service.translateTexts([
    { id: "a", text: "First release note." },
    { id: "b", text: "Second release note." },
    { id: "c", text: "Third release note." },
    { id: "d", text: "Fourth release note." },
    { id: "e", text: "Fifth release note." }
  ], { progressId: "batch", mode: "page" });

  assert.deepEqual(calls.sort((a, b) => b - a), [4, 1]);
  assert.deepEqual(cacheWrites.sort((a, b) => b - a), [4, 1]);
  assert.equal(result.translatedCount, 5);
  assert.equal(Object.keys(cache).length, 5);
});

function settings(overrides: Partial<ExtensionSettings> = {}): ExtensionSettings {
  return {
    ...DEFAULT_SETTINGS,
    baseUrl: "https://api.example.com/v1",
    apiKey: "test-key",
    model: "test-model",
    activeModel: "test-model",
    translationSystemPrompt: DEFAULT_TRANSLATION_SYSTEM_PROMPT,
    translationUserPrompt: DEFAULT_TRANSLATION_USER_PROMPT,
    selectionTools: [],
    ...overrides
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status >= 400 ? "Error" : "OK",
    headers: { "content-type": "application/json" }
  });
}
