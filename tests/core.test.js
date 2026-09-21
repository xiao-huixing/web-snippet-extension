"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../shared/core.js");

test("页面地址规范化时忽略查询参数和锚点", () => {
  assert.deepEqual(Core.parsePageLocation("https://example.com:8443/sql/?id=2#result"), {
    pageUrl: "https://example.com:8443/sql/",
    siteKey: "https://example.com:8443",
    pageKey: "https://example.com:8443/sql/"
  });
});

test("创建片段时清理名称并保留内容", () => {
  const snippet = Core.buildSnippet({
    name: "  订单日   对账  ",
    content: "SELECT  *\nFROM orders",
    pageUrl: "http://127.0.0.1:9123/sqlquery/?tab=1",
    scope: "page"
  });
  assert.equal(snippet.name, "订单日 对账");
  assert.equal(snippet.pageKey, "http://127.0.0.1:9123/sqlquery/");
  assert.equal(snippet.content, "SELECT  *\nFROM orders");
});

test("空名称和空内容被拒绝", () => {
  assert.throws(() => Core.buildSnippet({
    name: " ", content: "SELECT 1", pageUrl: "https://example.com/", scope: "site"
  }), /名称不能为空/);
  assert.throws(() => Core.buildSnippet({
    name: "test", content: " \n", pageUrl: "https://example.com/", scope: "site"
  }), /内容不能为空/);
});

test("页面级和站点级片段按预期匹配", () => {
  const site = Core.buildSnippet({
    name: "site", content: "a", pageUrl: "https://example.com/a", scope: "site"
  });
  const page = Core.buildSnippet({
    name: "page", content: "b", pageUrl: "https://example.com/a", scope: "page"
  });
  assert.equal(Core.matchesPage(site, "https://example.com/b"), true);
  assert.equal(Core.matchesPage(page, "https://example.com/a?q=1"), true);
  assert.equal(Core.matchesPage(page, "https://example.com/b"), false);
});

test("同名判断忽略大小写和名称首尾空格", () => {
  const first = Core.buildSnippet({
    name: "Daily SQL", content: "a", pageUrl: "https://example.com/a", scope: "site"
  });
  const second = Core.buildSnippet({
    name: " daily sql ", content: "b", pageUrl: "https://example.com/b", scope: "site"
  });
  assert.equal(Core.uniqueKey(first), Core.uniqueKey(second));
});

test("导入只接受受支持的版本和有效片段", () => {
  const raw = {
    schemaVersion: 1,
    snippets: [{
      id: "1", name: "test", content: "hello", pageUrl: "https://example.com/a",
      siteKey: "wrong", scope: "site", createdAt: 1, updatedAt: 2
    }]
  };
  const [snippet] = Core.normalizeImportPayload(raw);
  assert.equal(snippet.siteKey, "https://example.com");
  assert.throws(() => Core.normalizeImportPayload({ schemaVersion: 2, snippets: [] }), /不支持/);
});

test("本地存储中的损坏记录不会阻断有效片段", () => {
  const store = Core.normalizeStore({
    snippets: [
      { name: "损坏", content: "", pageUrl: "bad-url" },
      { name: "有效", content: "SELECT 1", pageUrl: "https://example.com/", scope: "site" }
    ]
  });
  assert.equal(store.snippets.length, 1);
  assert.equal(store.snippets[0].name, "有效");
});

test("折叠小球位置可在视口边缘与坐标之间转换", () => {
  assert.deepEqual(
    Core.resolveOrbPosition({ edge: "right", ratio: 0.5 }, 1200, 800, 44),
    { left: 1156, top: 378 }
  );
  assert.deepEqual(
    Core.snapOrbPosition(8, 378, 1200, 800, 44),
    { edge: "left", ratio: 0.5 }
  );
  assert.deepEqual(
    Core.snapOrbPosition(578, 750, 1200, 800, 44),
    { edge: "bottom", ratio: 0.5 }
  );
  assert.deepEqual(
    Core.snapOrbPosition(578, 378, 1200, 800, 44),
    { edge: "free", xRatio: 0.5, yRatio: 0.5 }
  );
  assert.deepEqual(
    Core.resolveOrbPosition({ edge: "free", xRatio: 0.5, yRatio: 0.5 }, 1200, 800, 44),
    { left: 578, top: 378 }
  );
});

test("存储中的小球位置会校验边缘和比例", () => {
  const store = Core.normalizeStore({
    uiState: {
      collapsedBySite: { "https://example.com": true },
      orbPositionBySite: {
        "https://example.com": { edge: "left", ratio: 1.4 },
        "https://free.example": { edge: "free", xRatio: 0.4, yRatio: 1.4 },
        "https://invalid.example": { edge: "diagonal", ratio: -1 }
      }
    }
  });

  assert.deepEqual(store.uiState.orbPositionBySite["https://example.com"], { edge: "left", ratio: 1 });
  assert.deepEqual(store.uiState.orbPositionBySite["https://free.example"], {
    edge: "free",
    xRatio: 0.4,
    yRatio: 1
  });
  assert.deepEqual(store.uiState.orbPositionBySite["https://invalid.example"], { edge: "right", ratio: 0 });
});
