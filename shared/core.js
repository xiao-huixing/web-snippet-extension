(function initSnippetCore(root) {
  "use strict";

  const SCHEMA_VERSION = 1;
  const MAX_NAME_LENGTH = 120;
  const MAX_CONTENT_LENGTH = 2_000_000;

  function emptyStore() {
    return {
      schemaVersion: SCHEMA_VERSION,
      snippets: [],
      settings: { showOverlayWhenNoMatch: true },
      uiState: { collapsedBySite: {} }
    };
  }

  function cleanName(value) {
    return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  }

  function parsePageLocation(value) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error("请输入有效的网页地址");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("仅支持 HTTP 或 HTTPS 网页");
    }
    const pathname = url.pathname || "/";
    return {
      pageUrl: `${url.origin}${pathname}`,
      siteKey: url.origin,
      pageKey: `${url.origin}${pathname}`
    };
  }

  function createId() {
    if (root.crypto && typeof root.crypto.randomUUID === "function") {
      return root.crypto.randomUUID();
    }
    return `snippet-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalizeScope(value) {
    return value === "page" ? "page" : "site";
  }

  function buildSnippet(input, existing) {
    const name = cleanName(input && input.name);
    const content = input && typeof input.content === "string" ? input.content : "";
    const scope = normalizeScope(input && input.scope);
    const location = parsePageLocation(input && input.pageUrl);

    if (!name) throw new Error("片段名称不能为空");
    if (name.length > MAX_NAME_LENGTH) throw new Error(`片段名称不能超过 ${MAX_NAME_LENGTH} 个字符`);
    if (!content.trim()) throw new Error("片段内容不能为空");
    if (content.length > MAX_CONTENT_LENGTH) throw new Error("片段内容过长");

    const now = Date.now();
    return {
      id: existing && existing.id ? existing.id : createId(),
      name,
      content,
      pageUrl: location.pageUrl,
      siteKey: location.siteKey,
      pageKey: location.pageKey,
      scope,
      createdAt: existing && Number.isFinite(existing.createdAt) ? existing.createdAt : now,
      updatedAt: now
    };
  }

  function uniqueKey(snippet) {
    const target = snippet.scope === "page" ? snippet.pageKey : snippet.siteKey;
    return `${snippet.scope}\u0000${target}\u0000${cleanName(snippet.name).toLocaleLowerCase()}`;
  }

  function matchesPage(snippet, pageUrl) {
    let location;
    try {
      location = parsePageLocation(pageUrl);
    } catch {
      return false;
    }
    if (snippet.siteKey !== location.siteKey) return false;
    return snippet.scope !== "page" || snippet.pageKey === location.pageKey;
  }

  function normalizeStoredSnippet(raw) {
    if (!raw || typeof raw !== "object") throw new Error("片段数据格式错误");
    const snippet = buildSnippet(raw, {
      id: typeof raw.id === "string" && raw.id ? raw.id : createId(),
      createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now()
    });
    snippet.updatedAt = Number.isFinite(raw.updatedAt) ? raw.updatedAt : snippet.createdAt;
    return snippet;
  }

  function normalizeStore(raw) {
    const base = emptyStore();
    if (!raw || typeof raw !== "object") return base;
    const snippets = [];
    if (Array.isArray(raw.snippets)) {
      for (const item of raw.snippets) {
        try {
          snippets.push(normalizeStoredSnippet(item));
        } catch {
          // 跳过损坏的单条记录，避免整个片段库无法打开。
        }
      }
    }
    return {
      schemaVersion: SCHEMA_VERSION,
      snippets,
      settings: {
        showOverlayWhenNoMatch: raw.settings?.showOverlayWhenNoMatch !== false
      },
      uiState: {
        collapsedBySite:
          raw.uiState?.collapsedBySite && typeof raw.uiState.collapsedBySite === "object"
            ? { ...raw.uiState.collapsedBySite }
            : {}
      }
    };
  }

  function normalizeImportPayload(payload) {
    const snippets = Array.isArray(payload) ? payload : payload && payload.snippets;
    if (!Array.isArray(snippets)) throw new Error("导入文件中缺少 snippets 数组");
    if (!Array.isArray(payload) && payload.schemaVersion !== SCHEMA_VERSION) {
      throw new Error("不支持该备份文件版本");
    }
    return snippets.map(normalizeStoredSnippet);
  }

  function sortForPage(snippets) {
    return [...snippets].sort((a, b) => {
      if (a.scope !== b.scope) return a.scope === "page" ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
  }

  const api = {
    SCHEMA_VERSION,
    emptyStore,
    cleanName,
    parsePageLocation,
    buildSnippet,
    uniqueKey,
    matchesPage,
    normalizeStore,
    normalizeImportPayload,
    sortForPage
  };

  root.SnippetCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : global);
