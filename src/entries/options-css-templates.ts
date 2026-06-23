export const TRANSLATION_CSS_TEMPLATES = [
  {
    id: "inherit",
    nameKey: "cssTemplateInherit",
    descriptionKey: "cssTemplateInheritDesc",
    css: ""
  },
  {
    id: "soft-left",
    nameKey: "cssTemplateSoftLeft",
    descriptionKey: "cssTemplateSoftLeftDesc",
    css: "opacity: 0.88;\nborder-left: 2px solid #0867f2;\npadding-left: 0.45em;"
  },
  {
    id: "muted-note",
    nameKey: "cssTemplateMutedNote",
    descriptionKey: "cssTemplateMutedNoteDesc",
    css: "color: #58677f;\nfont-style: italic;"
  },
  {
    id: "focus-band",
    nameKey: "cssTemplateFocusBand",
    descriptionKey: "cssTemplateFocusBandDesc",
    css: ".vanslate-result {\n  background: rgba(8, 103, 242, 0.08);\n  border-radius: 4px;\n  padding: 0.05em 0.25em;\n}"
  }
];

export function createTranslationCssTemplatePicker(options: {
  container: HTMLElement | null;
  textarea: HTMLTextAreaElement | null;
  t: (key: string) => string;
}) {
  const { container, textarea, t } = options;
  if (!container || !textarea) return { render: () => undefined };

  const render = () => {
    container.textContent = "";
    TRANSLATION_CSS_TEMPLATES.forEach((template, index) => {
      const card = document.createElement("button");
      const scope = `css-template-${template.id}-${index}`;
      card.type = "button";
      card.className = "cssTemplateCard";
      card.dataset.templateId = template.id;
      card.dataset.active = normalizeCss(textarea.value) === normalizeCss(template.css) ? "true" : "false";
      card.innerHTML = `
        <span class="cssTemplateTitle">${escapeHtml(t(template.nameKey))}</span>
        <span class="cssTemplatePreview" data-css-template-scope="${scope}">
          <span>${escapeHtml(t("cssTemplateOriginal"))}</span>
          <span class="vanslate-result">${escapeHtml(t("cssTemplateTranslated"))}</span>
        </span>
        <span class="cssTemplateDesc">${escapeHtml(t(template.descriptionKey))}</span>
      `;
      const style = document.createElement("style");
      style.textContent = scopedTemplateCss(template.css, scope);
      card.appendChild(style);
      card.addEventListener("click", () => {
        textarea.value = template.css;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        render();
      });
      container.appendChild(card);
    });
  };

  textarea.addEventListener("input", render);
  render();
  return { render };
}

function scopedTemplateCss(css: string, scope: string): string {
  const value = String(css || "").trim();
  if (!value) return "";
  const selector = `[data-css-template-scope="${scope}"] .vanslate-result`;
  if (!value.includes("{")) return `${selector}{${value}}`;
  return value.replace(/\.vanslate-result/g, selector);
}

function normalizeCss(css: string): string {
  return String(css || "").replace(/\s+/g, " ").trim();
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
