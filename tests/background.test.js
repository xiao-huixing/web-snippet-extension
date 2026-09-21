"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createBackgroundHarness(sendResult = { ok: true }) {
  let actionListener = null;
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
      onMessage: { addListener() {} }
    },
    scripting: { executeScript: async () => [] },
    storage: {
      local: {
        async get() { return {}; },
        async set() {}
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
    SnippetCore: { emptyStore: () => ({}) }
  });
  const source = fs.readFileSync(path.join(__dirname, "..", "background.js"), "utf8");
  vm.runInContext(source, context);
  return { getActionListener: () => actionListener, sentMessages, createdTabs };
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
