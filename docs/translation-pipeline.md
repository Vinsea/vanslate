# 页面处理流水线

## 全文翻译流程

```text
用户触发全文翻译
  -> content 扫描可见文本节点
  -> 给待翻译元素追加 loading
  -> background 调用 TranslationService.translateTexts
  -> 逐项跳过/读缓存/调用模型/写缓存
  -> ProgressSink 推送 item-result
  -> content 立即渲染单项结果
  -> ProgressSink 推送整体进度和 token usage
```

## 文本收集

content 侧会跳过：

- `script`、`style`、`noscript`、`code`、`pre`。
- 输入框、文本域、选择框和可编辑区域。
- 已经处理过或正在处理的节点。
- 极短文本、纯符号文本和明显不可读文本。

导航、目录和右侧栏不应被默认排除；只要是用户可见的文本，就应尽量进入处理队列。

## 目标语言跳过

`shouldSkipTranslation` 会判断文本是否已经主要是目标语言。如果文本中目标语言和源语言混杂，策略是：

- 完全目标语言：跳过，避免重复生成。
- 混合文本：保留原文，让模型只处理需要转换的部分。
- 术语、品牌、代码标识符：尽量由术语表和提示词约束，不在本地硬替换。

## 缓存键

缓存 key 必须覆盖会影响输出的维度：

- API URL
- 模型
- 源语言
- 目标语言
- 术语表
- 页面系统提示词
- 页面用户提示词
- 源文本

任何影响模型输出的配置变化，都应导致缓存 key 变化。

## 失败重试

模型调用失败时，`OpenAICompatibleChatClient` 对网络错误、429 和 5xx 做有限重试。重试应保持次数有限，并把最终错误回传给页面，避免页面一直显示 loading。

## 进度与 usage

进度包括：

- 总数、完成数、跳过数、失败数。
- 当前处理状态。
- 如果模型返回 usage，则累计 prompt/completion/total token。

页面默认显示 total token，悬浮后展示细分 usage。

