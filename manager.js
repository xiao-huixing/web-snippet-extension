(function initManager(root) {
  "use strict";

  const Core = root.SnippetCore;
  const elements = {
    allGroups: document.querySelector("#all-groups"),
    allCount: document.querySelector("#all-count"),
    groupList: document.querySelector("#group-list"),
    viewTitle: document.querySelector("#view-title"),
    search: document.querySelector("#search-input"),
    summary: document.querySelector("#summary"),
    list: document.querySelector("#snippet-list"),
    empty: document.querySelector("#empty-state"),
    newButton: document.querySelector("#new-button"),
    exportButton: document.querySelector("#export-button"),
    importButton: document.querySelector("#import-button"),
    importInput: document.querySelector("#import-input"),
    backdrop: document.querySelector("#dialog-backdrop"),
    form: document.querySelector("#editor-form"),
    dialogTitle: document.querySelector("#dialog-title"),
    dialogClose: document.querySelector("#dialog-close"),
    dialogCancel: document.querySelector("#dialog-cancel"),
    id: document.querySelector("#snippet-id"),
    name: document.querySelector("#snippet-name"),
    url: document.querySelector("#snippet-url"),
    scope: document.querySelector("#snippet-scope"),
    content: document.querySelector("#snippet-content"),
    toast: document.querySelector("#toast")
  };

  let store = Core.emptyStore();
  let selectedSite = "all";
  let toastTimer = null;

  function showToast(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.hidden = false;
    toastTimer = setTimeout(() => { elements.toast.hidden = true; }, 2600);
  }

  async function loadStore() {
    const response = await chrome.runtime.sendMessage({ type: "GET_STORE" });
    if (!response?.ok) throw new Error(response?.error || "读取片段失败");
    store = response.store;
    if (selectedSite !== "all" && !store.snippets.some((item) => item.siteKey === selectedSite)) {
      selectedSite = "all";
    }
    render();
  }

  function siteGroups() {
    const groups = new Map();
    for (const snippet of store.snippets) {
      groups.set(snippet.siteKey, (groups.get(snippet.siteKey) || 0) + 1);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }

  function renderGroups() {
    elements.allCount.textContent = String(store.snippets.length);
    elements.allGroups.classList.toggle("active", selectedSite === "all");
    elements.groupList.replaceChildren();
    for (const [siteKey, count] of siteGroups()) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = `group-button${selectedSite === siteKey ? " active" : ""}`;
      const label = document.createElement("span");
      label.textContent = siteKey.replace(/^https?:\/\//, "");
      label.title = siteKey;
      const badge = document.createElement("strong");
      badge.textContent = String(count);
      item.append(label, badge);
      item.addEventListener("click", () => {
        selectedSite = siteKey;
        elements.search.value = "";
        render();
      });
      elements.groupList.append(item);
    }
  }

  function filteredSnippets() {
    const query = elements.search.value.trim().toLocaleLowerCase();
    const source = query || selectedSite === "all"
      ? store.snippets
      : store.snippets.filter((item) => item.siteKey === selectedSite);
    return source
      .filter((item) => !query || [item.name, item.content, item.pageUrl, item.siteKey]
        .some((value) => value.toLocaleLowerCase().includes(query)))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  function formatTime(timestamp) {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
    }).format(new Date(timestamp));
  }

  async function copySnippet(snippet) {
    try {
      await navigator.clipboard.writeText(snippet.content);
      showToast("已复制到剪贴板");
    } catch {
      showToast("复制失败，请打开剪贴板权限");
    }
  }

  async function deleteSnippet(snippet) {
    if (!window.confirm(`删除片段“${snippet.name}”？`)) return;
    const response = await chrome.runtime.sendMessage({ type: "DELETE_SNIPPET", id: snippet.id });
    showToast(response?.ok ? "片段已删除" : response?.error || "删除失败");
  }

  function snippetCard(snippet) {
    const card = document.createElement("article");
    card.className = "snippet-card";
    const head = document.createElement("div");
    head.className = "card-head";
    const title = document.createElement("h3");
    title.textContent = snippet.name;
    title.title = snippet.name;
    const scope = document.createElement("span");
    scope.className = "scope-pill";
    scope.textContent = snippet.scope === "page" ? "本页" : "整站";
    head.append(title, scope);
    const preview = document.createElement("div");
    preview.className = "snippet-preview";
    preview.textContent = snippet.content;
    const meta = document.createElement("div");
    meta.className = "card-meta";
    const url = document.createElement("span");
    url.textContent = snippet.scope === "page" ? snippet.pageKey : snippet.siteKey;
    url.title = url.textContent;
    const updated = document.createElement("span");
    updated.textContent = `更新于 ${formatTime(snippet.updatedAt)}`;
    meta.append(url, updated);
    const actions = document.createElement("div");
    actions.className = "card-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "编辑";
    edit.addEventListener("click", () => openEditor(snippet));
    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "复制";
    copy.addEventListener("click", () => copySnippet(snippet));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete";
    remove.textContent = "删除";
    remove.addEventListener("click", () => deleteSnippet(snippet));
    actions.append(edit, copy, remove);
    card.append(head, preview, meta, actions);
    return card;
  }

  function renderSnippets() {
    const snippets = filteredSnippets();
    const query = elements.search.value.trim();
    elements.viewTitle.textContent = query
      ? "全局搜索"
      : selectedSite === "all" ? "全部片段" : selectedSite.replace(/^https?:\/\//, "");
    elements.summary.textContent = `${snippets.length} 条片段${query ? `，搜索“${query}”` : ""}`;
    elements.list.replaceChildren(...snippets.map(snippetCard));
    elements.empty.hidden = snippets.length > 0;
  }

  function render() {
    renderGroups();
    renderSnippets();
  }

  function openEditor(snippet) {
    elements.form.reset();
    elements.id.value = snippet?.id || "";
    elements.name.value = snippet?.name || "";
    elements.url.value = snippet?.pageUrl || (selectedSite !== "all" ? `${selectedSite}/` : "");
    elements.scope.value = snippet?.scope || "site";
    elements.content.value = snippet?.content || "";
    elements.dialogTitle.textContent = snippet ? "编辑片段" : "新建片段";
    elements.backdrop.hidden = false;
    elements.name.focus();
  }

  function closeEditor() {
    elements.backdrop.hidden = true;
  }

  async function saveEditor(event) {
    event.preventDefault();
    const message = {
      type: "UPSERT_SNIPPET",
      id: elements.id.value || undefined,
      payload: {
        name: elements.name.value,
        pageUrl: elements.url.value,
        scope: elements.scope.value,
        content: elements.content.value
      }
    };
    let response = await chrome.runtime.sendMessage(message);
    if (response?.code === "DUPLICATE" && window.confirm("该范围已有同名片段，是否覆盖？")) {
      response = await chrome.runtime.sendMessage({ ...message, overwrite: true });
    }
    if (response?.ok) {
      closeEditor();
      showToast("片段已保存");
    } else if (response?.code !== "DUPLICATE") {
      showToast(response?.error || "保存失败");
    }
  }

  function exportStore() {
    const payload = {
      schemaVersion: Core.SCHEMA_VERSION,
      exportedAt: Date.now(),
      snippets: store.snippets
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `web-snippets-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`已导出 ${store.snippets.length} 条片段`);
  }

  async function importFile(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast("导入文件不能超过 5MB");
      return;
    }
    try {
      const payload = JSON.parse(await file.text());
      const snippets = Core.normalizeImportPayload(payload);
      if (!window.confirm(`将导入 ${snippets.length} 条片段；同名同范围内容会被覆盖。导入文件可能含敏感信息，确认继续？`)) return;
      const response = await chrome.runtime.sendMessage({ type: "IMPORT_SNIPPETS", payload });
      if (!response?.ok) throw new Error(response?.error || "导入失败");
      showToast(`导入完成：新增 ${response.added} 条，更新 ${response.updated} 条`);
    } catch (error) {
      showToast(error.message || "导入文件格式错误");
    } finally {
      elements.importInput.value = "";
    }
  }

  elements.allGroups.addEventListener("click", () => {
    selectedSite = "all";
    elements.search.value = "";
    render();
  });
  elements.search.addEventListener("input", renderSnippets);
  elements.newButton.addEventListener("click", () => openEditor(null));
  elements.exportButton.addEventListener("click", exportStore);
  elements.importButton.addEventListener("click", () => elements.importInput.click());
  elements.importInput.addEventListener("change", () => importFile(elements.importInput.files[0]));
  elements.dialogClose.addEventListener("click", closeEditor);
  elements.dialogCancel.addEventListener("click", closeEditor);
  elements.form.addEventListener("submit", saveEditor);
  elements.backdrop.addEventListener("click", (event) => {
    if (event.target === elements.backdrop) closeEditor();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.backdrop.hidden) closeEditor();
  });
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.snippetStore) loadStore().catch((error) => showToast(error.message));
  });

  loadStore().catch((error) => showToast(error.message));
})(self);
