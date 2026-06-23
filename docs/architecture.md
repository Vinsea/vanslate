# 架构总览

Vanslate 是一个 Chrome Manifest V3 浏览器扩展。设计目标不是把逻辑写在页面脚本里，而是把可测试核心、浏览器适配层和 UI 入口明确拆开。

## 源码结构

```text
vanslate/
  src/
    core/       # 不直接依赖 DOM/chrome API 的核心逻辑
    entries/    # 扩展入口：background/content/options/popup/i18n
  test/         # Node 单元测试
  scripts/      # 构建、校验、打包和商店素材脚本
  website/      # 产品页、隐私政策、支持页、更新日志
  docs/         # 二开设计文档
```

## 分层原则

- `core` 只处理业务规则：设置归一化、提示词渲染、模型调用封装、缓存键、跳过逻辑和结果解析。
- `entries` 只处理浏览器运行时：消息路由、DOM 收集和渲染、选区 UI、设置页、弹窗页。
- 浏览器 API 通过 adapter 注入核心服务，核心类不直接访问 `chrome`、`browser`、`document` 或 `window`。
- 新模型协议、新缓存后端、新工具类型应优先通过接口扩展，而不是修改已有流程。

## 核心依赖注入

`background.ts` 是运行时装配层：

```ts
const translationService = new TranslationService(
  new BrowserSettingsRepository(ext),
  new BrowserTranslationCache(ext),
  new OpenAICompatibleChatClient(),
  new TabProgressSink(ext)
);
```

这使 `TranslationService` 可以在单元测试中用 fake repository、fake cache 和 fake client 运行，也能在后续接入其他模型协议时保持调用方稳定。

## 主要接口

- `SettingsRepository`：读取和保存扩展设置。
- `TranslationCache`：读取和写入本地译文缓存。
- `ChatClient`：调用大模型并返回内容、usage 和 reasoning。
- `ProgressSink`：向页面发送逐项结果、整体进度、token usage 和错误状态。

## 扩展点

- 新模型协议：实现 `ChatClient`。
- 新缓存策略：实现 `TranslationCache`。
- 新页面渲染模式：扩展 content 侧渲染器，不修改 `TranslationService`。
- 新划词工具：添加默认工具定义或让用户在设置页配置。
- 新语言：补充 `src/core/i18n.ts`、`_locales/` 和页面文案。

