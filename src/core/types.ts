export type RenderMode = "inline" | "block";
export type ToolModelMode = "inherit" | "custom";
export type FloatingBallMode = "always" | "hidden" | "hover";

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface SelectionTool {
  id: string;
  name: string;
  enabled: boolean;
  modelMode: ToolModelMode;
  baseUrl: string;
  apiKey: string;
  model: string;
  activeModel: string;
  models: string;
  systemPrompt: string;
  userPrompt: string;
}

export interface TextCollectionRules {
  blockTags: string[];
  formTags: string[];
  supplementalTags: string[];
  supplementalContextPattern: string;
  metadataPattern: string;
}

export interface TranslationSkipRules {
  enabled: boolean;
  patterns: string[];
}

export interface ExtensionSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
  models: string;
  activeModel: string;
  uiLanguage: string;
  sourceLanguage: string;
  targetLanguage: string;
  preserveOriginal: boolean;
  renderMode: RenderMode;
  translationColorEnabled: boolean;
  translationColor: string;
  translationCss: string;
  enableCache: boolean;
  enableAutoTranslate: boolean;
  autoTranslateRules: string;
  glossary: string;
  retryCount: number;
  enableFloatingBall: boolean;
  floatingBallMode: FloatingBallMode;
  floatingBallPosition: {
    side: "left" | "right";
    top: number;
  };
  translationSystemPrompt: string;
  translationUserPrompt: string;
  collectionRules: TextCollectionRules;
  skipRules: TranslationSkipRules;
  selectionTools: SelectionTool[];
}

export interface TextInputItem {
  id: string;
  text: string;
  index: number;
}

export interface TranslateTextContext {
  tabId?: number;
  progressId: string;
  mode: "page" | "auto" | string;
}

export interface ModelSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  endpoint: string;
  apiKey: string;
  model: string;
  temperature: number;
  messages: ChatMessage[];
  retryCount: number;
}

export interface ChatResponse {
  message: Record<string, unknown>;
  content: string;
  usage: Usage;
  raw: unknown;
}

export interface SettingsRepository {
  getSettings(): Promise<ExtensionSettings>;
}

export interface TranslationCacheEntry {
  translation: string;
  updatedAt: number;
}

export type TranslationCacheMap = Record<string, TranslationCacheEntry>;

export interface TranslationCacheStore {
  getMany(keys: string[]): Promise<TranslationCacheMap>;
  setMany(entries: TranslationCacheMap): Promise<void>;
  clear?(): Promise<void>;
}

export interface ProgressSink {
  postItemResult(context: TranslateTextContext, item: Record<string, unknown>): void;
  postProgress(context: TranslateTextContext, progress: Record<string, unknown>): void;
}
