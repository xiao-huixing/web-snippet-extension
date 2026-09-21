(function startWebSnippetExtension(root) {
  "use strict";

  root.SnippetOverlay.refresh().catch(() => undefined);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.snippetStore) {
      root.SnippetOverlay.refresh().catch(() => undefined);
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "TOGGLE_OVERLAY") {
      sendResponse({ ok: true, hidden: root.SnippetOverlay.toggleVisibility() });
      return;
    }
    if (message?.type === "OPEN_SAVE_DIALOG") {
      root.SnippetCapture.captureCurrent(message.selectionText || "")
        .then((draft) => root.SnippetOverlay.openSaveDialog(draft))
        .catch((error) => root.SnippetOverlay.toast(error.message || "无法获取当前内容"));
    }
  });
})(self);
