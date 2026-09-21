"use strict";

importScripts("shared/core.js");

const STORE_KEY = "snippetStore";
const MENU_ID = "save-as-web-snippet";
let mutationQueue = Promise.resolve();
let contextMenuRegistration = Promise.resolve();

async function readStore() {
  const result = await chrome.storage.local.get(STORE_KEY);
  return SnippetCore.normalizeStore(result[STORE_KEY]);
}

async function writeStore(store) {
  await chrome.storage.local.set({ [STORE_KEY]: store });
  return store;
}

function mutateStore(mutator) {
  const task = mutationQueue.then(async () => {
    const store = await readStore();
    const result = await mutator(store);
    await writeStore(store);
    return result;
  });
  mutationQueue = task.catch(() => undefined);
  return task;
}

async function ensureStore() {
  const result = await chrome.storage.local.get(STORE_KEY);
  if (!result[STORE_KEY]) await writeStore(SnippetCore.emptyStore());
}

function removeAllContextMenus() {
  return new Promise((resolve, reject) => {
    chrome.contextMenus.removeAll(() => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}

function createContextMenu() {
  return new Promise((resolve, reject) => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "保存为片段",
      contexts: ["selection", "editable"]
    }, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}

function registerContextMenu() {
  const task = contextMenuRegistration.then(async () => {
    await removeAllContextMenus();
    await createContextMenu();
  });
  contextMenuRegistration = task.catch(() => undefined);
  return task;
}

chrome.runtime.onInstalled.addListener(() => {
  ensureStore().catch(() => undefined);
  registerContextMenu().catch(() => undefined);
});

chrome.runtime.onStartup.addListener(() => {
  ensureStore().catch(() => undefined);
  registerContextMenu().catch(() => undefined);
});

chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (tab?.id && /^https?:/.test(tab.url || "")) {
      const response = await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_OVERLAY" });
      if (response?.ok) return;
    }
  } catch (_error) {
    // 未注入内容脚本的页面会回退到管理页。
  }
  await chrome.tabs.create({ url: chrome.runtime.getURL("manager.html") });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;
  chrome.tabs.sendMessage(tab.id, {
    type: "OPEN_SAVE_DIALOG",
    selectionText: typeof info.selectionText === "string" ? info.selectionText : "",
    pageUrl: info.pageUrl || tab.url || ""
  }).catch(() => undefined);
});

async function upsertSnippet(message) {
  return mutateStore((store) => {
    const editingIndex = message.id
      ? store.snippets.findIndex((item) => item.id === message.id)
      : -1;
    if (message.id && editingIndex < 0) throw new Error("要编辑的片段不存在");

    const existing = editingIndex >= 0 ? store.snippets[editingIndex] : null;
    const candidate = SnippetCore.buildSnippet(message.payload, existing);
    const candidateKey = SnippetCore.uniqueKey(candidate);
    const conflictIndex = store.snippets.findIndex(
      (item, index) => index !== editingIndex && SnippetCore.uniqueKey(item) === candidateKey
    );

    if (conflictIndex >= 0 && !message.overwrite) {
      return { ok: false, code: "DUPLICATE", existing: store.snippets[conflictIndex] };
    }

    if (conflictIndex >= 0) {
      const conflict = store.snippets[conflictIndex];
      const overwritten = SnippetCore.buildSnippet(message.payload, conflict);
      store.snippets[conflictIndex] = overwritten;
      if (editingIndex >= 0) {
        const removeIndex = editingIndex > conflictIndex ? editingIndex : editingIndex;
        store.snippets.splice(removeIndex, 1);
      }
      return { ok: true, snippet: overwritten };
    }

    if (editingIndex >= 0) store.snippets[editingIndex] = candidate;
    else store.snippets.push(candidate);
    return { ok: true, snippet: candidate };
  });
}

async function deleteSnippet(id) {
  return mutateStore((store) => {
    const index = store.snippets.findIndex((item) => item.id === id);
    if (index < 0) return { ok: false, code: "NOT_FOUND" };
    store.snippets.splice(index, 1);
    return { ok: true };
  });
}

async function importSnippets(payload) {
  const imported = SnippetCore.normalizeImportPayload(payload);
  return mutateStore((store) => {
    const byKey = new Map(store.snippets.map((item, index) => [SnippetCore.uniqueKey(item), index]));
    const knownIds = new Set(store.snippets.map((item) => item.id));
    let added = 0;
    let updated = 0;

    for (const item of imported) {
      const key = SnippetCore.uniqueKey(item);
      const existingIndex = byKey.get(key);
      if (existingIndex !== undefined) {
        const existing = store.snippets[existingIndex];
        store.snippets[existingIndex] = {
          ...item,
          id: existing.id,
          createdAt: existing.createdAt,
          updatedAt: Date.now()
        };
        updated += 1;
      } else {
        const newItem = knownIds.has(item.id)
          ? SnippetCore.buildSnippet(item)
          : item;
        store.snippets.push(newItem);
        knownIds.add(newItem.id);
        byKey.set(key, store.snippets.length - 1);
        added += 1;
      }
    }
    return { ok: true, added, updated };
  });
}

async function setCollapsed(siteKey, collapsed) {
  return mutateStore((store) => {
    const nextCollapsed = Boolean(collapsed);
    store.uiState.collapsed = nextCollapsed;
    store.uiState.collapsedBySite[siteKey] = nextCollapsed;
    return { ok: true };
  });
}

async function setOrbPosition(siteKey, position) {
  return mutateStore((store) => {
    store.uiState.orbPositionBySite[siteKey] = SnippetCore.normalizeOrbPosition(position);
    return { ok: true };
  });
}

async function fillCodeMirror5(tabId, text) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: (content) => {
      const host = document.querySelector(".CodeMirror-focused") || document.querySelector(".CodeMirror");
      const editor = host && host.CodeMirror;
      if (!editor || typeof editor.setValue !== "function") return false;
      editor.setValue(content);
      if (typeof editor.focus === "function") editor.focus();
      return true;
    },
    args: [text]
  });
  return Boolean(results[0]?.result);
}

async function readCodeMirror5(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: () => {
      const host = document.querySelector(".CodeMirror-focused") || document.querySelector(".CodeMirror");
      const editor = host && host.CodeMirror;
      if (!editor || typeof editor.getValue !== "function") return null;
      const selection = typeof editor.getSelection === "function" ? editor.getSelection() : "";
      return selection || editor.getValue();
    }
  });
  const content = results[0]?.result;
  return typeof content === "string" ? content : null;
}

async function readAceEditor(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: () => {
      const activeRoot = document.activeElement?.closest?.(".ace_editor");
      const host = activeRoot || document.querySelector(".ace_editor.ace_focus") || document.querySelector(".ace_editor");
      const editor = host?.env?.editor;
      if (!editor || typeof editor.getValue !== "function") return null;
      const selection = typeof editor.getSelectedText === "function" ? editor.getSelectedText() : "";
      return selection || editor.getValue();
    }
  });
  const content = results[0]?.result;
  return typeof content === "string" ? content : null;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const respond = async () => {
    switch (message?.type) {
      case "GET_STORE":
        return { ok: true, store: await readStore() };
      case "UPSERT_SNIPPET":
        return upsertSnippet(message);
      case "DELETE_SNIPPET":
        return deleteSnippet(message.id);
      case "IMPORT_SNIPPETS":
        return importSnippets(message.payload);
      case "SET_COLLAPSED":
        return setCollapsed(message.siteKey, message.collapsed);
      case "SET_ORB_POSITION":
        return setOrbPosition(message.siteKey, message.position);
      case "OPEN_MANAGER":
        await chrome.tabs.create({ url: chrome.runtime.getURL("manager.html") });
        return { ok: true };
      case "FILL_CODEMIRROR5":
        return { ok: await fillCodeMirror5(sender.tab.id, message.content) };
      case "READ_CODEMIRROR5": {
        const content = await readCodeMirror5(sender.tab.id);
        return { ok: content !== null, content };
      }
      case "READ_ACE_EDITOR": {
        const content = await readAceEditor(sender.tab.id);
        return { ok: content !== null, content };
      }
      default:
        return { ok: false, code: "UNKNOWN_MESSAGE" };
    }
  };

  respond()
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message || "操作失败" }));
  return true;
});
