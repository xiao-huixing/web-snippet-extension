"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const Core = require("../shared/core.js");

function createBackgroundHarness(sendResult = { ok: true }) {
  let actionListener = null;
  let messageListener = null;
  let stored = Core.emptyStore();
  const sentMessages = [];
  const createdTabs = [];
  const chrome = {
    action: {
      onClicked: { addListener(listener) { actionListener = listener; } }
    },
    contextMenus: {
      removeAll(callback) { callback(); },
      create() {},
      onClicked: { addListener() {} }
    },
    runtime: {
      getURL(file) { return `chrome-extension://test/${file}`; },
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
      onMessage: { addListener(listener) { messageListener = listener; } }
    },
    scripting: { executeScript: async () => [] },
    storage: {
      local: {
        async get(key) { return { [key]: stored }; },
        async set(value) { stored = value.snippetStore; }
      }
    },
    tabs: {
      async sendMessage(tabId, message) {
        sentMessages.push({ tabId, message });
        if (sendResult instanceof Error) throw sendResult;
        return sendResult;
      },
      async create(options) { createdTabs.push(options); }
    }
  };
  const context = vm.createContext({
    chrome,
    importScripts() {},
    SnippetCore: Core
  });
  const source = fs.readFileSync(path.join(__dirname, "..", "background.js"), "utf8");
  vm.runInContext(source, context);
  return {
    getActionListener: () => actionListener,
    getStore: () => stored,
    sentMessages,
    createdTabs,
    sendRuntimeMessage(message) {
      return new Promise((resolve) => messageListener(message, {}, resolve));
    }
  };
}

test("点击扩展图标切换当前网页浮层", async () => {
  const harness = createBackgroundHarness();

  await harness.getActionListener()({ id: 42, url: "https://example.com/form" });

  assert.equal(harness.sentMessages.length, 1);
  assert.equal(harness.sentMessages[0].tabId, 42);
  assert.equal(harness.sentMessages[0].message.type, "TOGGLE_OVERLAY");
  assert.equal(harness.createdTabs.length, 0);
});

test("当前页面无法注入浮层时退回管理页", async () => {
  const harness = createBackgroundHarness(new Error("No receiver"));

  await harness.getActionListener()({ id: 42, url: "chrome://extensions" });

  assert.equal(harness.createdTabs.length, 1);
  assert.equal(harness.createdTabs[0].url, "chrome-extension://test/manager.html");
});

test("保存折叠小球的站点边缘位置", async () => {
  const harness = createBackgroundHarness();

  const response = await harness.sendRuntimeMessage({
    type: "SET_ORB_POSITION",
    siteKey: "https://example.com",
    position: { edge: "left", ratio: 0.5 }
  });

  assert.equal(response.ok, true);
  assert.deepEqual(harness.getStore().uiState.orbPositionBySite["https://example.com"], {
    edge: "left",
    ratio: 0.5
  });
});

test("保存最后一次展开收起状态供所有站点复用", async () => {
  const harness = createBackgroundHarness();

  const response = await harness.sendRuntimeMessage({
    type: "SET_COLLAPSED",
    siteKey: "https://example.com",
    collapsed: true
  });

  assert.equal(response.ok, true);
  assert.equal(harness.getStore().uiState.collapsed, true);
  assert.equal(harness.getStore().uiState.collapsedBySite["https://example.com"], true);
});
