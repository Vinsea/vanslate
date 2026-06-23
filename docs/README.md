# Vanslate 设计文档

本文档集面向准备二开、维护或审查 Vanslate 的开发者。阅读顺序建议如下：

1. [架构总览](./architecture.md)：模块边界、依赖注入和源码组织。
2. [扩展运行时](./extension-runtime.md)：background、content、options、popup 的职责。
3. [页面处理流水线](./translation-pipeline.md)：全文翻译、跳过、缓存、重试和进度事件。
4. [设置与存储](./settings-storage.md)：设置模型、缓存结构、隐私边界和迁移策略。
5. [划词工具系统](./selection-tools.md)：内置工具、自定义工具、提示词占位符和调试。
6. [发布与商店材料](./release-store.md)：版本、打包、标签、商店材料和隐私链接。

当前主版本：`1.1.0`。

