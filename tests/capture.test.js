const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createCaptureHarness() {
  const listeners = new Map();

  class FakeElement {
    constructor() {
      this.events = [];
      this.classList = { contains: () => false };
    }

    closest() {
      return null;
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
    chrome: { runtime: { sendMessage: async () => ({ ok: false }) } },
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
  harness.listeners.get("select")({ target: textarea });
  textarea.selectionStart = 7;
  textarea.selectionEnd = 7;

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
