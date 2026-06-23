# Chrome Web Store 发布填写稿

本文档用于 Chrome Web Store 开发者后台填写。内容按当前 `manifest.json`、产品功能和隐私设计整理。

当前版本：`1.1.0`。

## 商店信息

### 中文名称

薇译 Vanslate

### 英文名称

Vanslate

### 副标题

薇译 Vanslate：不止翻译。  
Vanslate - AI Context Translator & Verbalizer.

### 一句话简介

使用自己的大模型接口，在网页中完成全文翻译、划词解释、总结改写、术语表和缓存。

### 详细描述

薇译 Vanslate 是一个 AI 上下文翻译与表达工具。用户可以在设置页填写自己的 OpenAI 兼容 API 地址、API Key 和模型名称，然后在任意网页中进行全文翻译、划词处理、解释、总结、改写和术语一致性处理。

主要能力：

- 全文翻译：在不覆盖原网页内容的前提下，把译文显示在原文旁边或下方。
- 逐段渲染：翻译完成一个文本块就立即显示，减少长页面等待。
- 划词工具：内置翻译、小白解释、专业解释、总结、改写、技术化、口语化、学术化、代码注释化。
- 自定义提示词：页面处理提示词和划词工具提示词都可自行编辑。
- 多模型配置：支持通用模型设置，也支持每个工具单独配置模型。
- 术语表：支持固定专有名词、产品名和技术术语。
- 自动翻译规则：支持 URL 通配符和正则规则。
- 本地缓存与失败重试：缓存已翻译内容，网络或限流错误会按配置重试。
- 虚拟滚动支持：全文翻译后，新出现的内容会继续进入翻译队列。

薇译不提供内置模型服务，不运营中转服务器。网页文本只会在用户主动触发翻译、划词工具、右键菜单，或用户配置的自动翻译规则命中时，发送到用户自行配置的模型 API 服务商。

## 单一用途说明

薇译 Vanslate 的单一用途是：在用户主动触发或用户配置的自动规则命中时，使用用户自行配置的 OpenAI 兼容大模型 API，对当前网页中的可见文本、文章导航文本、虚拟滚动中新出现的文本或用户选中的文本进行 AI 上下文翻译与表达处理，并在原网页上下文中展示结果。

全文翻译、划词解释、总结、改写、术语表、本地缓存、失败重试、自动翻译规则、悬浮工具和快捷设置都服务于这一单一用途：帮助用户在当前网页上下文中理解、翻译和改写文本。

## 远程代码使用说明

薇译 Vanslate 不加载、执行或注入远程 JavaScript、远程 WASM 或其他远程可执行代码。扩展的 JavaScript、CSS、HTML、图标和本地资源均打包在扩展包内。

扩展会向用户在设置页自行填写的 OpenAI 兼容 API 地址发送 HTTPS 请求，用于获取翻译、解释、总结或改写结果。该远程响应只作为文本或 JSON 数据解析和展示，不会作为代码执行，不会通过 `eval`、动态脚本标签、远程 WASM 或解释器机制运行。

## 权限说明

### `host_permissions`: `<all_urls>`

用途：允许用户在任意网页上使用全文翻译、划词工具、右键翻译、悬浮按钮和自动翻译规则。

原因：网页翻译必须读取当前网页的可见文本，并把译文或 AI 处理结果插入到原文附近。不同用户会在不同网站上使用该功能，因此需要覆盖用户访问的网页。

边界：扩展不会后台抓取用户浏览历史，不会在未触发功能时上传网页内容。只有用户点击翻译、使用划词工具、右键菜单，或用户配置的自动翻译规则匹配当前 URL 时才会处理当前页面文本。

### `activeTab`

用途：在用户点击扩展按钮或执行当前标签页操作时，临时访问当前活动标签页。

原因：用于向当前页面发送全文翻译、清除译文等命令，并确保操作限定在用户正在交互的标签页。

### `contextMenus`

用途：在浏览器右键菜单中提供“薇译：翻译全文”入口。

原因：让用户可以在当前网页中通过右键菜单主动触发全文翻译。

### `scripting`

用途：在用户主动触发时，向当前标签页注入扩展自带的内容脚本和样式。

原因：内容脚本负责识别可见文本块、显示加载状态、插入译文、处理划词工具、显示悬浮按钮，并支持虚拟滚动中新出现的内容。

边界：注入的脚本和样式均来自扩展包内部，不从远程服务器加载。

### `storage`

用途：在浏览器本地保存用户配置和缓存。

保存内容包括：

- API 地址、API Key、模型列表和当前模型。
- 源语言、目标语言、渲染方式、译文 CSS 和悬浮工具显示方式。
- 自动翻译规则、术语表、失败重试次数。
- 本地翻译缓存和划词工具配置。

边界：这些数据保存在浏览器扩展本地存储中。扩展不把这些设置上传给扩展作者控制的服务器。API Key 只会在向用户自行配置的模型 API 发起请求时作为认证信息使用。

## 用户数据说明

### 是否处理用户数据

是。扩展会处理当前网页可见文本、用户选中文本、用户填写的模型配置、术语表、自动翻译规则和本地翻译缓存。

### 数据用途

仅用于提供网页翻译、划词 AI 工具、术语一致性、本地缓存、自动翻译规则和相关设置功能。

### 数据共享

扩展不会向扩展作者控制的服务器上传用户数据。用户触发翻译或 AI 工具时，待处理文本、源语言、目标语言、术语表和模型参数会发送到用户自行配置的 OpenAI 兼容 API 服务商。该服务商可能是 OpenAI、用户自建服务或其他第三方供应商。

### 不进行的行为

- 不出售用户数据。
- 不投放广告。
- 不收集遥测。
- 不进行与功能无关的用户画像分析。
- 不后台抓取浏览历史。
- 不把远程模型返回内容作为代码执行。

## 隐私政策链接填写

开发者后台隐私政策 URL：

```text
https://你的域名/privacy
```

支持页面 URL：

```text
https://你的域名/support
```

更新日志 URL：

```text
https://你的域名/changelog
```

发布前需要把 `你的域名` 替换成实际 HTTPS 域名，并确保页面内容与扩展实际行为一致。

## 数据使用情况确认

可在开发者后台确认：

薇译 Vanslate 的数据使用情况符合 Chrome Web Store 开发者计划政策和用户数据政策。扩展只在提供其单一用途所需范围内处理用户数据，并通过 HTTPS 把必要文本发送到用户自行配置的模型 API 服务商。

## 素材清单

产品页下载说明：

- Chrome Web Store 正式发布应上传 `packages/vanslate-1.1.0.zip`。
- 普通网页不应引导用户直接安装自签 `.crx`，Chrome 稳定版会报 `CRX_REQUIRED_PROOF_MISSING`。
- 产品页提供 `website/downloads/vanslate-1.1.0.zip` 作为离线安装包，用户需要解压后通过 `chrome://extensions` 的 `Load unpacked` 安装。

截图和宣传图位于：

```text
store-assets/screenshots/
store-assets/promotional/
```

当前生成的素材：

- `store-assets/screenshots/02-selection-tools-1280x800.jpg`
- `store-assets/screenshots/03-settings-models-1280x800.jpg`
- `store-assets/screenshots/04-rules-cache-glossary-1280x800.jpg`
- `store-assets/screenshots/zh-CN-screenshot-1280x800.jpg`
- `store-assets/screenshots/global-screenshot-1280x800.jpg`
- `store-assets/screenshots/zh-CN-feature-page-translation-1280x800.jpg`
- `store-assets/screenshots/zh-CN-feature-selection-tools-1280x800.jpg`
- `store-assets/screenshots/zh-CN-feature-settings-workflow-1280x800.jpg`
- `store-assets/screenshots/global-feature-page-translation-1280x800.jpg`
- `store-assets/screenshots/global-feature-selection-tools-1280x800.jpg`
- `store-assets/screenshots/global-feature-settings-workflow-1280x800.jpg`
- `store-assets/promotional/small-tile-440x280.jpg`
- `store-assets/promotional/marquee-tile-1400x560.jpg`

Chrome Web Store 截图最多上传 5 张。当前目录提供多套候选图，发布时按目标市场选择不超过 5 张。
