declare const chrome: any;
declare const VanslateI18n: any;

import { normalizeSelectionTools } from "../core/utils";
import { readStorageValues, writeStorageValues } from "../core/storage-keys";

const ext = (globalThis as any).browser || chrome;

const statusNode = document.querySelector("#status");
const translateBtn = document.querySelector("#translateBtn");
const clearBtn = document.querySelector("#clearBtn");
const optionsBtn = document.querySelector("#optionsBtn");
const quickModel = document.querySelector("#quickModel");
const quickSourceLanguage = document.querySelector("#quickSourceLanguage");
const quickTargetLanguage = document.querySelector("#quickTargetLanguage");
const swapLanguagesBtn = document.querySelector("#swapLanguagesBtn");
const quickToolsList = document.querySelector("#quickToolsList");
let currentSelectionTools = [];
let currentGlobalModels = [];
let currentUiLanguage = "zh-CN";

init();

async function init() {
  const response = await ext.runtime.sendMessage({ type: "GET_SETTINGS" });
  if (!response?.ok) {
    setStatus(response?.error || t("configReadFailed"), true);
    return;
  }

  const settings = response.settings;
  currentUiLanguage = VanslateI18n.normalizeLanguage(settings.uiLanguage || currentUiLanguage);
  applyI18n();
  renderModelOptions(settings);
  const raw = await readStorageValues(ext.storage.local, ["selectionTools"]);
  const storedTools = Array.isArray(raw.selectionTools) && raw.selectionTools.length ? raw.selectionTools : null;
  currentSelectionTools = normalizeTools(normalizeSelectionTools(storedTools || settings.selectionTools));
  renderQuickTools(settings);
  ensureSelectOption(quickSourceLanguage, settings.sourceLanguage || "auto");
  ensureSelectOption(quickTargetLanguage, settings.targetLanguage || "");
  quickSourceLanguage.value = settings.sourceLanguage || "auto";
  quickTargetLanguage.value = settings.targetLanguage || "";
}

swapLanguagesBtn.addEventListener("click", async () => {
  const source = quickSourceLanguage.value.trim();
  const target = quickTargetLanguage.value.trim();
  quickSourceLanguage.value = target || "auto";
  quickTargetLanguage.value = source && source.toLowerCase() !== "auto" ? source : "";
  await saveQuickSettings();
});

translateBtn.addEventListener("click", async () => {
  await runTabAction(t("translating"), async (tab) => {
    await saveQuickSettings();
    const response = await ext.tabs.sendMessage(tab.id, {
      type: "TRANSLATE_PAGE",
      options: {}
    });
    if (!response?.ok) throw new Error(response?.error || t("translateFailed"));
    return t("translateQueued", { count: response.queuedCount || response.translatedCount || 0 });
  });
});

clearBtn.addEventListener("click", async () => {
  await runTabAction(t("clearing"), async (tab) => {
    const response = await ext.tabs.sendMessage(tab.id, { type: "CLEAR_TRANSLATIONS" });
    if (!response?.ok) throw new Error(response?.error || t("clearFailed"));
    return t("currentPageCleared");
  });
});

optionsBtn.addEventListener("click", () => {
  ext.runtime.openOptionsPage();
});

async function saveQuickSettings() {
  syncQuickToolsFromUi();
  const settings = {
    model: quickModel.value.trim(),
    activeModel: quickModel.value.trim(),
    sourceLanguage: quickSourceLanguage.value.trim() || "auto",
    targetLanguage: quickTargetLanguage.value.trim(),
    selectionTools: currentSelectionTools
  };
  if (!settings.model || !settings.targetLanguage) {
    throw new Error(t("modelAndTargetRequired"));
  }
  await writeStorageValues(ext.storage.local, settings);
}

async function runTabAction(loadingText, action) {
  setStatus(loadingText);
  setBusy(true);
  try {
    const tab = await getActiveTab();
    await ensureContentScript(tab.id);
    const message = await action(tab);
    setStatus(message);
  } catch (error) {
    setStatus(readableError(error), true);
  } finally {
    setBusy(false);
  }
}

async function getActiveTab() {
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("找不到当前标签页。");
  return tab;
}

async function ensureContentScript(tabId) {
  try {
    await ext.tabs.sendMessage(tabId, { type: "PING" });
  } catch {
    if (!ext.scripting) {
      throw new Error("当前页面未注入内容脚本，请刷新页面后重试。");
    }
    await ext.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
    await ext.scripting.insertCSS({
      target: { tabId },
      files: ["content.css"]
    });
  }
}

function renderModelOptions(settings) {
  const activeModel = settings.activeModel || settings.model || "";
  const models = String(settings.models || activeModel || "")
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (activeModel && !models.includes(activeModel)) models.unshift(activeModel);
  currentGlobalModels = models;
  quickModel.textContent = "";
  models.forEach((model) => {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    quickModel.appendChild(option);
  });
  quickModel.value = activeModel || models[0] || "";
}

function renderQuickTools(settings) {
  quickToolsList.textContent = "";
  currentSelectionTools.forEach((tool) => {
    const row = document.createElement("div");
    row.className = "quickToolRow";
    row.dataset.toolId = tool.id;

    const toggle = document.createElement("label");
    toggle.className = "quickToolToggle";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = tool.enabled !== false;
    const name = document.createElement("span");
    name.textContent = tool.name;
    toggle.append(checkbox, name);

    const select = document.createElement("select");
    select.className = "quickToolModel";
    const inherit = document.createElement("option");
    inherit.value = "__inherit__";
    inherit.textContent = t("inheritModel", { model: settings.activeModel || settings.model || t("model") });
    select.appendChild(inherit);
    getToolModels(tool).forEach((model) => {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = model;
      select.appendChild(option);
    });
    const active = tool.activeModel || tool.model || "";
    select.value = tool.modelMode === "custom" && active ? active : "__inherit__";
    row.append(toggle, select);
    quickToolsList.appendChild(row);
  });
}

function syncQuickToolsFromUi() {
  const rows = Array.from(quickToolsList.querySelectorAll(".quickToolRow"));
  rows.forEach((row) => {
    const tool = currentSelectionTools.find((item) => item.id === row.dataset.toolId);
    if (!tool) return;
    const checked = row.querySelector("input")?.checked !== false;
    const model = row.querySelector("select")?.value || "__inherit__";
    tool.enabled = checked;
    if (model === "__inherit__") {
      tool.modelMode = "inherit";
    } else {
      tool.modelMode = "custom";
      tool.model = model;
      tool.activeModel = model;
      const models = new Set(getToolModels(tool));
      models.add(model);
      tool.models = Array.from(models).join("\n");
    }
  });
}

function getToolModels(tool) {
  const models = String(tool.models || tool.model || "")
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const active = tool.activeModel || tool.model || "";
  if (active && !models.includes(active)) models.unshift(active);
  currentGlobalModels.forEach((model) => {
    if (model && !models.includes(model)) models.push(model);
  });
  return models;
}

function normalizeTools(tools) {
  return (Array.isArray(tools) ? tools : []).map((tool, index) => ({
    ...tool,
    id: String(tool?.id || `tool_${index + 1}`),
    name: String(tool?.name || `工具 ${index + 1}`),
    enabled: tool?.enabled !== false,
    modelMode: tool?.modelMode === "custom" ? "custom" : "inherit",
    model: String(tool?.activeModel || tool?.model || ""),
    activeModel: String(tool?.activeModel || tool?.model || ""),
    models: String(tool?.models || tool?.model || "")
  }));
}

function ensureSelectOption(select, value) {
  if (!value) return;
  if (Array.from(select.options).some((option) => option.value === value)) return;
  const option = document.createElement("option");
  option.value = value;
  option.textContent = value;
  select.appendChild(option);
}

function setBusy(isBusy) {
  translateBtn.disabled = isBusy;
  clearBtn.disabled = isBusy;
}

function setStatus(message, isError = false) {
  if (!statusNode) return;
  statusNode.textContent = message;
  statusNode.classList.toggle("error", isError);
}

function readableError(error) {
  return error instanceof Error ? error.message : String(error);
}

function t(key, values = {}) {
  return VanslateI18n.t(key, currentUiLanguage, values);
}

function applyI18n() {
  VanslateI18n.apply(document, currentUiLanguage);
}
