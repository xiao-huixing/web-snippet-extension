(function initSnippetOverlay(root) {
  "use strict";

  const Core = root.SnippetCore;
  const Capture = root.SnippetCapture;
  const ORB_SIZE = 44;
  const DRAG_THRESHOLD = 5;
  const host = document.createElement("div");
  host.id = "web-snippet-extension-root";
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .panel { position: fixed; z-index: 2147483646; top: 18px; right: 18px; width: 340px;
      color: #172033; background: #fffdf8; border: 1px solid #cfd5df; border-radius: 14px;
      box-shadow: 0 16px 48px rgba(24, 34, 51, .2); font: 13px/1.45 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      opacity: 1; transition: opacity 160ms ease; }
    .panel.collapsed { width: 44px; height: 44px; overflow: visible; background: transparent;
      border: 0; border-radius: 50%; box-shadow: none; }
    .head { display: flex; align-items: center; gap: 8px; min-height: 48px; padding: 9px 10px 9px 14px;
      border-bottom: 1px solid #e3e6eb; background: linear-gradient(120deg, #f5f7ff, #fffdf8 62%); border-radius: 14px 14px 0 0; }
    .mark { width: 8px; height: 24px; border-radius: 99px; background: #3157d5; box-shadow: 0 0 0 4px #e5eaff; }
    .title { min-width: 0; flex: 1; }
    .title strong { display: block; color: #111827; font-size: 14px; letter-spacing: .02em; }
    .title span { display: block; overflow: hidden; color: #6b7280; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
    .head-actions { display: flex; flex: none; gap: 2px; align-items: center; margin-left: auto; }
    button { border: 0; font: inherit; cursor: pointer; }
    .orb { width: 44px; height: 44px; display: grid; place-items: center; padding: 0;
      touch-action: none; cursor: grab; background: transparent; border: 0; border-radius: 50%; box-shadow: none; }
    .orb:hover { background: transparent; box-shadow: none; }
    .orb-mark { display: block; width: 24px; height: 24px; overflow: visible;
      filter: drop-shadow(0 3px 7px rgba(15, 23, 42, .28));
      transition: transform 140ms cubic-bezier(0.16, 1, 0.3, 1), filter 140ms ease; }
    .mark-shell { fill: #111827; stroke: #e2e8f0; stroke-width: .85; }
    .mark-glyph { fill: none; stroke: #bfdbfe; stroke-width: 1.65; stroke-linecap: round; stroke-linejoin: round; }
    .mark-center { fill: #fff; stroke: #3157d5; stroke-width: .65; }
    .orb:hover .orb-mark { filter: drop-shadow(0 4px 9px rgba(15, 23, 42, .38)); }
    .panel.collapsed.snapped[data-edge="left"] .orb-mark { transform: translateX(-27px); }
    .panel.collapsed.snapped[data-edge="right"] .orb-mark { transform: translateX(27px); }
    .panel.collapsed.snapped[data-edge="top"] .orb-mark { transform: translateY(-27px); }
    .panel.collapsed.snapped[data-edge="bottom"] .orb-mark { transform: translateY(27px); }
    .panel.collapsed.snapped:hover .orb-mark, .panel.collapsed.snapped:focus-within .orb-mark { transform: translate(0, 0); }
    .icon { width: 30px; height: 30px; color: #475569; background: transparent; border-radius: 8px; }
    .icon:hover { background: #e9edf7; color: #1d3fb7; }
    .orb:focus-visible, .icon:focus-visible, .primary:focus-visible, .secondary:focus-visible, .mini:focus-visible, .name:focus-visible {
      outline: 2px solid #3157d5; outline-offset: 2px; }
    .icon svg { display: block; width: 17px; height: 17px; margin: 0; fill: none; stroke: currentColor;
      stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .body { max-height: 420px; overflow: auto; padding: 8px; }
    .empty { margin: 6px; padding: 18px 12px; color: #6b7280; text-align: center; border: 1px dashed #d5dae3; border-radius: 10px; }
    .row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 5px; align-items: center; padding: 7px 6px; border-radius: 9px; }
    .row:hover { background: #f1f4fa; }
    .name { overflow: hidden; padding: 5px 6px; color: #172033; background: transparent; font-weight: 650; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
    .name:hover { color: #234bc2; }
    .mini { padding: 5px 7px; color: #596579; background: #edf0f5; border-radius: 7px; font-size: 11px; }
    .mini:hover { color: #fff; background: #3157d5; }
    .danger:hover { background: #bc3144; }
    .scope { margin-left: 6px; color: #8791a2; font-size: 10px; font-weight: 500; }
    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; padding: 9px; border-top: 1px solid #e3e6eb; }
    .primary, .secondary { padding: 8px 10px; border-radius: 9px; font-weight: 650; }
    .primary { color: white; background: #3157d5; }
    .primary:hover { background: #2445b7; }
    .secondary { color: #344056; background: #edf0f5; }
    .secondary:hover { background: #dfe4ec; }
    .toast { position: fixed; z-index: 2147483647; right: 18px; top: 84px; max-width: 340px; padding: 9px 12px;
      color: white; background: #172033; border-radius: 9px; box-shadow: 0 8px 24px rgba(0,0,0,.2); font: 12px/1.4 ui-sans-serif, sans-serif; }
    .dialog-backdrop { position: fixed; z-index: 2147483647; inset: 0; display: grid; place-items: center; background: rgba(15, 23, 42, .28); backdrop-filter: blur(2px); }
    .dialog { width: min(440px, calc(100vw - 32px)); padding: 20px; color: #172033; background: #fffdf8; border: 1px solid #d8dde6; border-radius: 16px; box-shadow: 0 24px 80px rgba(15,23,42,.3); font: 13px/1.5 ui-sans-serif, sans-serif; }
    .dialog h2 { margin: 0 0 16px; font-size: 19px; }
    label { display: block; margin: 11px 0 5px; color: #4a5568; font-weight: 650; }
    input, select, textarea { width: 100%; padding: 9px 10px; color: #111827; background: white; border: 1px solid #cbd2de; border-radius: 9px; font: inherit; outline: none; }
    input:focus, select:focus, textarea:focus { border-color: #3157d5; box-shadow: 0 0 0 3px #e1e7ff; }
    textarea { min-height: 110px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
    @media (hover: hover) and (pointer: fine) {
      .panel { opacity: .42; }
      .panel:hover, .panel:focus-within { opacity: 1; }
      .panel.collapsed { opacity: 1; }
    }
    .panel.collapsed.dragging { opacity: 1; transition: none; }
    .panel.collapsed.dragging .orb { cursor: grabbing; }
    @media (prefers-reduced-motion: reduce) {
      .panel, .orb-mark { transition: none; }
    }
  `;
  shadow.append(style);
  document.documentElement.append(host);

  let store = Core.emptyStore();
  let panel = null;
  let dialogOpen = false;
  let overlayHidden = false;
  let panelSiteKey = null;
  let ignoreNextOrbClick = false;

  async function sendRuntimeMessage(message) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      if (!/Extension context invalidated/i.test(error?.message || "")) throw error;
      overlayHidden = true;
      panel = null;
      panelSiteKey = null;
      host.remove();
      return null;
    }
  }

  function viewportSize() {
    return {
      width: Number.isFinite(window.innerWidth) ? window.innerWidth : ORB_SIZE,
      height: Number.isFinite(window.innerHeight) ? window.innerHeight : ORB_SIZE
    };
  }

  function defaultOrbPosition() {
    const { height } = viewportSize();
    return { edge: "right", ratio: 18 / Math.max(1, height - ORB_SIZE) };
  }

  function getOrbPosition(siteKey) {
    return store.uiState.orbPositionBySite[siteKey] || defaultOrbPosition();
  }

  function setCollapsedPanelState(target, position, dragging = false) {
    const normalized = Core.normalizeOrbPosition(position);
    const snapped = normalized.edge !== "free" && !dragging;
    target.className = ["panel", "collapsed", snapped ? "snapped" : "", dragging ? "dragging" : ""]
      .filter(Boolean)
      .join(" ");
    target.setAttribute("data-edge", dragging ? "free" : normalized.edge);
  }

  function applyOrbPosition(target, position, updateAppearance = true) {
    const { width, height } = viewportSize();
    const normalized = Core.normalizeOrbPosition(position);
    const coordinates = Core.resolveOrbPosition(normalized, width, height, ORB_SIZE);
    target.style.left = `${coordinates.left}px`;
    target.style.top = `${coordinates.top}px`;
    target.style.right = "auto";
    target.style.bottom = "auto";
    if (updateAppearance) setCollapsedPanelState(target, normalized);
    return coordinates;
  }

  function prefersReducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  }

  function animateOrbSnap(target, from, to) {
    const deltaX = from.left - to.left;
    const deltaY = from.top - to.top;
    if (prefersReducedMotion() || typeof target.animate !== "function" || (!deltaX && !deltaY)) return null;
    return target.animate(
      [
        { transform: `translate(${deltaX}px, ${deltaY}px)` },
        { transform: "translate(0, 0)" }
      ],
      { duration: 180, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }
    );
  }

  function makeOrbDraggable(orb, target, siteKey) {
    let dragState = null;
    let snapAnimation = null;

    orb.addEventListener("pointerdown", (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      snapAnimation?.cancel();
      snapAnimation = null;
      dragState = {
        pointerId: event.pointerId,
        pointerX: event.clientX,
        pointerY: event.clientY,
        startLeft: Number.parseFloat(target.style.left) || 0,
        startTop: Number.parseFloat(target.style.top) || 0,
        moved: false
      };
      orb.setPointerCapture?.(event.pointerId);
    });

    orb.addEventListener("pointermove", (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      const deltaX = event.clientX - dragState.pointerX;
      const deltaY = event.clientY - dragState.pointerY;
      if (!dragState.moved && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) return;
      dragState.moved = true;
      event.preventDefault();
      setCollapsedPanelState(target, { edge: "free", xRatio: 0, yRatio: 0 }, true);
      const { width, height } = viewportSize();
      const maxLeft = Math.max(0, width - ORB_SIZE);
      const maxTop = Math.max(0, height - ORB_SIZE);
      target.style.left = `${Math.min(maxLeft, Math.max(0, dragState.startLeft + deltaX))}px`;
      target.style.top = `${Math.min(maxTop, Math.max(0, dragState.startTop + deltaY))}px`;
    });

    const finishDrag = async (event, cancelled) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      const moved = dragState.moved;
      const dragCoordinates = {
        left: Number.parseFloat(target.style.left) || 0,
        top: Number.parseFloat(target.style.top) || 0
      };
      dragState = null;
      orb.releasePointerCapture?.(event.pointerId);
      if (!moved) return;
      event.preventDefault();
      if (cancelled) {
        applyOrbPosition(target, getOrbPosition(siteKey));
        return;
      }

      ignoreNextOrbClick = true;
      setTimeout(() => { ignoreNextOrbClick = false; }, 0);
      const { width, height } = viewportSize();
      const position = Core.snapOrbPosition(
        Number.parseFloat(target.style.left),
        Number.parseFloat(target.style.top),
        width,
        height,
        ORB_SIZE
      );
      const snapped = position.edge !== "free";
      const finalCoordinates = applyOrbPosition(target, position, false);
      if (snapped) {
        const animation = animateOrbSnap(target, dragCoordinates, finalCoordinates);
        snapAnimation = animation;
        if (animation) {
          try {
            await animation.finished;
          } catch {
            // 新的拖动会主动取消旧吸附动画。
          }
          if (snapAnimation !== animation) return;
          snapAnimation = null;
        }
      }
      setCollapsedPanelState(target, position);
      store = {
        ...store,
        uiState: {
          ...store.uiState,
          orbPositionBySite: { ...store.uiState.orbPositionBySite, [siteKey]: position }
        }
      };
      await sendRuntimeMessage({ type: "SET_ORB_POSITION", siteKey, position });
    };

    orb.addEventListener("pointerup", (event) => finishDrag(event, false));
    orb.addEventListener("pointercancel", (event) => finishDrag(event, true));
  }

  window.addEventListener?.("resize", () => {
    if (panel?.className.split(/\s+/).includes("collapsed") && panelSiteKey) {
      applyOrbPosition(panel, getOrbPosition(panelSiteKey));
    }
  });

  function button(text, className, onClick, title) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = className;
    element.textContent = text;
    if (title) element.title = title;
    element.addEventListener("click", onClick);
    return element;
  }

  function toggleButton(collapsed, onClick) {
    const label = collapsed ? "展开网页片段" : "收起网页片段";
    const element = button("", collapsed ? "orb" : "icon", onClick, label);
    element.setAttribute("aria-label", label);
    element.setAttribute("aria-expanded", String(!collapsed));
    if (collapsed) {
      const mark = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      mark.setAttribute("class", "orb-mark");
      mark.setAttribute("viewBox", "0 0 24 24");
      mark.setAttribute("aria-hidden", "true");
      const shell = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      shell.setAttribute("class", "mark-shell");
      shell.setAttribute("cx", "12");
      shell.setAttribute("cy", "12");
      shell.setAttribute("r", "10");
      mark.append(shell);
      const glyph = document.createElementNS("http://www.w3.org/2000/svg", "path");
      glyph.setAttribute("class", "mark-glyph");
      glyph.setAttribute("d", "M21 12c-6.597 0-9 2.403-9 9 0-6.597-2.403-9-9-9 6.597 0 9-2.403 9-9 0 6.597 2.403 9 9 9");
      mark.append(glyph);
      const center = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      center.setAttribute("class", "mark-center");
      center.setAttribute("cx", "12");
      center.setAttribute("cy", "12");
      center.setAttribute("r", "1.45");
      mark.append(center);
      element.append(mark);
      return element;
    }
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "m9 18 6-6-6-6");
    svg.append(path);
    element.append(svg);
    return element;
  }

  function hideButton(onClick) {
    const label = "完全隐藏网页片段";
    const element = button("", "icon", onClick, label);
    element.setAttribute("aria-label", label);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    for (const pathData of ["M18 6 6 18", "M6 6l12 12"]) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathData);
      svg.append(path);
    }
    element.append(svg);
    return element;
  }

  function toast(message) {
    const notice = document.createElement("div");
    notice.className = "toast";
    notice.textContent = message;
    shadow.append(notice);
    setTimeout(() => notice.remove(), 2400);
  }

  async function refresh() {
    const response = await sendRuntimeMessage({ type: "GET_STORE" });
    if (!response?.ok) return;
    store = response.store;
    renderPanel();
  }

  async function removeSnippet(snippet) {
    if (!window.confirm(`删除片段“${snippet.name}”？`)) return;
    const response = await sendRuntimeMessage({ type: "DELETE_SNIPPET", id: snippet.id });
    toast(response?.ok ? "片段已删除" : "删除失败");
  }

  async function useSnippet(snippet) {
    const result = await Capture.fillOrCopy(snippet.content);
    if (result.mode === "filled") toast("已填入当前编辑器");
    else if (result.mode === "copied") toast("该编辑器不支持回填，已复制到剪贴板");
    else toast("回填和复制均失败");
  }

  function renderPanel() {
    panel?.remove();
    panel = null;
    panelSiteKey = null;
    if (overlayHidden) return;
    const locationInfo = Core.parsePageLocation(location.href);
    const snippets = Core.sortForPage(store.snippets.filter((item) => Core.matchesPage(item, location.href)));
    if (!snippets.length && !store.settings.showOverlayWhenNoMatch && !dialogOpen) return;

    const collapsed = typeof store.uiState.collapsed === "boolean"
      ? store.uiState.collapsed
      : Boolean(store.uiState.collapsedBySite[locationInfo.siteKey]);
    panel = document.createElement("section");
    panelSiteKey = locationInfo.siteKey;
    panel.className = collapsed ? "panel collapsed" : "panel";
    panel.setAttribute("aria-label", "网页片段");
    const collapse = toggleButton(collapsed, async () => {
      if (collapsed && ignoreNextOrbClick) {
        ignoreNextOrbClick = false;
        return;
      }
      await sendRuntimeMessage({ type: "SET_COLLAPSED", siteKey: locationInfo.siteKey, collapsed: !collapsed });
    });
    if (collapsed) {
      applyOrbPosition(panel, getOrbPosition(locationInfo.siteKey));
      makeOrbDraggable(collapse, panel, locationInfo.siteKey);
      panel.append(collapse);
      shadow.append(panel);
      return;
    }

    const head = document.createElement("header");
    head.className = "head";
    const mark = document.createElement("span");
    mark.className = "mark";
    const title = document.createElement("div");
    title.className = "title";
    const strong = document.createElement("strong");
    strong.textContent = "网页片段";
    const subtitle = document.createElement("span");
    subtitle.textContent = locationInfo.siteKey;
    title.append(strong, subtitle);
    const hide = hideButton(() => setOverlayHidden(true));
    const headActions = document.createElement("div");
    headActions.className = "head-actions";
    headActions.append(hide, collapse);
    head.append(mark, title, headActions);

    const body = document.createElement("div");
    body.className = "body";
    if (!snippets.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "当前站点暂无片段";
      body.append(empty);
    } else {
      for (const snippet of snippets) {
        const row = document.createElement("div");
        row.className = "row";
        const name = button(snippet.name, "name", () => useSnippet(snippet));
        const scope = document.createElement("span");
        scope.className = "scope";
        scope.textContent = snippet.scope === "page" ? "本页" : "整站";
        name.append(scope);
        row.append(
          name,
          button("复制", "mini", async () => {
            toast((await Capture.copyText(snippet.content)) ? "已复制" : "复制失败");
          }),
          button("删除", "mini danger", () => removeSnippet(snippet))
        );
        body.append(row);
      }
    }

    const actions = document.createElement("footer");
    actions.className = "actions";
    actions.append(
      button("保存当前", "primary", async () => {
        try {
          openSaveDialog(await Capture.captureCurrent("", { preferFocusedField: true }));
        } catch (error) {
          toast(error.message);
        }
      }),
      button("管理全部", "secondary", () => sendRuntimeMessage({ type: "OPEN_MANAGER" }))
    );
    panel.append(head, body, actions);
    shadow.append(panel);
  }

  function setOverlayHidden(hidden) {
    overlayHidden = Boolean(hidden);
    renderPanel();
    return overlayHidden;
  }

  function toggleVisibility() {
    return setOverlayHidden(!overlayHidden);
  }

  function openSaveDialog(draft) {
    dialogOpen = true;
    const backdrop = document.createElement("div");
    backdrop.className = "dialog-backdrop";
    const form = document.createElement("form");
    form.className = "dialog";
    const heading = document.createElement("h2");
    heading.textContent = "保存为片段";
    const nameLabel = document.createElement("label");
    nameLabel.textContent = "名称";
    const nameInput = document.createElement("input");
    nameInput.maxLength = 120;
    nameInput.required = true;
    nameInput.placeholder = "例如：订单日对账";
    const scopeLabel = document.createElement("label");
    scopeLabel.textContent = "使用范围";
    const scopeSelect = document.createElement("select");
    for (const [value, text] of [["site", "当前站点"], ["page", "仅当前页面"]]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      scopeSelect.append(option);
    }
    const contentLabel = document.createElement("label");
    contentLabel.textContent = "内容";
    const preview = document.createElement("textarea");
    preview.value = draft.content;
    const actions = document.createElement("div");
    actions.className = "dialog-actions";
    const close = () => {
      dialogOpen = false;
      backdrop.remove();
      renderPanel();
    };
    actions.append(button("取消", "secondary", close));
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "primary";
    submit.textContent = "保存";
    actions.append(submit);
    form.append(heading, nameLabel, nameInput, scopeLabel, scopeSelect, contentLabel, preview, actions);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const message = {
        type: "UPSERT_SNIPPET",
        payload: { name: nameInput.value, content: preview.value, pageUrl: draft.pageUrl, scope: scopeSelect.value }
      };
      let response = await sendRuntimeMessage(message);
      if (response?.code === "DUPLICATE" && window.confirm("当前范围已有同名片段，是否覆盖？")) {
        response = await sendRuntimeMessage({ ...message, overwrite: true });
      }
      if (response?.ok) {
        close();
        toast("片段已保存");
      } else if (response?.code !== "DUPLICATE") {
        toast(response?.error || "保存失败");
      }
    });
    backdrop.append(form);
    shadow.append(backdrop);
    nameInput.focus();
  }

  root.SnippetOverlay = { refresh, openSaveDialog, toast, toggleVisibility };
})(self);
