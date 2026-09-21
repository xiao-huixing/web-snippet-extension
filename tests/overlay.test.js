"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const Core = require("../shared/core.js");

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.attributes = new Map();
    this.events = new Map();
    this.className = "";
    this.hidden = false;
    this.style = {};
    this.textContent = "";
    this.animations = [];
  }

  append(...children) {
    for (const child of children) child.parentNode = this;
    this.children.push(...children);
  }

  appendChild(child) {
    this.append(child);
    return child;
  }

  attachShadow() {
    this.shadowRoot = new FakeElement("shadow-root");
    return this.shadowRoot;
  }

  addEventListener(type, listener) {
    this.events.set(type, listener);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  remove() {
    this.removed = true;
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
    this.parentNode = null;
  }

  focus() {}

  setPointerCapture() {}

  releasePointerCapture() {}

  animate(keyframes, options) {
    this.animations.push({ keyframes, options });
    return { finished: Promise.resolve(), cancel() {} };
  }
}

function findByClass(root, className) {
  const value = [
    typeof root.className === "string" ? root.className : "",
    root.getAttribute?.("class") || ""
  ].join(" ");
  if (value.split(/\s+/).includes(className)) return root;
  for (const child of root.children) {
    const match = findByClass(child, className);
    if (match) return match;
  }
  return null;
}

function findByAttribute(root, name, value) {
  if (root.getAttribute?.(name) === value) return root;
  for (const child of root.children) {
    const match = findByAttribute(child, name, value);
    if (match) return match;
  }
  return null;
}

function createOverlayHarness(collapsed, siteCollapsed = collapsed, invalidateOnMutation = false) {
  const messages = [];
  const documentElement = new FakeElement("html");
  const document = {
    documentElement,
    createElement: (tagName) => new FakeElement(tagName),
    createElementNS: (_namespace, tagName) => new FakeElement(tagName)
  };
  const store = Core.emptyStore();
  store.uiState.collapsed = collapsed;
  store.uiState.collapsedBySite["https://github.com"] = siteCollapsed;
  const root = {
    SnippetCore: Core,
    SnippetCapture: {}
  };
  const context = vm.createContext({
    self: root,
    document,
    location: { href: "https://github.com/openai" },
    window: {
      confirm: () => true,
      innerWidth: 1200,
      innerHeight: 800,
      addEventListener() {}
    },
    chrome: {
      runtime: {
        async sendMessage(message) {
          messages.push(message);
          if (message.type === "GET_STORE") return { ok: true, store };
          if (invalidateOnMutation) throw new Error("Extension context invalidated.");
          return { ok: true };
        }
      }
    },
    setTimeout
  });
  const source = fs.readFileSync(path.join(__dirname, "..", "content", "overlay.js"), "utf8");
  vm.runInContext(source, context);

  return {
    host: documentElement.children[0],
    messages,
    overlay: root.SnippetOverlay,
    shadow: documentElement.children[0].shadowRoot
  };
}

test("折叠后显示稳定的小球按钮，点击后展开浮层", async () => {
  const harness = createOverlayHarness(true);
  await harness.overlay.refresh();

  const style = harness.shadow.children[0];
  const panel = findByClass(harness.shadow, "panel");
  const toggle = findByAttribute(panel, "aria-label", "展开网页片段");

  assert.match(style.textContent, /\.panel\s*\{\s*opacity:\s*\.42;/);
  assert.match(style.textContent, /\.panel:hover,\s*\.panel:focus-within\s*\{\s*opacity:\s*1;/);
  assert.match(style.textContent, /\.panel\.collapsed\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;[^}]*background:\s*transparent;[^}]*border:\s*0;/s);
  assert.match(style.textContent, /\.orb\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;[^}]*display:\s*grid;[^}]*place-items:\s*center;[^}]*background:\s*transparent;[^}]*border:\s*0;[^}]*box-shadow:\s*none;/s);
  assert.match(style.textContent, /\.orb-mark\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px;[^}]*filter:\s*drop-shadow\(0 3px 7px rgba\(15, 23, 42, \.28\)\)/s);
  assert.match(style.textContent, /\.mark-shell\s*\{[^}]*fill:\s*#111827;[^}]*stroke:\s*#e2e8f0;[^}]*stroke-width:\s*\.85;/s);
  assert.match(style.textContent, /\.mark-glyph\s*\{[^}]*fill:\s*none;[^}]*stroke:\s*#bfdbfe;[^}]*stroke-width:\s*1\.65;/s);
  assert.match(style.textContent, /\.mark-center\s*\{[^}]*fill:\s*#fff;[^}]*stroke:\s*#3157d5;[^}]*stroke-width:\s*\.65;/s);
  assert.match(style.textContent, /\.panel\.collapsed\.snapped\[data-edge="right"\] \.orb-mark\s*\{[^}]*transform:\s*translateX\(27px\)/s);
  assert.match(style.textContent, /\.panel\.collapsed\.snapped:hover \.orb-mark,[^}]*\.panel\.collapsed\.snapped:focus-within \.orb-mark\s*\{[^}]*transform:\s*translate\(0, 0\)/s);
  assert.doesNotMatch(style.textContent, /transform:\s*scale/);
  assert.doesNotMatch(style.textContent, /basketball|ball-shell|ball-seam|ball-center/);
  assert.doesNotMatch(style.textContent, /orb-dot/);
  assert.doesNotMatch(style.textContent, /\.panel\.collapsed::before/);
  assert.match(panel.className, /\bcollapsed\b/);
  assert.match(panel.className, /\bsnapped\b/);
  assert.equal(panel.getAttribute("data-edge"), "right");
  assert.ok(findByClass(panel, "orb"));
  const mark = findByClass(panel, "orb-mark");
  assert.ok(mark);
  assert.equal(mark.tagName, "svg");
  assert.ok(findByClass(mark, "mark-shell"));
  assert.ok(findByClass(mark, "mark-glyph"));
  assert.equal(findByClass(mark, "mark-center").getAttribute("r"), "1.45");
  assert.equal(findByClass(panel, "head"), null);
  assert.equal(findByClass(panel, "head-actions"), null);
  assert.equal(findByClass(panel, "body"), null);
  assert.equal(findByClass(panel, "actions"), null);
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(toggle.getAttribute("aria-label"), "展开网页片段");

  await toggle.events.get("click")();
  const message = harness.messages.at(-1);
  assert.equal(message.type, "SET_COLLAPSED");
  assert.equal(message.siteKey, "https://github.com");
  assert.equal(message.collapsed, false);
});

test("全局折叠状态优先于站点旧记录", async () => {
  const harness = createOverlayHarness(true, false);
  await harness.overlay.refresh();

  const panel = findByClass(harness.shadow, "panel");
  assert.match(panel.className, /\bcollapsed\b/);
  assert.ok(findByAttribute(panel, "aria-label", "展开网页片段"));
});

test("扩展上下文失效后移除旧浮层且不产生未处理拒绝", async () => {
  const harness = createOverlayHarness(true, true, true);
  await harness.overlay.refresh();

  const panel = findByClass(harness.shadow, "panel");
  const toggle = findByAttribute(panel, "aria-label", "展开网页片段");

  await assert.doesNotReject(() => toggle.events.get("click")());
  assert.equal(harness.host.removed, true);
});

test("拖动折叠小球后吸附最近边缘且不触发展开", async () => {
  const harness = createOverlayHarness(true);
  await harness.overlay.refresh();

  const panel = findByClass(harness.shadow, "panel");
  const toggle = findByAttribute(panel, "aria-label", "展开网页片段");
  const pointerEvent = (clientX, clientY) => ({
    button: 0,
    pointerId: 1,
    clientX,
    clientY,
    preventDefault() {}
  });

  assert.equal(panel.style.left, "1156px");
  assert.equal(panel.style.top, "18px");

  toggle.events.get("pointerdown")(pointerEvent(1178, 40));
  toggle.events.get("pointermove")(pointerEvent(30, 400));
  await toggle.events.get("pointerup")(pointerEvent(30, 400));
  await toggle.events.get("click")();

  assert.equal(panel.style.left, "0px");
  assert.equal(panel.style.top, "378px");
  assert.match(panel.className, /\bsnapped\b/);
  assert.equal(panel.getAttribute("data-edge"), "left");
  assert.equal(JSON.stringify(panel.animations), JSON.stringify([{
    keyframes: [
      { transform: "translate(8px, 0px)" },
      { transform: "translate(0, 0)" }
    ],
    options: { duration: 180, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }
  }]));
  const positionMessage = harness.messages.find((message) => message.type === "SET_ORB_POSITION");
  assert.deepEqual(positionMessage.position, { edge: "left", ratio: 0.5 });
  assert.equal(harness.messages.some((message) => message.type === "SET_COLLAPSED"), false);
});

test("拖动位置远离边缘时保留自由位置", async () => {
  const harness = createOverlayHarness(true);
  await harness.overlay.refresh();

  const panel = findByClass(harness.shadow, "panel");
  const toggle = findByAttribute(panel, "aria-label", "展开网页片段");
  const pointerEvent = (clientX, clientY) => ({
    button: 0,
    pointerId: 1,
    clientX,
    clientY,
    preventDefault() {}
  });

  toggle.events.get("pointerdown")(pointerEvent(1178, 40));
  toggle.events.get("pointermove")(pointerEvent(600, 400));
  await toggle.events.get("pointerup")(pointerEvent(600, 400));

  assert.equal(panel.style.left, "578px");
  assert.equal(panel.style.top, "378px");
  assert.doesNotMatch(panel.className, /\bsnapped\b/);
  assert.equal(panel.getAttribute("data-edge"), "free");
  assert.deepEqual(panel.animations, []);
  const positionMessage = harness.messages.find((message) => message.type === "SET_ORB_POSITION");
  assert.deepEqual(positionMessage.position, { edge: "free", xRatio: 0.5, yRatio: 0.5 });
});

test("展开状态提供明确的收起按钮", async () => {
  const harness = createOverlayHarness(false);
  await harness.overlay.refresh();

  const panel = findByClass(harness.shadow, "panel");
  const actions = findByClass(panel, "head-actions");
  const toggle = findByAttribute(actions, "aria-label", "收起网页片段");
  const hide = findByAttribute(actions, "aria-label", "完全隐藏网页片段");

  assert.equal(panel.className, "panel");
  assert.ok(actions);
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  assert.equal(toggle.getAttribute("aria-label"), "收起网页片段");
  assert.ok(hide);
  assert.equal(actions.children[0], hide);
  assert.equal(actions.children[1], toggle);
});

test("完全隐藏后页面不保留浮层，并可通过消息重新打开", async () => {
  const harness = createOverlayHarness(false);
  await harness.overlay.refresh();

  const panel = findByClass(harness.shadow, "panel");
  const hide = findByAttribute(panel, "aria-label", "完全隐藏网页片段");
  assert.ok(hide);

  await hide.events.get("click")();
  assert.equal(findByClass(harness.shadow, "panel"), null);

  harness.overlay.toggleVisibility();
  assert.ok(findByClass(harness.shadow, "panel"));
});
