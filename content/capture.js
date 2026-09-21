(function initSnippetCapture(root) {
  "use strict";

  let lastEditable = null;
  let contextTarget = null;

  async function sendRuntimeMessage(message) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      if (/Extension context invalidated/i.test(error?.message || "")) return null;
      throw error;
    }
  }

  function isTextInput(element) {
    if (element instanceof HTMLTextAreaElement) return true;
    if (!(element instanceof HTMLInputElement)) return false;
    return ["text", "search", "email", "url", "tel", "number"].includes(element.type);
  }

  function isPasswordInput(element) {
    return element instanceof HTMLInputElement && element.type === "password";
  }

  function editorRootFor(element) {
    return element instanceof Element ? element.closest(".CodeMirror, .cm-editor, .ace_editor") : null;
  }

  function rememberTarget(element) {
    if (isTextInput(element) || isPasswordInput(element) || editorRootFor(element)) {
      lastEditable = element;
    }
  }

  document.addEventListener("focusin", (event) => rememberTarget(event.target), true);
  document.addEventListener(
    "contextmenu",
    (event) => {
      contextTarget = event.target;
      rememberTarget(event.target);
    },
    true
  );

  function readStandardInput(element) {
    if (isPasswordInput(element)) throw new Error("为避免泄露密码，不支持保存密码输入框");
    if (!isTextInput(element)) return "";
    const start = Number.isInteger(element.selectionStart) ? element.selectionStart : 0;
    const end = Number.isInteger(element.selectionEnd) ? element.selectionEnd : 0;
    return end > start ? element.value.slice(start, end) : element.value;
  }

  function selectionInside(container) {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.anchorNode) return "";
    return container.contains(selection.anchorNode) ? selection.toString() : "";
  }

  function readCodeMirror(editorRoot) {
    const selected = selectionInside(editorRoot);
    if (selected) return selected;
    const lines = editorRoot.querySelectorAll(".CodeMirror-line, .cm-line");
    if (lines.length) return [...lines].map((line) => line.textContent || "").join("\n");
    const content = editorRoot.querySelector(".cm-content");
    return content ? content.textContent || "" : "";
  }

  async function targetContent(target) {
    if (!target || !(target instanceof Element)) return "";
    const editorRoot = editorRootFor(target);
    if (editorRoot?.classList.contains("CodeMirror")) {
      const response = await sendRuntimeMessage({ type: "READ_CODEMIRROR5" });
      if (response?.ok && typeof response.content === "string") return response.content;
    }
    if (editorRoot?.classList.contains("ace_editor")) {
      const response = await sendRuntimeMessage({ type: "READ_ACE_EDITOR" });
      if (response?.ok && typeof response.content === "string") return response.content;
    }
    if (editorRoot) return readCodeMirror(editorRoot);
    return readStandardInput(target);
  }

  async function captureCurrent(selectionText, options = {}) {
    const candidates = options.preferFocusedField === true
      ? [document.activeElement, lastEditable, contextTarget]
      : [contextTarget, document.activeElement, lastEditable];
    let content = "";
    for (const candidate of candidates) {
      content = await targetContent(candidate);
      if (content.trim()) break;
    }
    if (!content.trim() && typeof selectionText === "string") content = selectionText;
    if (!content.trim()) {
      const pageSelection = window.getSelection()?.toString() || "";
      if (pageSelection.trim()) content = pageSelection;
    }
    if (!content.trim()) throw new Error("未找到可保存的内容");
    contextTarget = null;
    return { content, pageUrl: location.href };
  }

  function setNativeValue(element, value) {
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (!setter) return false;
    setter.call(element, value);
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.focus();
    return true;
  }

  function fillCodeMirror6(editorRoot, value) {
    const content = editorRoot.querySelector(".cm-content");
    if (!(content instanceof HTMLElement) || content.contentEditable !== "true") return false;
    content.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(content);
    selection.removeAllRanges();
    selection.addRange(range);
    return document.execCommand("insertText", false, value);
  }

  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.documentElement.append(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      return copied;
    }
  }

  async function fillOrCopy(value) {
    const activeElement = document.activeElement;
    const activeEditor = editorRootFor(activeElement);
    const target = isTextInput(activeElement) || activeEditor
      ? activeElement
      : lastEditable?.isConnected === false ? null : lastEditable;
    const editorRoot = editorRootFor(target);

    if (editorRoot?.classList.contains("CodeMirror")) {
      const response = await sendRuntimeMessage({ type: "FILL_CODEMIRROR5", content: value });
      if (response?.ok) return { mode: "filled" };
    }
    if (editorRoot?.classList.contains("cm-editor") && fillCodeMirror6(editorRoot, value)) {
      return { mode: "filled" };
    }
    if (isTextInput(target) && setNativeValue(target, value)) return { mode: "filled" };

    const copied = await copyText(value);
    return { mode: copied ? "copied" : "failed" };
  }

  root.SnippetCapture = { captureCurrent, copyText, fillOrCopy };
})(self);
