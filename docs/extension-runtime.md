# 扩展运行时

## background

`src/entries/background.ts` 负责：

- 初始化右键菜单。
- 处理 popup、content、options 发来的 `runtime.sendMessage`。
- 注入内容脚本。
- 调用 `TranslationService`。
- 将进度和结果发送回指定 tab。

background 不直接操作 DOM，也不保存页面状态。页面状态由 content script 管理。

## content

`src/entries/content.ts` 负责：

- 扫描可翻译 DOM 文本节点。
- 识别块级元素、内联元素、导航区域、虚拟滚动新增节点。
- 给待处理元素追加 loading 状态。
- 按设置选择追加式渲染或复制块级元素渲染。
- 管理右下角悬浮工具和选中文本工具栏。
- 接收 background 的逐项结果并立即渲染。

content script 需要保持页面可用性，因此 DOM 扫描和渲染要分批执行。长列表和虚拟滚动页面通过 `MutationObserver` 捕捉新增节点，翻译过的节点通过标记避免重复处理。

## options

`src/entries/options.ts` 是完整设置页，负责：

- 通用模型、语言、渲染样式、缓存、自动规则、术语表。
- 页面处理系统提示词和用户提示词。
- 划词工具的可视化配置和 JSON 源码弹窗。
- 每个工具的模型继承/覆盖、多模型配置和提示词调试。
- UI 语言切换。

设置页应当把风险信息直接展示在对应字段附近，例如 API Key 只保存在本地、页面提示词会影响全文翻译、用户提示词支持哪些占位符。

## popup

`src/entries/popup.ts` 是快捷设置页，负责：

- 当前页面全文翻译。
- 清除缓存。
- 快速切换通用模型、源语言、目标语言。
- 切换工具启用状态和单工具活动模型。
- 跳转设置页。

popup 不承载复杂配置，复杂配置都回到 options。

## i18n

扩展 UI 文案由 `src/core/i18n.ts` 提供，Manifest 标题和描述由 `_locales/` 提供。新增文案需要同步常见语言，至少保证中文和英文完整。

