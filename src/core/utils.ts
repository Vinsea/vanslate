import { DEFAULT_SELECTION_TOOLS, DEFAULT_SKIP_RULES } from "./defaults";
import type { ExtensionSettings, ModelSettings, SelectionTool, TranslationSkipRules, Usage } from "./types";

export function compact<T extends Record<string, unknown>>(value: T | null | undefined): Partial<T> {
  return Object.fromEntries(
    Object.entries(value || {}).filter(([, item]) => item !== undefined && item !== null)
  ) as Partial<T>;
}

export function normalizeModelsText(value: unknown): string {
  return String(value || "")
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join("\n");
}

export function firstModel(modelsText: unknown): string {
  return String(modelsText || "").split(/\n+/).map((item) => item.trim()).find(Boolean) || "";
}

export function normalizeSelectionTools(value: unknown): SelectionTool[] {
  let tools = value;
  if (typeof tools === "string") {
    try {
      tools = JSON.parse(tools);
    } catch {
      tools = [];
    }
  }
  if (!Array.isArray(tools) || !tools.length) tools = DEFAULT_SELECTION_TOOLS;
  const toolList = tools as Array<Record<string, unknown>>;
  const normalized = toolList
    .map((tool: Record<string, unknown>, index: number) => {
      const models = normalizeModelsText(tool?.models || tool?.model || "");
      const model = String(tool?.activeModel || tool?.model || firstModel(models) || "").trim();
      return {
        id: String(tool?.id || `tool_${index + 1}`).trim().replace(/[^\w-]+/g, "_"),
        name: String(tool?.name || `工具 ${index + 1}`).trim(),
        enabled: tool?.enabled !== false,
        modelMode: tool?.modelMode === "custom" ? "custom" : "inherit",
        baseUrl: String(tool?.baseUrl || "").trim().replace(/\/+$/, ""),
        apiKey: String(tool?.apiKey || "").trim(),
        model,
        activeModel: model,
        models,
        systemPrompt: String(tool?.systemPrompt || "").trim(),
        userPrompt: String(tool?.userPrompt || "").trim()
      } satisfies SelectionTool;
    })
    .filter((tool: SelectionTool) => tool.id && tool.name && tool.userPrompt);
  return normalized.length ? normalized : DEFAULT_SELECTION_TOOLS;
}

export function resolveToolModelSettings(settings: ExtensionSettings, tool: SelectionTool): ModelSettings {
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

export function validateModelSettings(settings: ModelSettings): void {
  if (!settings.baseUrl) throw new Error("Base URL is required.");
  if (!settings.apiKey) throw new Error("API key is required. Open extension options first.");
  if (!settings.model) throw new Error("Model is required.");
  if (!isSecureApiBaseUrl(settings.baseUrl)) {
    throw new Error("Base URL must use HTTPS. HTTP is only allowed for localhost development.");
  }
}

export function parseTranslations(content: unknown): string[] {
  if (!content) throw new Error("The model returned an empty response.");
  const cleaned = extractJson(String(content).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, ""));
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed.translations)) {
    throw new Error("The model response does not contain translations[].");
  }
  return parsed.translations.map((item: unknown) => String(item || "").trim());
}

export function extractJson(text: string): string {
  if (text.startsWith("{") && text.endsWith("}")) return text;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

export function parseGlossary(value: unknown): Array<{ source: string; target: string }> {
  return String(value || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [source = "", ...rest] = line.split(/\s*(?:=>|=|,)\s*/);
      return { source: source.trim(), target: rest.join(" ").trim() };
    })
    .filter((item) => item.source && item.target);
}

/**
 * Renders user-editable prompt templates. Unknown placeholders are preserved
 * intentionally so a typo is visible in debug output instead of silently
 * removing user content.
 */
export function renderTemplate(template: unknown, values: Record<string, unknown>): string {
  return String(template || "").replace(/\{(\w+)\}/g, (match, key) => {
    if (values[key] === undefined || values[key] === null) return match;
    return String(values[key]);
  });
}

export function buildToolMessages(tool: SelectionTool, promptVars: Record<string, unknown>) {
  return [
    {
      role: "system" as const,
      content: renderTemplate(tool.systemPrompt, promptVars)
    },
    {
      role: "user" as const,
      content: renderTemplate(tool.userPrompt, promptVars)
    }
  ];
}

export function normalizeInputItem(item: unknown, index: number) {
  if (item && typeof item === "object") {
    const record = item as Record<string, unknown>;
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

export function cacheKey(text: string, settings: ExtensionSettings): string {
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

export function sourceLanguagePrompt(sourceLanguage: unknown): string {
  const source = String(sourceLanguage || "auto").trim();
  return !source || source.toLowerCase() === "auto" ? "from the detected source language" : `from ${source}`;
}

/**
 * Fast local language heuristic used before spending tokens. It only skips
 * cases with high confidence; mixed-language content is still sent to the
 * model so prompts can translate the non-target-language fragments.
 */
export function shouldSkipTranslation(text: string, settings: ExtensionSettings): boolean {
  if (matchesTranslationSkipRule(text, settings.skipRules)) return true;

  const target = normalizeLanguageName(settings.targetLanguage);
  const source = normalizeLanguageName(settings.sourceLanguage);
  const stats = languageStats(text);
  const meaningfulLatinWords = stats.latinWords.filter((word) => !isProtectedLatinToken(word));
  const nonLatinSourceChars = stats.han + stats.kana + stats.hangul + stats.cyrillic;

  if (target === "zh") {
    return stats.han >= 2
      && stats.kana === 0
      && stats.hangul === 0
      && stats.cyrillic === 0
      && meaningfulLatinWords.length === 0;
  }

  if (target === "ja") {
    return stats.kana >= 2
      && stats.hangul === 0
      && stats.cyrillic === 0
      && meaningfulLatinWords.length === 0;
  }

  if (target === "ko") {
    return stats.hangul >= 2
      && stats.kana === 0
      && stats.cyrillic === 0
      && meaningfulLatinWords.length === 0;
  }

  if (target === "en") {
    if (source && source !== "auto" && source !== "en") return false;
    return nonLatinSourceChars === 0 && looksLikeEnglish(stats.latinWords);
  }

  return false;
}

export function normalizeTranslationSkipRules(value: unknown): TranslationSkipRules {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const patterns = Array.isArray(source.patterns) ? source.patterns : DEFAULT_SKIP_RULES.patterns;
  const normalizedPatterns = patterns
    .map((pattern) => String(pattern || "").trim())
    .filter(Boolean);
  return {
    enabled: source.enabled !== false,
    patterns: normalizedPatterns.length ? Array.from(new Set(normalizedPatterns)) : DEFAULT_SKIP_RULES.patterns
  };
}

export function validateTranslationSkipRules(value: unknown): TranslationSkipRules {
  const rules = normalizeTranslationSkipRules(value);
  rules.patterns.forEach((pattern) => {
    compileSkipPattern(pattern);
  });
  return rules;
}

const compiledSkipRulesCache = new Map<string, RegExp[]>();

function matchesTranslationSkipRule(text: string, value: unknown): boolean {
  const source = String(text || "").trim();
  if (!source) return false;
  const rules = normalizeTranslationSkipRules(value);
  if (!rules.enabled) return false;
  return getCompiledSkipRules(rules).some((pattern) => pattern.test(source));
}

function getCompiledSkipRules(rules: TranslationSkipRules): RegExp[] {
  const cacheKey = JSON.stringify(rules.patterns);
  const cached = compiledSkipRulesCache.get(cacheKey);
  if (cached) return cached;
  const compiled = rules.patterns.map(compileSkipPattern);
  compiledSkipRulesCache.set(cacheKey, compiled);
  return compiled;
}

function compileSkipPattern(pattern: string): RegExp {
  const value = String(pattern || "").trim();
  const match = value.match(/^\/(.+)\/([dgimsuvy]*)$/);
  if (match?.[1]) return new RegExp(match[1], String(match[2] || "").replace(/[gy]/g, ""));
  return new RegExp(value, "i");
}

export function normalizeLanguageName(value: unknown): string {
  const text = String(value || "").trim().toLowerCase();
  if (!text || text === "auto" || text === "自动") return "auto";
  if (/^(zh|zh-cn|zh_cn|chinese|中文|简体中文|繁體中文|汉语|漢語)$/.test(text)) return "zh";
  if (/^(en|en-us|en_us|english|英文|英语)$/.test(text)) return "en";
  if (/^(ja|jp|japanese|日本語|日语|日文)$/.test(text)) return "ja";
  if (/^(ko|kr|korean|한국어|韩语|韓語)$/.test(text)) return "ko";
  return text;
}

export function languageStats(text: string) {
  const value = String(text || "");
  return {
    han: countMatches(value, /[\u3400-\u9fff]/g),
    kana: countMatches(value, /[\u3040-\u30ff]/g),
    hangul: countMatches(value, /[\uac00-\ud7af]/g),
    cyrillic: countMatches(value, /[\u0400-\u04ff]/g),
    latinWords: value.match(/[A-Za-z][A-Za-z'-]*/g) || []
  };
}

export function normalizeUsage(usage: unknown): Usage {
  const record = (usage || {}) as Record<string, unknown>;
  return {
    prompt_tokens: Number(record.prompt_tokens) || 0,
    completion_tokens: Number(record.completion_tokens) || 0,
    total_tokens: Number(record.total_tokens) || 0
  };
}

export function zeroUsage(): Usage {
  return normalizeUsage(null);
}

export function addUsage(left: Partial<Usage> | null | undefined, right: Partial<Usage> | null | undefined): Usage {
  return {
    prompt_tokens: (Number(left?.prompt_tokens) || 0) + (Number(right?.prompt_tokens) || 0),
    completion_tokens: (Number(left?.completion_tokens) || 0) + (Number(right?.completion_tokens) || 0),
    total_tokens: (Number(left?.total_tokens) || 0) + (Number(right?.total_tokens) || 0)
  };
}

export function extractReasoning(message: Record<string, unknown>): string {
  return String(
    message?.reasoning ||
    message?.reasoning_content ||
    message?.thinking ||
    message?.thoughts ||
    ""
  ).trim();
}

export function joinUrl(baseUrl: string, path: string): string {
  return `${String(baseUrl).replace(/\/+$/, "")}${path}`;
}

export function isQuotaLimit(error: unknown): boolean {
  const record = error as Record<string, unknown>;
  return record?.status === 429 || /quota|rate.?limit|too many requests|insufficient_quota/i.test(readableError(error));
}

export function readableError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function redact(settings: ExtensionSettings): ExtensionSettings {
  return {
    ...settings,
    apiKey: settings.apiKey ? "configured" : "",
    selectionTools: normalizeSelectionTools(settings.selectionTools).map((tool) => ({
      ...tool,
      apiKey: tool.apiKey ? "configured" : ""
    }))
  };
}

function looksLikeEnglish(words: string[]): boolean {
  const normalizedWords = words
    .map((word) => word.toLowerCase())
    .filter((word) => word.length >= 2);
  if (normalizedWords.length < 2) return false;
  const stopwords = new Set([
    "a", "an", "and", "are", "as", "at", "be", "by", "can", "for", "from", "has", "have",
    "how", "in", "is", "it", "of", "on", "or", "that", "the", "this", "to", "using", "was",
    "we", "with", "you", "your"
  ]);
  return normalizedWords.some((word) => stopwords.has(word)) || normalizedWords.length >= 5;
}

function isProtectedLatinToken(word: string): boolean {
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

function countMatches(value: string, pattern: RegExp): number {
  const matches = String(value || "").match(pattern);
  return matches ? matches.length : 0;
}

function hashString(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return `k${(hash >>> 0).toString(36)}`;
}

function isSecureApiBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    if (url.protocol !== "http:") return false;
    return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}
