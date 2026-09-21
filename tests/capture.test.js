const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createCaptureHarness(sendMessage = async () => ({ ok: false })) {
  const listeners = new Map();

  class FakeElement {
    constructor() {
      this.events = [];
      this.classList = { contains: () => false };
    }

    closest(selector) {
      if (!this.closestResult) return null;
      return !this.closestSelector || selector.includes(this.closestSelector)
        ? this.closestResult
        : null;
    }

    dispatchEvent(event) {
      this.events.push(event.type);
      return true;
    }

    focus() {
      document.activeElement = this;
    }
  }

  class FakeInput extends FakeElement {
    constructor(type = "text") {
      super();
      this.type = type;
      this._value = "";
      this.selectionStart = 0;
      this.selectionEnd = 0;
    }

    get value() {
      return this._value;
    }

    set value(nextValue) {
      this._value = nextValue;
    }
  }

  class FakeTextArea extends FakeElement {
    constructor() {
      super();
      this._value = "";
      this.selectionStart = 0;
      this.selectionEnd = 0;
    }

    get value() {
      return this._value;
    }

    set value(nextValue) {
      this._value = nextValue;
    }
  }

  const document = {
    activeElement: null,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    createElement(tagName) {
      return tagName === "textarea" ? new FakeTextArea() : new FakeElement();
    },
    documentElement: { append() {} },
    execCommand() {
      return true;
    }
  };
  document.body = new FakeElement();
  document.activeElement = document.body;

  const root = {};
  const context = vm.createContext({
    self: root,
    document,
    location: { href: "https://example.com/form" },
    window: { getSelection: () => null },
    navigator: { clipboard: { writeText: async () => undefined } },
    chrome: { runtime: { sendMessage } },
    Element: FakeElement,
    HTMLInputElement: FakeInput,
    HTMLTextAreaElement: FakeTextArea,
    HTMLElement: FakeElement,
    InputEvent: class InputEvent {
      constructor(type) {
        this.type = type;
      }
    },
    Event: class Event {
      constructor(type) {
        this.type = type;
      }
    }
  });

  const source = fs.readFileSync(path.join(__dirname, "..", "content", "capture.js"), "utf8");
  vm.runInContext(source, context);

  return { capture: root.SnippetCapture, document, listeners, FakeElement, FakeTextArea };
}

test("点击浮层按钮后仍回填最近聚焦的输入框", async () => {
  const harness = createCaptureHarness();
  const textarea = new harness.FakeTextArea();
  textarea.focus();
  harness.listeners.get("focusin")({ target: textarea });

  const overlayButton = new harness.FakeElement();
  overlayButton.focus();

  const result = await harness.capture.fillOrCopy("EXT-E2E-20260920");

  assert.equal(result.mode, "filled");
  assert.equal(textarea.value, "EXT-E2E-20260920");
  assert.deepEqual(textarea.events, ["input", "change"]);
});

test("保存当前优先读取多行输入框的选区", async () => {
  const harness = createCaptureHarness();
  const textarea = new harness.FakeTextArea();
  textarea.value = "第一行\n第二行\n第三行";
  textarea.selectionStart = 4;
  textarea.selectionEnd = 7;
  textarea.focus();
  harness.listeners.get("focusin")({ target: textarea });

  const overlayButton = new harness.FakeElement();
  overlayButton.focus();

  const draft = await harness.capture.captureCurrent("", { preferFocusedField: true });

  assert.equal(draft.content, "第二行");
  assert.equal(draft.pageUrl, "https://example.com/form");
});

test("保存当前在没有选区时读取整个多行输入框", async () => {
  const harness = createCaptureHarness();
  const textarea = new harness.FakeTextArea();
  textarea.value = "第一行\n第二行\n第三行";
  textarea.selectionStart = 0;
  textarea.selectionEnd = 0;
  textarea.focus();
  harness.listeners.get("focusin")({ target: textarea });

  const overlayButton = new harness.FakeElement();
  overlayButton.focus();

  const draft = await harness.capture.captureCurrent("", { preferFocusedField: true });

  assert.equal(draft.content, "第一行\n第二行\n第三行");
  assert.equal(draft.pageUrl, "https://example.com/form");
});

test("光标移到其他行后不会复用上一次选区", async () => {
  const harness = createCaptureHarness();
  const textarea = new harness.FakeTextArea();
  textarea.value = "第一行\n第二行\n第三行";
  textarea.selectionStart = 4;
  textarea.selectionEnd = 7;
  textarea.focus();
  harness.listeners.get("focusin")({ target: textarea });

  textarea.selectionStart = textarea.value.length;
  textarea.selectionEnd = textarea.value.length;
  const overlayButton = new harness.FakeElement();
  overlayButton.focus();

  const draft = await harness.capture.captureCurrent("", { preferFocusedField: true });

  assert.equal(draft.content, "第一行\n第二行\n第三行");
});

test("Ace 编辑器不读取只含当前行的隐藏输入框", async () => {
  const messages = [];
  const harness = createCaptureHarness(async (message) => {
    messages.push(message);
    if (message.type === "READ_ACE_EDITOR") {
      return { ok: true, editorType: "ace", content: "第一行\n第二行\n第三行" };
    }
    return { ok: false };
  });
  const aceRoot = new harness.FakeElement();
  aceRoot.classList = { contains: (name) => name === "ace_editor" };
  const hiddenTextarea = new harness.FakeTextArea();
  hiddenTextarea.value = "第三行";
  hiddenTextarea.closestResult = aceRoot;
  hiddenTextarea.closestSelector = ".ace_editor";
  hiddenTextarea.focus();
  harness.listeners.get("focusin")({ target: hiddenTextarea });

  const draft = await harness.capture.captureCurrent("", { preferFocusedField: true });

  assert.equal(messages.at(-1).type, "READ_ACE_EDITOR");
  assert.equal(draft.content, "第一行\n第二行\n第三行");
});

test("只有 Ace 样式但没有真实实例时回退到页面选区", async () => {
  const messages = [];
  const harness = createCaptureHarness(async (message) => {
    messages.push(message);
    return { ok: false, editorType: null, content: null };
  });
  const lookalikeRoot = new harness.FakeElement();
  lookalikeRoot.classList = { contains: (name) => name === "ace_editor" };
  const textarea = new harness.FakeTextArea();
  textarea.value = "不应读取的伪编辑器内容";
  textarea.closestResult = lookalikeRoot;
  textarea.closestSelector = ".ace_editor";
  textarea.focus();
  harness.listeners.get("focusin")({ target: textarea });

  const draft = await harness.capture.captureCurrent("普通页面选区", { preferFocusedField: true });

  assert.equal(messages.at(-1).type, "READ_ACE_EDITOR");
  assert.equal(draft.content, "普通页面选区");
});

test("普通输入框网页不会触发 Ace 编辑器读取", async () => {
  const messages = [];
  const harness = createCaptureHarness(async (message) => {
    messages.push(message);
    return { ok: false };
  });
  const textarea = new harness.FakeTextArea();
  textarea.value = "普通输入框完整内容";
  textarea.focus();
  harness.listeners.get("focusin")({ target: textarea });

  const draft = await harness.capture.captureCurrent("", { preferFocusedField: true });

  assert.equal(draft.content, "普通输入框完整内容");
  assert.equal(messages.some((message) => message.type === "READ_ACE_EDITOR"), false);
});
