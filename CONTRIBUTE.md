# 贡献与二开指南

本文档面向准备二开、扩展功能或维护 Vanslate 的开发者。更细的模块设计、运行时边界和发布流程见 [docs/README.md](./docs/README.md)。

## 开发环境

```bash
cd vanslate
npm install
```

常用命令：

```bash
npm run build          # 构建扩展入口 JS
npm test               # 运行单元测试
npm run validate       # 检查项目命名、临时文件和产品页资源
npm run check          # 类型检查 + 构建 + 单元测试 + 项目校验
npm run package:chrome # 构建并生成 Chrome zip/crx
```

打包产物：

```text
packages/vanslate-unpacked/
packages/vanslate-1.1.0.zip
packages/vanslate-1.1.0.crx
```

产品页下载文件会同步到：

```text
vanslate/website/downloads/vanslate-1.1.0.zip
```

## 目录结构

```text
vanslate/
  src/
    core/       # 可测试核心逻辑
    entries/    # 浏览器扩展入口
  test/         # 单元测试
  scripts/      # 构建、测试、打包脚本
  website/      # 产品页、隐私政策、支持页
  _locales/     # Manifest 国际化
```

## 架构原则

- `src/core/` 放业务核心，尽量不依赖 DOM 和浏览器 API。
- `src/entries/` 放扩展入口、消息路由和 UI 操作。
- 浏览器 API 通过 adapter 注入，不直接写进核心服务。
- 可测试逻辑优先写成纯函数或类方法。
- 新功能必须尽量补单元测试。

## 核心依赖注入

`src/entries/background.ts` 负责装配依赖：

```ts
const translationService = new TranslationService(
  new BrowserSettingsRepository(ext),
  new BrowserTranslationCache(ext),
  new OpenAICompatibleChatClient(),
  new TabProgressSink(ext)
);
```

这样可以在不改 `TranslationService` 的情况下替换模型客户端、缓存后端或进度输出方式。

## 扩展模型协议

默认模型客户端是 `OpenAICompatibleChatClient`，兼容 Chat Completions。

接入其他协议时：

1. 实现 `src/core/chat-client.ts` 中的 `ChatClient` 接口。
2. 在 `src/entries/background.ts` 中替换注入。
3. 为请求构造和响应解析补单元测试。

## 新增内置划词工具

修改：

```text
src/core/defaults.ts
```

在 `DEFAULT_SELECTION_TOOLS` 中新增工具：

```ts
{
  id: "my_tool",
  name: "我的工具",
  enabled: true,
  modelMode: "inherit",
  baseUrl: "",
  apiKey: "",
  model: "",
  activeModel: "",
  models: "",
  systemPrompt: "You are a helpful assistant.",
  userPrompt: "请处理下面文本，使用{targetLanguage}：\n\n{text}"
}
```

工具支持的常用占位符：

```text
{text}
{sourceLanguage}
{targetLanguage}
{glossary}
{url}
```

## 页面翻译提示词

页面处理提示词用于全文翻译、自动翻译和虚拟滚动续翻译。用户提示词必须保留 JSON 返回要求：

```json
{"translations":["..."]}
```

如果删除这个约束，内容脚本无法可靠地逐段写回译文。

## 国际化

UI 文案：

```text
src/entries/i18n.ts
```

扩展清单名称和描述：

```text
_locales/{locale}/messages.json
```

新增语言后必须同步测试设置页、快捷设置和内容脚本浮层。

## 测试

当前测试入口：

```text
test/core.test.ts
```

已覆盖：

- 术语表解析。
- 提示词占位符渲染。
- 模型 JSON 输出解析。
- 目标语言跳过判断。
- 划词工具配置归一化。
- 翻译服务缓存、跳过和逐项进度路径。

新增核心逻辑时，应优先补对应单元测试。

`npm run validate` 会检查：

- 是否残留 `.tmp-tests`、`.DS_Store` 等临时文件。
- 活跃代码和文档中是否混入旧项目名。
- 产品页中英文文案 key 是否完整。
- 产品页下载用的 `.zip` 是否存在。

## 发布前检查

```bash
npm run check
npm run package:chrome
```

然后确认：

- `packages/vanslate-unpacked` 可通过 Chrome `Load unpacked` 安装。
- `packages/vanslate-1.1.0.zip` 通过压缩包校验。
- `website/downloads/vanslate-1.1.0.zip` 已同步。
- 隐私政策和支持页面内容准确。
