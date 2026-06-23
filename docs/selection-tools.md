# 划词工具系统

## 目标

划词工具不只服务“翻译”。它是一套用户可配置的文本处理工具系统，可以把选中文本交给大模型执行不同任务。

内置工具包括：

- 翻译
- 小白解释
- 专业解释
- 总结
- 改写
- 技术化
- 口语化
- 学术化
- 代码注释化

## 工具配置

每个工具包含：

- `id`：稳定标识。
- `name`：工具栏显示名称。
- `enabled`：是否启用。
- `systemPrompt`：系统提示词。
- `userPrompt`：用户提示词模板。
- `modelMode`：`inherit` 或 `custom`。
- `baseUrl`、`apiKey`、`models`、`activeModel`：单工具模型覆盖。

如果工具不设置模型信息，则继承通用模型设置。

## 占位符

用户提示词支持：

- `{text}`：当前选中文本。
- `{sourceLanguage}`：源语言值。
- `{targetLanguage}`：目标语言值。
- `{glossary}`：术语表文本。
- `{url}`：当前网页 URL。

未知占位符会原样保留，方便用户在调试区定位错误。

## UI 行为

选中文本后默认只显示紧凑小图标；鼠标悬浮后展开工具列表。点击工具后显示 loading 状态，结果区域支持 Markdown 渲染和复制。

点击页面空白处、选区消失或按 Escape 时应关闭工具栏和结果浮层。

## 调试

设置页工具卡片提供调试区：

- 展示最终 system/user messages。
- 展示模型输出。
- 如果接口返回 reasoning，则展示 reasoning。
- 如果接口返回 usage，则展示 token 用量。

调试区使用真实模型配置，开发者需要避免在截图或 issue 中泄露 API Key。

