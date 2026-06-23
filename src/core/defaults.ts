import type { ExtensionSettings, SelectionTool, TextCollectionRules, TranslationSkipRules } from "./types";

export const DEFAULT_TRANSLATION_SYSTEM_PROMPT = [
  "You are Vanslate, a precise AI context translator and verbalizer.",
  "Return only valid JSON for page translation tasks."
].join("\n");

export const DEFAULT_TRANSLATION_USER_PROMPT = [
  "Translate each item {sourceLanguagePrompt} into {targetLanguage}.",
  "Keep meaning, URLs, numbers, code, punctuation intent, and proper nouns accurate.",
  "Keep the output natural for a bilingual web reading experience.",
  "Keep compact number+unit or number+currency tokens unchanged, such as 2MB, 3RMB, 15GB, 20ms, and 10USD.",
  "Keep standalone numbers, versions, dates, times, URLs, emails, file paths, commands, keyboard shortcuts, hashes, IDs, selectors, and dimensions unchanged.",
  "If an item contains simple inline HTML tags such as <strong>, <em>, <b>, <i>, <code>, <mark>, <sub>, <sup>, or <span style=\"color:red\">, preserve the same tags and safe inline styles around the corresponding translated text.",
  "If an item mixes the target language with other languages, keep the parts already in the target language unchanged and translate only the non-target-language parts.",
  "If a short technical token, product name, URL, API name, model name, variable, or code-like fragment is already suitable in the target-language context, keep it unchanged.",
  "{glossaryBlock}",
  "Return only JSON in this exact shape: {\"translations\":[\"...\"]}.",
  "The translations array length must match the input array length.",
  "",
  "{textsJson}"
].join("\n");

export const DEFAULT_SELECTION_TOOLS: SelectionTool[] = [
  {
    id: "translate",
    name: "翻译",
    enabled: true,
    modelMode: "inherit",
    baseUrl: "",
    apiKey: "",
    model: "",
    activeModel: "",
    models: "",
    systemPrompt: "You are Vanslate, a precise AI context translator. Answer in Markdown.",
    userPrompt: "将下面文本翻译成{targetLanguage}。如果内容已包含{targetLanguage}，保留已是目标语言的部分，只翻译其他语言部分。\n\n{text}"
  },
  {
    id: "eli5",
    name: "小白解释",
    enabled: true,
    modelMode: "inherit",
    baseUrl: "",
    apiKey: "",
    model: "",
    activeModel: "",
    models: "",
    systemPrompt: "You explain complex content to beginners. Answer in clear Markdown.",
    userPrompt: "用小白也能理解的方式解释下面内容，使用{targetLanguage}：\n\n{text}"
  },
  {
    id: "professional_explain",
    name: "专业解释",
    enabled: true,
    modelMode: "inherit",
    baseUrl: "",
    apiKey: "",
    model: "",
    activeModel: "",
    models: "",
    systemPrompt: "You are a domain expert. Explain with precision and useful structure. Answer in Markdown.",
    userPrompt: "请用专业但清晰的方式解释下面内容，使用{targetLanguage}：\n\n{text}"
  },
  {
    id: "summarize",
    name: "总结",
    enabled: true,
    modelMode: "inherit",
    baseUrl: "",
    apiKey: "",
    model: "",
    activeModel: "",
    models: "",
    systemPrompt: "You summarize text faithfully and concisely. Answer in Markdown.",
    userPrompt: "请总结下面内容，提炼关键点，使用{targetLanguage}：\n\n{text}"
  },
  {
    id: "rewrite",
    name: "改写",
    enabled: true,
    modelMode: "inherit",
    baseUrl: "",
    apiKey: "",
    model: "",
    activeModel: "",
    models: "",
    systemPrompt: "You rewrite text while preserving meaning. Answer only with the rewritten content in Markdown.",
    userPrompt: "请改写下面内容，使表达更清晰自然，使用{targetLanguage}：\n\n{text}"
  },
  {
    id: "technicalize",
    name: "技术化",
    enabled: true,
    modelMode: "inherit",
    baseUrl: "",
    apiKey: "",
    model: "",
    activeModel: "",
    models: "",
    systemPrompt: "You turn casual content into precise technical writing. Answer in Markdown.",
    userPrompt: "请把下面内容改写为更技术化、准确、结构清晰的表达，使用{targetLanguage}：\n\n{text}"
  },
  {
    id: "casualize",
    name: "口语化",
    enabled: true,
    modelMode: "inherit",
    baseUrl: "",
    apiKey: "",
    model: "",
    activeModel: "",
    models: "",
    systemPrompt: "You make text conversational and easy to read. Answer in Markdown.",
    userPrompt: "请把下面内容改写得更口语化、自然、容易理解，使用{targetLanguage}：\n\n{text}"
  },
  {
    id: "academicize",
    name: "学术化",
    enabled: true,
    modelMode: "inherit",
    baseUrl: "",
    apiKey: "",
    model: "",
    activeModel: "",
    models: "",
    systemPrompt: "You rewrite text in a formal academic style. Answer in Markdown.",
    userPrompt: "请把下面内容改写为更学术化、严谨的表达，使用{targetLanguage}：\n\n{text}"
  },
  {
    id: "code_comment",
    name: "代码注释化",
    enabled: true,
    modelMode: "inherit",
    baseUrl: "",
    apiKey: "",
    model: "",
    activeModel: "",
    models: "",
    systemPrompt: "You explain code or technical snippets with concise comments and notes. Answer in Markdown.",
    userPrompt: "请把下面内容整理为适合代码注释或技术注释的说明，使用{targetLanguage}。如果是代码，请保留代码含义并解释关键逻辑：\n\n{text}"
  }
];

export const DEFAULT_COLLECTION_RULES: TextCollectionRules = {
  blockTags: ["H1", "H2", "H3", "H4", "H5", "H6", "P", "LI", "BLOCKQUOTE", "FIGCAPTION", "TD", "TH", "DT", "DD"],
  formTags: ["LABEL", "LEGEND", "CAPTION", "SUMMARY"],
  supplementalTags: ["DIV", "SPAN"],
  supplementalContextPattern: "comment|comments|cmtx|review|feedback|discussion|reply",
  metadataPattern: "avatar|gravatar|author|user(name)?|date|time|timestamp|count|rating|stars|captcha|honeypot|pagination|page_number"
};

export const DEFAULT_SKIP_RULES: TranslationSkipRules = {
  enabled: true,
  patterns: [
    "^[+-]?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:[.,]\\d+)?%?$",
    "^[+-]?\\d+(?:[.,]\\d+)?\\s?(?:[A-Za-z]{1,8}|[%°℃℉¥$€£₽₹₩])$",
    "^[vV]?\\d+(?:\\.\\d+){1,4}(?:[-_+][A-Za-z0-9][A-Za-z0-9._-]*)?$",
    "^(?:alpha|beta|rc|release|stable|nightly|canary|dev|preview)(?:[-_ ]?\\d+)?$",
    "^\\d{4}[-/.年]\\d{1,2}(?:[-/.月]\\d{1,2}日?)?$",
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
    "^(?:⌘|⇧|⌥|⌃)(?:\\s*\\+?\\s*(?:[A-Za-z0-9]|F\\d{1,2}|Tab|Enter|Return|Esc|Escape|Space|Backspace|Delete|⌘|⇧|⌥|⌃))+$",
    "^\\d{2,5}\\s*[x×]\\s*\\d{2,5}(?:\\s*[x×]\\s*\\d{1,5})?$",
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

export const DEFAULT_SETTINGS: ExtensionSettings = {
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  models: "gpt-4o-mini\n",
  activeModel: "gpt-4o-mini",
  uiLanguage: "zh-CN",
  sourceLanguage: "auto",
  targetLanguage: "中文",
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
