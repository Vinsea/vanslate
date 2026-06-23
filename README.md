# 薇译 Vanslate

薇译 Vanslate 是一个 AI 上下文翻译与表达工具浏览器扩展。它不内置模型服务，用户在设置页填写自己的 OpenAI 兼容 `Base URL`、`API Key` 和模型名称后即可使用。

副标题：**薇译 Vanslate：不止翻译。**

## 功能

- 全文翻译：保留原网页内容，在原文旁边追加译文。
- 分段渲染：翻译好一个文本块就立即显示。
- 划词工具：内置翻译、小白解释、专业解释、总结、改写、技术化、口语化、学术化、代码注释化。
- 自定义工具：可自行配置工具名称、提示词、模型、API 地址和 API Key。
- 自动翻译规则：支持 URL 通配符和正则匹配。
- 术语表：支持 `原文 => 译文` 固定术语。
- 缓存与重试：本地缓存译文，并对网络错误和限流错误进行有限重试。
- 虚拟滚动：全文翻译后，新出现的内容会继续进入翻译队列。
- 多语言界面：支持中文、英文、日文、韩文、法文、德文、西班牙文等常见语言。
- Chrome MV3：附带 Firefox 临时调试 Manifest。

## 安装

**方式一：Chrome 网上应用店**

[在 Chrome 网上应用店安装](https://chromewebstore.google.com/detail/%E8%96%87%E8%AF%91-vanslate/nddflbhaipfeidcaoggfekalganeaepn)

**方式二：手动安装 ZIP**

前往 [https://tools.vinxea.com/vanslate/](https://tools.vinxea.com/vanslate/) 下载最新版 ZIP，解压后在 `chrome://extensions` 开启开发者模式，点击「加载已解压的扩展程序」选择解压目录即可。

## 使用

本地测试 Chrome：

```bash
cd vanslate
npm install
npm run package:chrome
```

然后打开 `chrome://extensions`，开启 `Developer mode`，点击 `Load unpacked`，选择：

```text
packages/vanslate-unpacked
```

首次使用：

1. 打开扩展设置页。
2. 填写 OpenAI 兼容接口的 `Base URL`、`API Key`、模型列表和默认模型。
3. 按需配置目标语言、术语表、自动翻译规则和划词工具。
4. 在网页右下角点击薇译悬浮按钮，或通过扩展弹窗/右键菜单执行全文翻译。

API 需要兼容：

```text
POST {Base URL}/chat/completions
Authorization: Bearer {API Key}
```

远程接口必须使用 HTTPS；本地开发可使用 `localhost`。

## 开发和二开

开发文档见 [CONTRIBUTE.md](./CONTRIBUTE.md)。  
详细设计文档见 [docs/README.md](./docs/README.md)。  
更新日志见 [changelog.md](./changelog.md)。  
English contribution guide: [CONTRIBUTE_en.md](./CONTRIBUTE_en.md)。

## 许可证

本项目基于 [MIT License](./LICENSE) 开源，允许商用、二开及分发，但须保留原始版权声明并注明来源（薇译 Vanslate / https://tools.vinxea.com/vanslate/）。
