import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");

test("Vanslate content workflow", async ({ page }) => {
  await page.setContent(await fixtureHtml());
  await page.addScriptTag({ content: runtimeFixtureScript() });
  await page.addStyleTag({ path: path.join(projectRoot, "content.css") });
  await page.addScriptTag({ path: path.join(projectRoot, "content.js") });
  await page.waitForFunction("typeof window.vanslateSendToContent === 'function'");
  await page.waitForTimeout(300);

  await selectElementText(page, "#title");
  const toolbar = page.locator("#vanslate-toolbar");
  await expect(toolbar).toBeVisible();
  const firstBox = await toolbar.boundingBox();

  await page.mouse.click(8, 8);
  await expect(toolbar).toBeHidden();

  await selectElementText(page, "#comment-text");
  await expect(toolbar).toBeVisible();
  const secondBox = await toolbar.boundingBox();
  expect(secondBox?.x !== firstBox?.x || secondBox?.y !== firstBox?.y).toBeTruthy();

  await page.locator(".vanslate-toolbar-trigger").click();
  await page.locator(".vanslate-tool-button").click();
  await expect(page.locator("#vanslate-selection-panel")).toContainText("处理结果");

  const response = await page.evaluate(() => (window as any).vanslateSendToContent({ type: "TRANSLATE_PAGE", options: {} }));
  expect(response?.ok).toBeTruthy();
  await expect(page.locator("#title")).toContainText("快速上下文很重要");
  await expect(page.locator("#nav-link")).toContainText("业务、企业与教育");
  await expect(page.locator("#copy .vanslate-result strong")).toContainText("试试 Slimjet");
  await expect(page.locator("#risk .vanslate-result span")).toHaveCSS("color", "rgb(255, 0, 0)");
  await expect(page.locator("#comment-label")).toContainText("评论字段");
  await expect(page.locator("#comment-question")).toContainText("表单验证问题");
  await expect(page.locator("#comment-text")).toContainText("评论正文已翻译");
  await expect(page.locator("#comment-author")).not.toContainText("已翻译");
  await expect(page.locator("#special-text")).toContainText("自定义采集规则已生效");

  await page.evaluate(() => {
    const virtual = document.createElement("p");
    virtual.id = "virtual";
    virtual.textContent = "Virtual scroll content arrives later.";
    document.querySelector("article")?.appendChild(virtual);
  });
  await expect(page.locator("#virtual")).toContainText("虚拟滚动内容已翻译", { timeout: 3000 });

  await page.evaluate(() => {
    const retry = document.createElement("p");
    retry.id = "retry";
    retry.textContent = "Retry me once.";
    document.querySelector("article")?.appendChild(retry);
  });
  const retryResponse = await page.evaluate(() => (window as any).vanslateSendToContent({ type: "TRANSLATE_PAGE", options: {} }));
  expect(retryResponse?.ok).toBeTruthy();
  await expect(page.locator("#retry .vanslate-error-retry")).toBeVisible();
  await expect(page.locator("#retry")).not.toContainText("Synthetic model failure");
  await page.locator("#retry .vanslate-error-retry").dispatchEvent("click");
  await expect(page.locator("#retry")).toContainText("重试后翻译成功", { timeout: 3000 });
});

test("Quick settings popup keeps scroll inside the tools list", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 560 });
  await page.setContent(await popupFixtureHtml());
  await page.addStyleTag({ path: path.join(projectRoot, "styles.css") });
  await page.addStyleTag({
    content: "*{scrollbar-width:auto!important}::-webkit-scrollbar{width:17px!important;height:17px!important}"
  });
  await page.evaluate(() => {
    const tools = ["翻译", "小白解释", "专业解释", "总结", "改写", "技术化", "口语化", "学术化", "代码注释化"];
    const list = document.querySelector("#quickToolsList");
    if (!list) throw new Error("Missing quick tools list");
    list.textContent = "";
    tools.forEach((name) => {
      const row = document.createElement("div");
      row.className = "quickToolRow";
      const label = document.createElement("label");
      label.className = "quickToolToggle";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = true;
      const span = document.createElement("span");
      span.textContent = name;
      label.append(input, span);
      const select = document.createElement("select");
      select.className = "quickToolModel";
      ["继承通用模型", "gpt-4o-mini", "deepseek-chat"].forEach((text) => {
        const option = document.createElement("option");
        option.textContent = text;
        select.appendChild(option);
      });
      row.append(label, select);
      list.appendChild(row);
    });
  });

  const metrics = await page.evaluate(() => {
    const main = document.querySelector("main");
    const list = document.querySelector("#quickToolsList");
    if (!main || !list) throw new Error("Missing popup layout nodes");
    return {
      body: {
        overflowX: getComputedStyle(document.body).overflowX,
        overflowY: getComputedStyle(document.body).overflowY,
        clientWidth: document.body.clientWidth,
        scrollWidth: document.body.scrollWidth,
        clientHeight: document.body.clientHeight,
        scrollHeight: document.body.scrollHeight
      },
      main: {
        clientWidth: main.clientWidth,
        scrollWidth: main.scrollWidth,
        clientHeight: main.clientHeight,
        scrollHeight: main.scrollHeight
      },
      list: {
        overflowX: getComputedStyle(list).overflowX,
        overflowY: getComputedStyle(list).overflowY,
        clientWidth: list.clientWidth,
        scrollWidth: list.scrollWidth,
        clientHeight: list.clientHeight,
        scrollHeight: list.scrollHeight
      }
    };
  });

  expect(metrics.body.overflowX).toBe("hidden");
  expect(metrics.body.overflowY).toBe("hidden");
  expect(metrics.body.scrollWidth).toBeLessThanOrEqual(metrics.body.clientWidth);
  expect(metrics.body.scrollHeight).toBeLessThanOrEqual(metrics.body.clientHeight);
  expect(metrics.main.scrollWidth).toBeLessThanOrEqual(metrics.main.clientWidth);
  expect(metrics.main.scrollHeight).toBeLessThanOrEqual(metrics.main.clientHeight);
  expect(metrics.list.overflowY).toBe("auto");
  expect(metrics.list.scrollWidth).toBeLessThanOrEqual(metrics.list.clientWidth);
  expect(metrics.list.scrollHeight).toBeGreaterThan(metrics.list.clientHeight);
});

async function selectElementText(page: Page, selector: string) {
  await page.evaluate((targetSelector) => {
    const element = document.querySelector(targetSelector);
    if (!element) throw new Error(`Missing element: ${targetSelector}`);
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange", { bubbles: true }));
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 120, clientY: 120 }));
  }, selector);
  await page.waitForTimeout(160);
  await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Shift" }));
  });
}

function runtimeFixtureScript() {
  return `
    (() => {
      if (typeof window.vanslateSendToContent === "function") return;
      const runtimeListeners = [];
      const failCounts = {};
      const dataImage = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' rx='8' fill='%23111827'/%3E%3Ctext x='16' y='22' text-anchor='middle' font-size='18' fill='white' font-family='Arial'%3EV%3C/text%3E%3C/svg%3E";
      const settings = {
        sourceLanguage: "auto",
        targetLanguage: "中文",
        baseUrl: "https://api.example.com/v1",
        apiKey: "test",
        model: "test-model",
        activeModel: "test-model",
        preserveOriginal: true,
        renderMode: "inline",
        translationColorEnabled: false,
        translationColor: "",
        translationCss: "",
        enableFloatingBall: true,
        floatingBallMode: "always",
        floatingBallPosition: { side: "right", top: 0.42 },
        collectionRules: {
          blockTags: ["H1", "H2", "H3", "H4", "H5", "H6", "P", "LI", "BLOCKQUOTE", "FIGCAPTION", "TD", "TH", "DT", "DD"],
          formTags: ["LABEL", "LEGEND", "CAPTION", "SUMMARY"],
          supplementalTags: ["DIV", "SPAN"],
          supplementalContextPattern: "comment|comments|cmtx|review|feedback|discussion|reply|special-zone",
          metadataPattern: "avatar|gravatar|author|user(name)?|date|time|timestamp|count|rating|stars|captcha|honeypot|pagination|page_number"
        },
        selectionTools: [{ id: "translate", name: "翻译", enabled: true }]
      };
      function translateText(text) {
        if (text.includes("Fast context")) return "快速上下文很重要";
        if (text.includes("Business")) return "业务、企业与教育";
        if (text.includes("Vanslate keeps")) return "薇译保持原网页可读，同时添加有用的 AI 输出。<strong>试试 Slimjet，你一定不会后悔！</strong>";
        if (text.includes("becoming vulnerable")) return "如果仍要坚持使用，请注意<span style=\\"color:red\\">存在安全风险</span>，并仔细检查归档版本。";
        if (text.includes("Selection tools")) return "划词工具应保持紧凑可靠。";
        if (text.includes("Comment:")) return "评论字段";
        if (text.includes("Enter the third word")) return "表单验证问题。";
        if (text.includes("All versions from Chrome")) return "评论正文已翻译。";
        if (text.includes("Special product feedback")) return "自定义采集规则已生效。";
        if (text.includes("Virtual scroll")) return "虚拟滚动内容已翻译。";
        if (text.includes("Retry me once")) return "重试后翻译成功。";
        return text + " 已翻译";
      }
      window.vanslateSendToContent = async function(message) {
        for (const listener of runtimeListeners) {
          const result = await new Promise((resolve) => {
            let resolved = false;
            const keepAlive = listener(message, {}, (response) => {
              resolved = true;
              resolve(response);
            });
            if (!keepAlive && !resolved) resolve(undefined);
          });
          if (result !== undefined) return result;
        }
        return undefined;
      };
      window.chrome = {
        runtime: {
          id: "vanslate-e2e",
          getURL: () => dataImage,
          onMessage: { addListener: (listener) => runtimeListeners.push(listener) },
          sendMessage: async (message) => {
            if (message?.type === "GET_SETTINGS") return { ok: true, settings };
            if (message?.type === "TRANSLATE_TEXTS") {
              for (const item of message.texts || []) {
                if (item.text.includes("Retry me once") && !failCounts[item.text]) {
                  failCounts[item.text] = 1;
                  await window.vanslateSendToContent({
                    type: "TRANSLATION_ITEM_RESULT",
                    progressId: message.progressId,
                    mode: message.mode,
                    item: { id: item.id, error: "Synthetic model failure", usage: { prompt_tokens: 1, completion_tokens: 0, total_tokens: 1 } }
                  });
                  continue;
                }
                await window.vanslateSendToContent({
                  type: "TRANSLATION_ITEM_RESULT",
                  progressId: message.progressId,
                  mode: message.mode,
                  item: { id: item.id, translation: translateText(item.text), usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }
                });
              }
              await window.vanslateSendToContent({
                type: "TRANSLATION_PROGRESS",
                progressId: message.progressId,
                mode: message.mode,
                progress: { done: (message.texts || []).length, total: (message.texts || []).length, cachedCount: 0, skippedCount: 0, stage: "done" }
              });
              return { ok: true, translatedCount: (message.texts || []).length, cachedCount: 0 };
            }
            if (message?.type === "RUN_SELECTION_TOOL") {
              return { ok: true, result: { toolId: message.toolId, toolName: "翻译", text: "**处理结果**\\\\n\\\\n" + message.text, usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } } };
            }
            return { ok: true };
          }
        },
        storage: {
          local: { set: async () => undefined, get: async () => ({}) },
          onChanged: { addListener: () => undefined }
        }
      };
    })();
  `;
}

async function fixtureHtml() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Vanslate E2E</title>
  <style>
    body { font: 16px/1.55 Arial, sans-serif; margin: 48px; color: #111827; }
    main { max-width: 760px; }
    nav { position: fixed; right: 48px; top: 48px; width: 240px; }
    .card { border: 1px solid #d1d5db; border-radius: 12px; padding: 16px; margin-top: 24px; }
  </style>
</head>
<body>
  <main>
    <article>
      <h1 id="title">Fast context matters</h1>
      <p id="copy">Vanslate keeps the original page readable while adding useful AI output. <strong>Give Slimjet a try now and you will never look back!</strong></p>
      <p id="risk">For users who insist on <span style="color:red">becoming vulnerable to security issues</span>, check the archive carefully.</p>
      <section class="card"><p>Selection tools should stay compact and reliable.</p></section>
      <section class="card cmtx_container">
        <form class="cmtx_form">
          <label id="comment-label" class="cmtx_label">Comment:<span class="cmtx_required_symbol"> *</span></label>
          <textarea name="cmtx_comment"></textarea>
          <span id="comment-question" class="cmtx_question_part_question_text">Enter the third word of this sentence.</span>
        </form>
        <div class="cmtx_comment_box_1">
          <span id="comment-author" class="cmtx_name_without_website_text">Alexander Ewering</span>
          <div id="comment-text" class="cmtx_comment_text">All versions from Chrome 69 onwards are wrong. How could you not see that?</div>
        </div>
        <div id="special-text" class="special-zone">Special product feedback appears here.</div>
      </section>
    </article>
  </main>
  <nav aria-label="Table of contents">
    <a href="#title" id="nav-link">Business, Enterprise, and Edu</a>
  </nav>
  <script>
    const vanslateRuntimeListeners = [];
    const vanslateFailCounts = {};
    const dataImage = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' rx='8' fill='%23111827'/%3E%3Ctext x='16' y='22' text-anchor='middle' font-size='18' fill='white' font-family='Arial'%3EV%3C/text%3E%3C/svg%3E";
    const settings = {
      sourceLanguage: "auto",
      targetLanguage: "中文",
      baseUrl: "https://api.example.com/v1",
      apiKey: "test",
      model: "test-model",
      activeModel: "test-model",
      preserveOriginal: true,
      renderMode: "inline",
      translationColorEnabled: false,
      translationColor: "",
      translationCss: "",
      enableFloatingBall: true,
      floatingBallMode: "always",
      floatingBallPosition: { side: "right", top: 0.42 },
      collectionRules: {
        blockTags: ["H1", "H2", "H3", "H4", "H5", "H6", "P", "LI", "BLOCKQUOTE", "FIGCAPTION", "TD", "TH", "DT", "DD"],
        formTags: ["LABEL", "LEGEND", "CAPTION", "SUMMARY"],
        supplementalTags: ["DIV", "SPAN"],
        supplementalContextPattern: "comment|comments|cmtx|review|feedback|discussion|reply|special-zone",
        metadataPattern: "avatar|gravatar|author|user(name)?|date|time|timestamp|count|rating|stars|captcha|honeypot|pagination|page_number"
      },
      selectionTools: [{ id: "translate", name: "翻译", enabled: true }]
    };
    function translateText(text) {
      if (text.includes("Fast context")) return "快速上下文很重要";
      if (text.includes("Business")) return "业务、企业与教育";
      if (text.includes("Vanslate keeps")) return "薇译保持原网页可读，同时添加有用的 AI 输出。<strong>试试 Slimjet，你一定不会后悔！</strong>";
      if (text.includes("becoming vulnerable")) return "如果仍要坚持使用，请注意<span style=\"color:red\">存在安全风险</span>，并仔细检查归档版本。";
      if (text.includes("Selection tools")) return "划词工具应保持紧凑可靠。";
      if (text.includes("Comment:")) return "评论字段";
      if (text.includes("Enter the third word")) return "表单验证问题。";
      if (text.includes("All versions from Chrome")) return "评论正文已翻译。";
      if (text.includes("Special product feedback")) return "自定义采集规则已生效。";
      if (text.includes("Virtual scroll")) return "虚拟滚动内容已翻译。";
      if (text.includes("Retry me once")) return "重试后翻译成功。";
      return text + " 已翻译";
    }
    window.vanslateSendToContent = async function(message) {
      for (const listener of vanslateRuntimeListeners) {
        const result = await new Promise((resolve) => {
          let resolved = false;
          const keepAlive = listener(message, {}, (response) => {
            resolved = true;
            resolve(response);
          });
          if (!keepAlive && !resolved) resolve(undefined);
        });
        if (result !== undefined) return result;
      }
      return undefined;
    };
    window.chrome = {
      runtime: {
        id: "vanslate-e2e",
        getURL: () => dataImage,
        onMessage: { addListener: (listener) => vanslateRuntimeListeners.push(listener) },
        sendMessage: async (message) => {
          if (message?.type === "GET_SETTINGS") return { ok: true, settings };
          if (message?.type === "TRANSLATE_TEXTS") {
            for (const item of message.texts || []) {
              if (item.text.includes("Retry me once") && !vanslateFailCounts[item.text]) {
                vanslateFailCounts[item.text] = 1;
                await window.vanslateSendToContent({
                  type: "TRANSLATION_ITEM_RESULT",
                  progressId: message.progressId,
                  mode: message.mode,
                  item: { id: item.id, error: "Synthetic model failure", usage: { prompt_tokens: 1, completion_tokens: 0, total_tokens: 1 } }
                });
                continue;
              }
              await window.vanslateSendToContent({
                type: "TRANSLATION_ITEM_RESULT",
                progressId: message.progressId,
                mode: message.mode,
                item: { id: item.id, translation: translateText(item.text), usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }
              });
            }
            await window.vanslateSendToContent({
              type: "TRANSLATION_PROGRESS",
              progressId: message.progressId,
              mode: message.mode,
              progress: { done: (message.texts || []).length, total: (message.texts || []).length, cachedCount: 0, skippedCount: 0, stage: "done" }
            });
            return { ok: true, translatedCount: (message.texts || []).length, cachedCount: 0 };
          }
          if (message?.type === "RUN_SELECTION_TOOL") {
            return { ok: true, result: { toolId: message.toolId, toolName: "翻译", text: "**处理结果**\\\\n\\\\n" + message.text, usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } } };
          }
          return { ok: true };
        }
      },
      storage: {
        local: { set: async () => undefined, get: async () => ({}) },
        onChanged: { addListener: () => undefined }
      }
    };
  </script>
</body>
</html>`;
}

async function popupFixtureHtml() {
  const html = await readFile(path.join(projectRoot, "popup.html"), "utf8");
  return html
    .replace(/<link[^>]+styles\.css[^>]*>/, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
}
