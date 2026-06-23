# 发布与商店材料

## 版本号

版本号来源：

- `package.json`
- `package-lock.json`
- `manifest.json`
- `manifest.firefox.json`

发布前必须保持一致。

## 检查与打包

```bash
cd vanslate
npm run check
npm run package:chrome
```

`package:chrome` 会：

1. 构建 TypeScript 入口。
2. 生成 `packages/vanslate-unpacked/`。
3. 生成 `packages/vanslate-{version}.zip`。
4. 生成 `packages/vanslate-{version}.crx`。
5. 同步 `.zip` 和 `.crx` 到 `website/downloads/`，产品页默认使用 `.zip` 作为本地测试包。
6. 复用 `packages/vanslate.pem` 或历史 `.pem`，保持扩展 ID 稳定。

Chrome 稳定版会阻止从普通网页直接安装自签或本地打包的 `.crx`，常见错误是 `CRX_REQUIRED_PROOF_MISSING`。公开分发应走 Chrome Web Store；本地测试应解压 `.zip` 后用 `Load unpacked`。

## 本地标签

远程仓库未创建前，可以先打本地 tag：

```bash
git tag -a v1.1.0 -m "Vanslate 1.1.0"
```

`v1.0.0` 的发布时间按 2026-05-11 记录。

## Chrome Web Store 材料

发布信息维护在：

- `CHROME_WEB_STORE_SUBMISSION.md`
- `CHROME_WEB_STORE_PRIVACY.md`
- `website/privacy/`
- `website/support/`
- `website/changelog/`
- `store-assets/`

发布前必须把隐私政策和支持页部署到真实 HTTPS 域名，并在开发者后台填写对应链接。

## 不应提交的内容

- 真实 API Key。
- 本地 `.pem` 私钥。
- 未发布的个人素材源文件。
- 临时测试目录、备份 HTML、系统元数据。
