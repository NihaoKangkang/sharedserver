"use strict";

const $ = (selector) => document.querySelector(selector);
const elements = {
  connection: $("#connection"),
  text: $("#shared-text"),
  count: $("#character-count"),
  copyShared: $("#copy-shared"),
  textLimit: $("#text-limit"),
  clipboardHelp: $("#clipboard-help"),
  sendDraft: $("#send-draft"),
  submitText: $("#submit-text"),
  refreshFiles: $("#refresh-files"),
  uploadHelp: $("#upload-help"),
  breadcrumbs: $("#breadcrumbs"),
  fileList: $("#file-list"),
  empty: $("#empty-state"),
  chooseFiles: $("#choose-files"),
  fileInput: $("#file-input"),
  dropZone: $("#drop-zone"),
  uploadList: $("#upload-list"),
  newFolder: $("#new-folder"),
  folderDialog: $("#folder-dialog"),
  folderForm: $("#folder-form"),
  folderName: $("#folder-name"),
  cancelFolder: $("#cancel-folder"),
  toast: $("#toast"),
  selectAll: $("#select-all"),
  downloadZip: $("#download-zip"),
  selectionToolbar: $("#selection-toolbar"),
  fileTable: $("#file-table"),
  overlay: $("#page-drop-overlay"),
  imageDialog: $("#image-dialog"),
  imagePreview: $("#image-preview"),
  imageTitle: $("#image-title"),
  imageDownload: $("#image-download"),
  closeImage: $("#close-image"),
  sharedImage: $("#shared-image"),
  sharedImagePreview: $("#shared-image-preview"),
  viewSharedImage: $("#view-shared-image"),
};
const iconPaths = {
  layers: ["m12 3 9 5-9 5-9-5Z", "m3 12 9 5 9-5", "m3 16 9 5 9-5"],
  folder: ["M3 7V5h6l2 2h10v13H3Z"],
  "folder-plus": ["M3 7V5h6l2 2h10v13H3Z", "M12 10v7m-3-3h6"],
  file: ["M5 3h9l5 5v13H5Z", "M14 3v6h5"],
  code: ["M8 8 4 12l4 4m8-8 4 4-4 4m-3-11-2 14"],
  image: ["M3 3h18v18H3Z", "m3 16 5-5 8 10m-3-8 3-3 5 6", "M15 7h.01"],
  media: ["M4 3h16v18H4Z", "m10 8 6 4-6 4Z"],
  archive: ["M4 3h16v18H4Z", "M10 3v3h4v3h-4v3h4v4h-4"],
  download: ["M12 3v12m-5-5 5 5 5-5", "M4 16v5h16v-5"],
  upload: ["M12 16V4m-5 5 5-5 5 5", "M4 16v5h16v-5"],
  copy: ["M9 9h12v12H9Z", "M15 5V3H3v12h2"],
  search: ["M16 16l5 5", "M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0"],
  refresh: [
    "M20 7V3m0 4h-4",
    "M4 17v4m0-4h4",
    "M20 7A9 9 0 0 0 4 5m0 12a9 9 0 0 0 16 2",
  ],
  eye: [
    "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z",
    "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  ],
  more: ["M5 12h.01M12 12h.01M19 12h.01"],
  close: ["m6 6 12 12M6 18 18 6"],
  zap: ["m13 2-9 12h7l-1 8 10-13h-8Z"],
  help: [
    "M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 3h.01",
    "M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0",
  ],
  sun: [
    "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
    "M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1",
  ],
  chevron: ["m6 9 6 6 6-6"],
  qr: [
    "M3 3h6v6H3ZM15 3h6v6h-6ZM3 15h6v6H3Z",
    "M15 15h3v3h3v3h-6Zm6-3h-3m-6 0v3m0-12v3",
  ],
};
function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  for (const d of iconPaths[name] || iconPaths.file) {
    const path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}
for (const node of document.querySelectorAll("[data-icon]")) {
  if (node.className) node.replaceChildren(icon(node.dataset.icon));
  else node.replaceWith(icon(node.dataset.icon));
}
function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function button(label, action, accessibleLabel = label, symbol) {
  const el = node("button", "button", symbol ? undefined : label);
  el.type = "button";
  el.setAttribute("aria-label", accessibleLabel);
  el.title = accessibleLabel;
  if (symbol) {
    el.classList.add("icon-button");
    el.append(icon(symbol));
  }
  el.addEventListener("click", action);
  return el;
}
let currentPath = "",
  socket,
  reconnectDelay = 500,
  settings,
  localDraft = false,
  sequence = 0,
  editVersion = 0,
  sentVersion = -1,
  sentContent = "",
  pendingAck = false,
  directoryRequest = 0,
  failedDirectory = null;
const utf8 = new TextEncoder(),
  baseUrl = new URL("./", location.href),
  selectedFiles = new Set();
let listedFiles = [],
  directoryEntries = [],
  sharedImagePath,
  activeWorkspace = "files",
  toastTimer,
  toastRemaining = 0,
  toastStarted = 0;
const panelScroll = { files: 0, clipboard: 0 };
function serverUrl(path) {
  return new URL(path.replace(/^\//, ""), baseUrl).href;
}
function pathParams(path) {
  return new URLSearchParams({ path });
}
function downloadUrl(path) {
  return serverUrl(`api/download?${pathParams(path)}`);
}
function formatSize(bytes) {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (!bytes) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  const i = Math.max(
    0,
    Math.min(4, Math.floor(Math.log(bytes) / Math.log(1024))),
  );
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}
function showToast(message, kind = "info") {
  if (typeof kind === "boolean") kind = kind ? "error" : "success";
  clearTimeout(toastTimer);
  toastTimer = undefined;
  const host =
    document.querySelector("dialog[open] .dialog-body, dialog[open] form") ||
    document.body;
  host.append(elements.toast);
  elements.toast.replaceChildren(
    node("span", "toast-kind", kind),
    node("span", "toast-message", message),
    button(
      "Dismiss notification",
      () => {
        elements.toast.hidden = true;
        clearTimeout(toastTimer);
      },
      "Dismiss notification",
      "close",
    ),
  );
  elements.toast.className = `toast ${kind}`;
  elements.toast.hidden = false;
  elements.toast.setAttribute("role", kind === "error" ? "alert" : "status");
  elements.toast.setAttribute(
    "aria-live",
    kind === "error" ? "assertive" : "polite",
  );
  toastRemaining = kind === "error" || kind === "warning" ? 10000 : 4000;
  resumeToast();
}
function resumeToast() {
  if (
    elements.toast.hidden ||
    elements.toast.matches(":hover") ||
    elements.toast.contains(document.activeElement) ||
    toastTimer !== undefined
  )
    return;
  toastStarted = performance.now();
  toastTimer = setTimeout(
    () => {
      toastTimer = undefined;
      elements.toast.hidden = true;
    },
    Math.max(0, toastRemaining),
  );
}
function pauseToast() {
  if (toastTimer === undefined) return;
  clearTimeout(toastTimer);
  toastTimer = undefined;
  toastRemaining = Math.max(
    0,
    toastRemaining - (performance.now() - toastStarted),
  );
}
elements.toast.addEventListener("mouseenter", pauseToast);
elements.toast.addEventListener("mouseleave", resumeToast);
elements.toast.addEventListener("focusin", pauseToast);
elements.toast.addEventListener("focusout", () => queueMicrotask(resumeToast));
async function api(url, options) {
  const response = await fetch(serverUrl(url), options);
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      message = (await response.json()).detail || message;
    } catch (_) {}
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return response;
}
const dialogTriggers = new WeakMap();
let dialogGeneration = 0;
function openDialog(dialog) {
  closeMenus();
  if (dialog.open) return;
  const active = document.activeElement;
  const closedMenu = active?.closest("details:not([open])");
  dialogTriggers.set(dialog, closedMenu?.querySelector("summary") || active);
  dialogGeneration++;
  dialog.showModal();
  updateSticky();
}
function closeDialog(dialog) {
  if (dialog.id === "share-dialog") clearSharing();
  dialog.close();
}
for (const dialog of document.querySelectorAll("dialog"))
  dialog.addEventListener("close", () => {
    dialogGeneration++;
    if (dialog.contains(elements.toast)) {
      elements.toast.hidden = true;
      document.body.append(elements.toast);
    }
    const trigger = dialogTriggers.get(dialog);
    if (trigger?.isConnected && trigger.getClientRects().length)
      trigger.focus({ preventScroll: true });
    else $(".brand").focus({ preventScroll: true });
  });
for (const control of document.querySelectorAll("[data-close]"))
  control.addEventListener("click", () =>
    closeDialog(document.getElementById(control.dataset.close)),
  );
function closeMenus(except) {
  if (innerWidth < 768 && except !== $("#header-actions"))
    $("#header-actions").open = false;
  for (const menu of document.querySelectorAll(".more-actions[open]"))
    if (menu !== except) menu.open = false;
}
document.addEventListener("click", (event) => {
  if (!event.target.closest(".more-actions, #header-actions")) closeMenus();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !document.querySelector("dialog[open]")) {
    const menu =
      document.querySelector(".more-actions[open]") ||
      (innerWidth < 768 && $("#header-actions").open
        ? $("#header-actions")
        : null);
    if (menu) {
      menu.open = false;
      menu.querySelector("summary").focus();
      event.preventDefault();
    }
  }
});
function applyWorkspace(scroll = false) {
  const menu = $("#header-actions"),
    mobile = String(innerWidth < 768);
  if (menu.dataset.mobile !== mobile) {
    menu.open = mobile === "false";
    menu.dataset.mobile = mobile;
  }
  const desktop = innerWidth >= 1024;
  for (const name of ["files", "clipboard"]) {
    const active = name === activeWorkspace;
    const panel = $(`#${name}-panel`),
      tab = $(`#tab-${name}`);
    panel.hidden = !desktop && !active;
    panel.inert = !desktop && !active;
    panel.setAttribute("role", desktop ? "region" : "tabpanel");
    panel.setAttribute(
      "aria-labelledby",
      desktop ? `${name}-title` : `tab-${name}`,
    );
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  }
  if (scroll && !desktop)
    window.scrollTo({ top: panelScroll[activeWorkspace] || 0 });
  updateSticky();
}
function showWorkspace(name, scroll = false) {
  if (name === activeWorkspace) return;
  panelScroll[activeWorkspace] = scrollY;
  activeWorkspace = name;
  applyWorkspace(scroll);
}
for (const name of ["files", "clipboard"])
  $(`#tab-${name}`).addEventListener("click", () => showWorkspace(name, true));
$(".workspace-tabs").addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const name =
    event.key === "Home"
      ? "files"
      : event.key === "End"
        ? "clipboard"
        : activeWorkspace === "files"
          ? "clipboard"
          : "files";
  showWorkspace(name);
  $(`#tab-${name}`).focus();
});
let stickyFrame;
function updateSticky() {
  cancelAnimationFrame(stickyFrame);
  stickyFrame = requestAnimationFrame(() => {
    const height = $(".topbar").getBoundingClientRect().height;
    document.documentElement.style.setProperty(
      "--header-height",
      `${height}px`,
    );
    $("#files-panel").classList.toggle(
      "compact-actions",
      $(".table-wrap").clientWidth <= 520,
    );
    const visibleHeight = window.visualViewport?.height || innerHeight;
    $("#clipboard-panel").classList.toggle(
      "stickable",
      innerWidth >= 1024 &&
        visibleHeight > 500 &&
        $("#clipboard-panel").offsetHeight <= visibleHeight - height - 32,
    );
    if (visibleHeight < 400) {
      $("#upload-list").hidden = true;
      $("#toggle-queue").setAttribute("aria-expanded", "false");
    }
    for (const dialog of document.querySelectorAll("dialog")) {
      dialog.style.maxHeight = `${Math.max(120, visibleHeight - 24)}px`;
      const viewport = window.visualViewport;
      if (viewport && viewport.height < innerHeight - 100) {
        dialog.style.maxWidth = `${Math.max(100, viewport.width - 24)}px`;
        dialog.style.top = `${viewport.offsetTop + 12}px`;
        dialog.style.left = `${viewport.offsetLeft + Math.max(12, (viewport.width - dialog.getBoundingClientRect().width) / 2)}px`;
        dialog.style.right = "auto";
        dialog.style.bottom = "auto";
        dialog.style.margin = "0";
      } else {
        for (const property of [
          "max-width",
          "top",
          "left",
          "right",
          "bottom",
          "margin",
        ])
          dialog.style.removeProperty(property);
      }
    }
  });
}
window.addEventListener("resize", () => applyWorkspace());
window.visualViewport?.addEventListener("resize", updateSticky);
if (window.ResizeObserver) {
  const observer = new ResizeObserver(updateSticky);
  observer.observe($(".topbar"));
  observer.observe($("#clipboard-panel"));
  observer.observe($("#files-panel"));
  const queueObserver = new ResizeObserver(() =>
    document.documentElement.style.setProperty(
      "--queue-height",
      `${$("#transfer-queue").offsetHeight}px`,
    ),
  );
  queueObserver.observe($("#transfer-queue"));
}
$("#theme-select").value = themePreference;
$("#theme-select").addEventListener("change", (event) => {
  themePreference = event.target.value;
  preferences.set("theme", themePreference);
  if (innerWidth < 768) $("#header-actions").open = false;
  applyTheme();
});
applyWorkspace();

function setConnection(state, label) {
  elements.connection.className = `connection ${state}`;
  elements.connection.lastElementChild.textContent = label;
}
function syncStatus(label) {
  $("#sync-status").textContent = label;
}
function syncControls() {
  const same =
    pendingAck &&
    sentVersion === editVersion &&
    sentContent === elements.text.value;
  const unavailable =
    !settings?.can_write_text || socket?.readyState !== WebSocket.OPEN;
  $("#sync-text").disabled = unavailable || same;
  elements.submitText.disabled = unavailable || same;
  elements.sendDraft.disabled = unavailable || same;
}
function connectClipboard() {
  const address = new URL("ws", baseUrl);
  address.protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const client = new WebSocket(address);
  socket = client;
  setConnection("pending", "Connecting");
  client.addEventListener("open", () => {
    if (socket !== client) return;
    reconnectDelay = 500;
    pendingAck = false;
    syncControls();
    setConnection("online", "Live sync connected");
  });
  client.addEventListener("message", (event) => {
    if (socket !== client) return;
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (_) {
      return;
    }
    if (message.type === "clipboard") {
      elements.text.disabled = false;
      elements.text.readOnly = !settings.can_write_text;
      if (localDraft) {
        elements.sendDraft.hidden = !settings.can_write_text;
        showToast("Your unsent draft was preserved. Send it when ready.");
        syncStatus("Unsent draft preserved");
      } else if (settings.can_read) {
        elements.text.value = message.content;
        syncStatus(`Received from server · ${new Date().toLocaleTimeString()}`);
      }
      updateCount();
      syncControls();
    } else if (message.type === "ack" && message.id === sequence) {
      pendingAck = false;
      const unchanged =
        sentVersion === editVersion && sentContent === elements.text.value;
      localDraft = !unchanged;
      elements.sendDraft.hidden = unchanged || !settings.can_write_text;
      syncStatus(
        unchanged
          ? `Confirmed · ${new Date().toLocaleTimeString()}`
          : "New draft not yet confirmed",
      );
      if (!settings.can_read && unchanged) {
        elements.text.value = "";
        editVersion++;
        updateCount();
        showToast("Text submitted to the inbox", "success");
      } else if (!settings.can_read)
        showToast("Previous text submitted. Your new draft was preserved.");
      syncControls();
    } else if (message.type === "image" && settings.can_read) {
      sharedImagePath = message.path;
      showSharedImage(message.path);
    } else if (message.type === "error") {
      pendingAck = false;
      syncControls();
      syncStatus("Not confirmed — review the error");
      showToast(message.message, "error");
    }
  });
  client.addEventListener("close", (event) => {
    if (socket !== client) return;
    pendingAck = false;
    syncControls();
    setConnection(
      "offline",
      event.code === 1008
        ? "Access denied — reload using the terminal link"
        : "Connection lost, retrying",
    );
    syncStatus(localDraft ? "Offline · draft preserved" : "Offline");
    if (event.code === 1008) return;
    setTimeout(() => {
      if (socket === client) connectClipboard();
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 8000);
  });
  client.addEventListener("error", () => client.close());
}
function updateCount() {
  const value = elements.text.value,
    count = utf8.encode(value).length;
  elements.count.textContent = `${formatSize(count)} / ${formatSize(settings?.max_text_size || 0)}`;
  $("#text-statistics").textContent =
    `${Array.from(value).length} Characters · ${value ? value.split("\n").length : 0} lines`;
  elements.text.setAttribute(
    "aria-invalid",
    String(count > (settings?.max_text_size || Infinity)),
  );
}
function sendText(manual = false) {
  if (!settings?.can_write_text) return;
  updateCount();
  localDraft = true;
  if (!settings.can_read && manual !== true) {
    syncStatus("Draft · click Submit text to send");
    syncControls();
    return;
  }
  if (utf8.encode(elements.text.value).length > settings.max_text_size) {
    syncStatus("Too large · not sent");
    showToast(
      `Text is too large. Limit: ${formatSize(settings.max_text_size)} of UTF-8 text.`,
      "error",
    );
    return;
  }
  if (socket?.readyState === WebSocket.OPEN) {
    if (
      pendingAck &&
      sentVersion === editVersion &&
      sentContent === elements.text.value
    )
      return;
    sentVersion = editVersion;
    sentContent = elements.text.value;
    pendingAck = true;
    socket.send(
      JSON.stringify({
        type: "clipboard",
        content: sentContent,
        id: ++sequence,
      }),
    );
    syncStatus("Sending · waiting for confirmation");
  } else {
    elements.sendDraft.hidden = false;
    syncStatus("Offline · draft preserved");
  }
  syncControls();
}
elements.text.addEventListener("input", (event) => {
  editVersion++;
  localDraft = true;
  updateCount();
  syncControls();
  if (!event.isComposing) sendText();
});
elements.text.addEventListener("compositionend", () => sendText());
elements.sendDraft.addEventListener("click", () => sendText(true));
elements.submitText.addEventListener("click", () => sendText(true));
$("#sync-text").addEventListener("click", () => sendText(true));
for (const [id, pref, defaultValue] of [
  ["monospace-toggle", "monospace", "true"],
  ["wrap-toggle", "wrap", "true"],
]) {
  const control = $(`#${id}`);
  control.checked = preferences.get(pref, defaultValue) === "true";
  const apply = () => {
    elements.text.classList.toggle(
      pref === "wrap" ? "no-wrap" : "system-font",
      !control.checked,
    );
  };
  apply();
  control.addEventListener("change", () => {
    preferences.set(pref, String(control.checked));
    apply();
  });
}
let clearSnapshot;
$("#clear-text").addEventListener("click", () => {
  if (!settings?.can_write_text) return;
  clearSnapshot = { content: elements.text.value, version: editVersion };
  $("#clear-explanation").textContent = settings.can_read
    ? "This clears the shared text on all connected devices. It cannot be undone."
    : "Discard this local draft? Submitted inbox files will stay on the server.";
  openDialog($("#clear-dialog"));
});
$("#confirm-clear").addEventListener("click", () => {
  if (
    clearSnapshot.content !== elements.text.value ||
    clearSnapshot.version !== editVersion
  ) {
    closeDialog($("#clear-dialog"));
    showToast(
      "Text changed while confirmation was open. Review it and try again.",
      "warning",
    );
    return;
  }
  elements.text.value = "";
  editVersion++;
  updateCount();
  closeDialog($("#clear-dialog"));
  if (settings.can_read) sendText(true);
  else {
    localDraft = false;
    elements.sendDraft.hidden = true;
    syncStatus("Local draft cleared");
  }
});
async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {}
  }
  const focused = document.activeElement,
    selection =
      focused instanceof HTMLTextAreaElement ||
      focused instanceof HTMLInputElement
        ? { start: focused.selectionStart, end: focused.selectionEnd }
        : null;
  const range = window.getSelection()?.rangeCount
    ? window.getSelection().getRangeAt(0).cloneRange()
    : null;
  const helper = node("textarea", "sr-only");
  helper.value = text;
  (
    document.querySelector("dialog[open] .dialog-body,dialog[open] form") ||
    document.body
  ).append(helper);
  let copied = false;
  try {
    helper.focus();
    helper.select();
    helper.setSelectionRange(0, text.length);
    copied = document.execCommand("copy");
  } catch (_) {
  } finally {
    helper.remove();
    focused?.focus({ preventScroll: true });
    if (selection) {
      try {
        focused.setSelectionRange(selection.start, selection.end);
      } catch (_) {}
    } else if (range) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
  if (!copied) {
    $("#manual-copy-text").value = text;
    openDialog($("#manual-copy-dialog"));
    $("#manual-copy-text").select();
    showToast(
      "Automatic copy is unavailable. Select and copy the text manually.",
      "warning",
    );
  }
  return copied;
}
async function copyAndNotify(text, message) {
  if (await copyTextToClipboard(text)) showToast(message, "success");
}
elements.copyShared.addEventListener("click", () =>
  copyAndNotify(elements.text.value, "Text copied"),
);
$("#manual-copy-dialog").addEventListener("close", () => {
  $("#manual-copy-text").value = "";
});
$("#copy-path").addEventListener("click", () =>
  copyAndNotify(currentPath || ".", "Relative path copied"),
);
$("#open-help").addEventListener("click", () => openDialog($("#help-dialog")));
function isEditing(target) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        "input,textarea,select,[contenteditable]:not([contenteditable='false'])",
      ),
    )
  );
}
document.addEventListener("keydown", (event) => {
  if (event.isComposing) return;
  const modal = document.querySelector("dialog[open]");
  if (event.key === "?" && !isEditing(event.target) && !modal) {
    event.preventDefault();
    openDialog($("#help-dialog"));
    return;
  }
  if (
    !(event.ctrlKey || event.metaKey) ||
    !["s", "Enter"].includes(event.key) ||
    modal
  )
    return;
  const inEditor = event.target === elements.text;
  const panelVisible = innerWidth >= 1024 || activeWorkspace === "clipboard";
  if (
    (inEditor || (panelVisible && !isEditing(event.target))) &&
    settings?.can_write_text
  ) {
    event.preventDefault();
    sendText(true);
  }
});

function renderBreadcrumbs(path) {
  const focused = elements.breadcrumbs.contains(document.activeElement);
  elements.breadcrumbs.replaceChildren();
  const crumbs = [{ name: "Shared folder", path: "" }];
  let built = "";
  for (const name of path ? path.split("/") : []) {
    built = built ? `${built}/${name}` : name;
    crumbs.push({ name, path: built });
  }
  crumbs.forEach((crumb, index) => {
    if (index) elements.breadcrumbs.append(node("span", "", "/"));
    const el = button(crumb.name, () =>
      loadDirectory(crumb.path, { navigate: true }),
    );
    el.className = "breadcrumb";
    if (index === crumbs.length - 1)
      el.setAttribute("aria-current", "location");
    elements.breadcrumbs.append(el);
  });
  $("#folder-context").textContent =
    `Current folder: ${path || "Shared folder"}`;
  if (focused) $("#files-title").focus({ preventScroll: true });
}
function fileIcon(entry) {
  if (entry.is_directory) return "folder";
  if (entry.copy_kind === "image") return "image";
  if (entry.copy_kind === "text") return "code";
  if (/\.(zip|tar|gz|7z|rar)$/i.test(entry.name)) return "archive";
  if (/\.(mp4|mov|mp3|wav|webm|ogg)$/i.test(entry.name)) return "media";
  return "file";
}
function visibleEntries() {
  const query = $("#file-search").value.toLocaleLowerCase();
  const [field, direction] = $("#file-sort").value.split("-");
  const sign = direction === "asc" ? 1 : -1;
  return directoryEntries
    .filter((entry) => entry.name.toLocaleLowerCase().includes(query))
    .sort((a, b) => {
      if (a.is_directory !== b.is_directory) return a.is_directory ? -1 : 1;
      let comparison = 0;
      if (!a.is_directory && field === "size") comparison = a.size - b.size;
      else if (!a.is_directory && field === "modified")
        comparison = new Date(a.modified) - new Date(b.modified);
      else comparison = a.name.localeCompare(b.name);
      return (
        comparison * (a.is_directory ? 1 : sign) ||
        a.name.localeCompare(b.name) ||
        a.path.localeCompare(b.path)
      );
    });
}
function moreMenu(entry) {
  const details = node("details", "more-actions"),
    summary = node("summary", "button icon-button");
  summary.setAttribute("aria-label", `More actions for ${entry.name}`);
  summary.title = "More actions";
  summary.append(icon("more"));
  const menu = node("div", "action-menu");
  function runAction(action) {
    if (details.contains(document.activeElement))
      summary.focus({ preventScroll: true });
    details.open = false;
    action();
  }
  if (entry.copy_kind)
    menu.append(
      button(
        "Preview",
        () => runAction(() => previewEntry(entry)),
        `Preview ${entry.name}`,
      ),
    );
  if (entry.copy_kind === "text")
    menu.append(
      button("Copy file text", () => runAction(() => copyFileText(entry.path))),
    );
  if (entry.copy_kind === "image")
    menu.append(
      button("Copy image", () => runAction(() => copyImage(entry.path))),
    );
  menu.append(
    button(
      "Copy curl",
      () => runAction(() => copyCurl(entry)),
      `Copy curl for ${entry.name}`,
    ),
  );
  details.append(summary, menu);
  details.addEventListener("toggle", () => {
    summary.setAttribute("aria-expanded", String(details.open));
    if (details.open) {
      closeMenus(details);
      const box = summary.getBoundingClientRect();
      const height = Math.min(
        menu.scrollHeight,
        (window.visualViewport?.height || innerHeight) - 24,
      );
      menu.style.position = "fixed";
      menu.style.right = "auto";
      menu.style.left = `${Math.max(8, Math.min(box.right - 176, document.documentElement.clientWidth - 184))}px`;
      menu.style.top = `${Math.max(8, box.bottom + height + 8 > (window.visualViewport?.height || innerHeight) ? box.top - height - 4 : box.bottom + 4)}px`;
      menu.style.maxHeight = `${Math.max(88, (window.visualViewport?.height || innerHeight) - 24)}px`;
      menu.style.overflowY = "auto";
    }
  });
  return details;
}
function renderEntry(entry) {
  const row = node("tr"),
    selection = node("td", "select-cell"),
    nameCell = node("td", "name-cell"),
    nameContent = node("div", "name-content");
  row.dataset.path = entry.path;
  if (!entry.is_directory) {
    const label = node("label", "check-target"),
      select = node("input", "file-select");
    select.type = "checkbox";
    select.dataset.path = entry.path;
    select.checked = selectedFiles.has(entry.path);
    select.setAttribute("aria-label", `Select ${entry.name}`);
    label.title = `Select ${entry.name}`;
    select.addEventListener("change", () => {
      if (select.checked && selectedFiles.size >= 200) {
        select.checked = false;
        showToast("Select up to 200 files per ZIP.", "warning");
        return;
      }
      select.checked
        ? selectedFiles.add(entry.path)
        : selectedFiles.delete(entry.path);
      updateSelection();
    });
    label.append(select);
    selection.append(label);
  }
  const image = icon(fileIcon(entry));
  image.classList.add("file-icon");
  nameContent.append(image);
  if (entry.is_directory) {
    const link = button(entry.name, () =>
      loadDirectory(entry.path, { navigate: true }),
    );
    link.className = "folder-link";
    nameContent.append(link);
  } else nameContent.append(node("span", "entry-name", entry.name));
  nameCell.append(nameContent);
  const size = node(
      "td",
      "size-cell",
      formatSize(entry.is_directory ? null : entry.size),
    ),
    date = node("td", "date-cell"),
    time = node("time");
  time.dateTime = entry.modified;
  time.textContent = new Date(entry.modified).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  date.append(time);
  const actions = node("td", "actions"),
    actionList = node("div", "action-list");
  if (!entry.is_directory) {
    const download = node("a", "button primary download-link row-download");
    download.href = downloadUrl(entry.path);
    download.setAttribute("aria-label", `Download ${entry.name}`);
    download.title = `Download ${entry.name}`;
    download.append(icon("download"), node("span", "action-label", "Download"));
    const extras = node("div", "secondary-actions");
    if (entry.copy_kind) {
      const preview = button(
        "Preview",
        () => previewEntry(entry),
        `Preview ${entry.name}`,
        "eye",
      );
      preview.classList.add("preview-action");
      extras.append(preview);
    }
    extras.append(moreMenu(entry));
    actionList.append(download, extras);
  }
  actions.append(actionList);
  row.setAttribute("role", "row");
  for (const [cell, label] of [
    [selection, "Selection"],
    [nameCell, entry.is_directory ? "Folder" : "File"],
    [size, "Size"],
    [date, "Modified"],
    [actions, "Actions"],
  ]) {
    cell.setAttribute("role", "cell");
    cell.setAttribute(
      "aria-label",
      `${label}: ${cell === nameCell ? entry.name : cell === size ? size.textContent : cell === date ? time.textContent : entry.name}`,
    );
  }
  row.append(selection, nameCell, size, date, actions);
  return row;
}
function renderListing() {
  const focused = document.activeElement;
  const focusedRow = focused?.closest("#file-list tr");
  const focusIndex = focusedRow
    ? [...focusedRow.querySelectorAll("button,a,input,summary")].indexOf(
        focused,
      )
    : -1;
  const entries = visibleEntries();
  listedFiles = entries.filter((entry) => !entry.is_directory);
  elements.fileList.replaceChildren(...entries.map(renderEntry));
  elements.empty.hidden = entries.length !== 0;
  $("#empty-message").textContent = directoryEntries.length
    ? "No results"
    : "This folder is empty";
  $("#clear-filter").hidden = !$("#file-search").value;
  const total = directoryEntries.filter((entry) => !entry.is_directory).length;
  $("#file-count").textContent =
    `${listedFiles.length} / ${total} files · ${directoryEntries.filter((entry) => entry.is_directory).length} folders`;
  $("#files-tab-label").textContent = `Files (${total})`;
  updateSelection();
  if (focusedRow) {
    const replacement = [...elements.fileList.children].find(
      (row) => row.dataset.path === focusedRow.dataset.path,
    );
    const target = replacement?.querySelectorAll("button,a,input,summary")[
      focusIndex
    ];
    const closedMenu = target?.closest("details:not([open])");
    (closedMenu?.querySelector("summary") || target || $("#files-title")).focus(
      {
        preventScroll: true,
      },
    );
  }
}
function updateSelection() {
  elements.downloadZip.disabled = !settings?.can_read || !selectedFiles.size;
  elements.downloadZip.textContent = `Download ZIP (${selectedFiles.size})`;
  elements.selectAll.checked =
    listedFiles.length > 0 &&
    listedFiles.every((entry) => selectedFiles.has(entry.path));
  elements.selectAll.indeterminate =
    selectedFiles.size > 0 && !elements.selectAll.checked;
  for (const select of elements.fileList.querySelectorAll(".file-select"))
    select.checked = selectedFiles.has(select.dataset.path);
}
$("#file-search").addEventListener("input", () => {
  const visible = new Set(
    visibleEntries()
      .filter((entry) => !entry.is_directory)
      .map((entry) => entry.path),
  );
  let removed = 0;
  for (const path of selectedFiles)
    if (!visible.has(path)) {
      selectedFiles.delete(path);
      removed++;
    }
  renderListing();
  if (removed)
    showToast(
      `${removed} hidden selection${removed === 1 ? "" : "s"} removed. ZIP contains visible files only.`,
    );
});
$("#file-sort").addEventListener("change", renderListing);
$("#clear-filter").addEventListener("click", () => {
  $("#file-search").value = "";
  renderListing();
});
elements.selectAll.addEventListener("change", () => {
  selectedFiles.clear();
  if (elements.selectAll.checked) {
    listedFiles.slice(0, 200).forEach((entry) => selectedFiles.add(entry.path));
    if (listedFiles.length > 200)
      showToast(
        "Selected the first 200 visible files. ZIP supports up to 200.",
        "warning",
      );
  }
  updateSelection();
});
function focusDirectory() {
  const title = $("#files-title");
  const chrome = $(innerWidth >= 1024 ? ".topbar" : ".workspace-tabs");
  title.focus({ preventScroll: true });
  window.scrollTo({
    top: Math.max(
      0,
      scrollY +
        title.getBoundingClientRect().top -
        chrome.getBoundingClientRect().height -
        16,
    ),
    behavior: "instant",
  });
}
async function loadDirectory(path = currentPath, { navigate = false } = {}) {
  if (!settings?.can_read) return;
  const trigger = document.activeElement;
  const retry = $("#retry-files");
  const retrying = navigate && trigger === retry;
  const request = ++directoryRequest;
  failedDirectory = null;
  $("#listing-status").hidden = false;
  $("#listing-status").className = "inline-status";
  $("#listing-status").textContent = "Loading folder…";
  retry.hidden = !retrying;
  retry.setAttribute("aria-disabled", String(retrying));
  retry.textContent = retrying ? "Retrying…" : "Retry";
  try {
    const listing = await (await api(`api/files?${pathParams(path)}`)).json();
    if (request !== directoryRequest) return;
    const refocus = navigate && document.activeElement === trigger;
    if (currentPath !== listing.path) $("#file-search").value = "";
    const changed = currentPath !== listing.path;
    currentPath = listing.path;
    directoryEntries = listing.entries;
    selectedFiles.clear();
    if (changed || !elements.breadcrumbs.children.length)
      renderBreadcrumbs(currentPath);
    renderListing();
    $("#listing-status").hidden = true;
    if (refocus) focusDirectory();
    retry.hidden = true;
  } catch (error) {
    if (request !== directoryRequest) return;
    failedDirectory = path;
    $("#listing-status").textContent =
      `${error.message}. Showing the previous folder snapshot, if available (${currentPath || "Shared folder"}). Could not open ${path || "Shared folder"}.`;
    $("#listing-status").classList.add("error");
    $("#retry-files").hidden = false;
    showToast(error.message, "error");
  } finally {
    if (request === directoryRequest) {
      retry.removeAttribute("aria-disabled");
      retry.textContent = "Retry";
    }
  }
}
$("#retry-files").addEventListener("click", () => {
  if ($("#retry-files").getAttribute("aria-disabled") === "true") return;
  settings
    ? loadDirectory(failedDirectory ?? currentPath, { navigate: true })
    : initialize();
});
elements.refreshFiles.addEventListener("click", () => loadDirectory());
elements.downloadZip.addEventListener("click", () => {
  if (!settings.can_read || !selectedFiles.size || selectedFiles.size > 200)
    return;
  const form = node("form");
  form.method = "POST";
  form.action = serverUrl("api/zip");
  form.hidden = true;
  for (const path of selectedFiles) {
    const input = node("input");
    input.name = "path";
    input.value = path;
    form.append(input);
  }
  document.body.append(form);
  form.submit();
  setTimeout(() => form.remove(), 60000);
});

let textPreviewRequest = 0,
  textPreviewAbort,
  imagePreviewRequest = 0,
  sharedImageRequest = 0;
function previewEntry(entry) {
  if (entry.copy_kind === "image") previewImage(entry.path, entry.size);
  else if (entry.copy_kind === "text") previewText(entry);
}
async function previewText(entry) {
  const request = ++textPreviewRequest;
  textPreviewAbort?.abort();
  textPreviewAbort = new AbortController();
  $("#text-preview-title").textContent = entry.name;
  $("#text-preview-content").textContent = "";
  $("#text-preview-status").textContent = "Loading text…";
  $("#copy-preview").disabled = true;
  $("#text-preview-download").href = downloadUrl(entry.path);
  openDialog($("#text-dialog"));
  try {
    const data = await (
      await api(`api/text?${pathParams(entry.path)}`, {
        signal: textPreviewAbort.signal,
      })
    ).json();
    if (request !== textPreviewRequest || !$("#text-dialog").open) return;
    $("#text-preview-content").textContent = data.content;
    $("#text-preview-status").textContent =
      `${formatSize(utf8.encode(data.content).length)} · Plain text preview`;
    $("#copy-preview").disabled = false;
  } catch (error) {
    if (request === textPreviewRequest && error.name !== "AbortError")
      $("#text-preview-status").textContent =
        `${error.message}. Download the original instead.`;
  }
}
$("#text-dialog").addEventListener("close", () => {
  textPreviewRequest++;
  textPreviewAbort?.abort();
  $("#text-preview-content").textContent = "";
});
$("#copy-preview").addEventListener("click", () =>
  copyAndNotify($("#text-preview-content").textContent, "File contents copied"),
);
$("#wrap-preview").addEventListener("click", () => {
  const wrap = $("#text-preview-content").classList.toggle("wrap");
  $("#wrap-preview").setAttribute("aria-pressed", String(wrap));
});
async function copyFileText(path) {
  try {
    const text = (await (await api(`api/text?${pathParams(path)}`)).json())
      .content;
    if (!(await copyTextToClipboard(text))) return;
    showToast("File contents copied", "success");
  } catch (error) {
    showToast(error.message, "error");
  }
}
const imageLimit = 20 * 1024 * 1024,
  pixelLimit = 40000000;
async function imageSize(path, known) {
  if (Number.isFinite(known) && known >= 0) return known;
  const response = await api(`api/download?${pathParams(path)}`, {
    method: "HEAD",
  });
  const header = response.headers.get("Content-Length");
  if (!header || !/^\d+$/.test(header))
    throw new Error(
      "Cannot confirm the image size. Download the original instead.",
    );
  return Number(header);
}
function imageHint() {
  return !window.isSecureContext ||
    !window.ClipboardItem ||
    !navigator.clipboard?.write
    ? "This browser may restrict image copying. Long-press/right-click the preview or download the original. Trusted HTTPS can improve support, but device trust and permissions are still required."
    : "Right-click or long-press to copy or save. Image clipboard access depends on browser permissions.";
}
async function previewImage(path, knownSize) {
  if (!settings?.can_read) return;
  const request = ++imagePreviewRequest;
  elements.imagePreview.removeAttribute("src");
  elements.imagePreview.hidden = true;
  elements.imageTitle.textContent = path.split("/").pop();
  elements.imageDownload.href = downloadUrl(path);
  $("#image-preview-help").textContent = imageHint();
  $("#image-preview-meta").textContent = "Checking image…";
  openDialog(elements.imageDialog);
  try {
    const size = await imageSize(path, knownSize);
    if (request !== imagePreviewRequest || !elements.imageDialog.open) return;
    if (size > imageLimit)
      throw new Error(
        "Image exceeds the 20 MiB preview limit. Download the original instead.",
      );
    elements.imagePreview.onload = () => {
      if (request !== imagePreviewRequest) return;
      if (
        elements.imagePreview.naturalWidth *
          elements.imagePreview.naturalHeight >
        pixelLimit
      ) {
        elements.imagePreview.removeAttribute("src");
        elements.imagePreview.hidden = true;
        $("#image-preview-meta").textContent =
          "Image exceeds the 40 megapixel limit. Download the original instead.";
        return;
      }
      $("#image-preview-meta").textContent =
        `${elements.imagePreview.naturalWidth} × ${elements.imagePreview.naturalHeight} · ${formatSize(size)}`;
      updateSticky();
    };
    elements.imagePreview.onerror = () => {
      if (request === imagePreviewRequest) {
        $("#image-preview-meta").textContent =
          "Could not decode this image. Download the original instead.";
        elements.imagePreview.hidden = true;
      }
    };
    elements.imagePreview.hidden = false;
    elements.imagePreview.src = serverUrl(`api/image?${pathParams(path)}`);
  } catch (error) {
    if (request === imagePreviewRequest)
      $("#image-preview-meta").textContent = error.message;
  }
}
elements.closeImage.addEventListener("click", () =>
  closeDialog(elements.imageDialog),
);
elements.imageDialog.addEventListener("close", () => {
  imagePreviewRequest++;
  elements.imagePreview.onload = null;
  elements.imagePreview.onerror = null;
  elements.imagePreview.removeAttribute("src");
});
async function showSharedImage(path) {
  const request = ++sharedImageRequest;
  elements.sharedImage.hidden = false;
  elements.sharedImagePreview.removeAttribute("src");
  elements.sharedImagePreview.hidden = true;
  $("#shared-image-meta").textContent = "Checking…";
  $("#image-inline-help").textContent = imageHint();
  $("#download-shared-image").href = downloadUrl(path);
  try {
    const size = await imageSize(path);
    if (request !== sharedImageRequest) return;
    if (size > imageLimit)
      throw new Error(
        "Image exceeds the 20 MiB preview limit. Download the original instead.",
      );
    elements.sharedImagePreview.onload = () => {
      if (request !== sharedImageRequest) return;
      if (
        elements.sharedImagePreview.naturalWidth *
          elements.sharedImagePreview.naturalHeight >
        pixelLimit
      ) {
        elements.sharedImagePreview.removeAttribute("src");
        elements.sharedImagePreview.hidden = true;
        $("#shared-image-meta").textContent = "Too large to preview";
        return;
      }
      $("#shared-image-meta").textContent =
        `${elements.sharedImagePreview.naturalWidth} × ${elements.sharedImagePreview.naturalHeight} · ${formatSize(size)}`;
      updateSticky();
    };
    elements.sharedImagePreview.onerror = () => {
      if (request === sharedImageRequest) {
        elements.sharedImagePreview.hidden = true;
        $("#shared-image-meta").textContent = "Cannot decode image";
      }
    };
    elements.sharedImagePreview.hidden = false;
    elements.sharedImagePreview.src = serverUrl(
      `api/image?${pathParams(path)}`,
    );
  } catch (error) {
    if (request === sharedImageRequest)
      $("#shared-image-meta").textContent = error.message;
  }
}
elements.viewSharedImage.addEventListener("click", () =>
  previewImage(sharedImagePath),
);
$("#copy-shared-image").addEventListener("click", () =>
  copyImage(sharedImagePath),
);
async function boundedImageBlob(path) {
  const response = await api(`api/image?${pathParams(path)}`);
  if (Number(response.headers.get("Content-Length")) > imageLimit) {
    await response.body?.cancel();
    throw new Error("Image is too large to copy.");
  }
  if (!response.body)
    throw new Error("Streaming image access is unavailable. Use the preview.");
  const reader = response.body.getReader(),
    parts = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > imageLimit) {
        await reader.cancel();
        throw new Error("Image is too large to copy.");
      }
      parts.push(value);
    }
    return new Blob(parts, {
      type: response.headers.get("Content-Type") || "application/octet-stream",
    });
  } finally {
    reader.releaseLock();
  }
}
function blobToPng(blob) {
  return new Promise((resolve, reject) => {
    const image = new Image(),
      url = URL.createObjectURL(blob),
      canvas = document.createElement("canvas");
    const cleanup = () => {
      URL.revokeObjectURL(url);
      canvas.width = 0;
      canvas.height = 0;
      image.onload = null;
      image.onerror = null;
      image.removeAttribute("src");
    };
    image.onload = () => {
      try {
        if (image.naturalWidth * image.naturalHeight > pixelLimit)
          throw new Error("Image is too large to copy.");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        canvas.getContext("2d").drawImage(image, 0, 0);
        canvas.toBlob((result) => {
          cleanup();
          result
            ? resolve(result)
            : reject(new Error("Image conversion failed"));
        }, "image/png");
      } catch (error) {
        cleanup();
        reject(error);
      }
    };
    image.onerror = () => {
      cleanup();
      reject(new Error("Could not decode the image"));
    };
    image.src = url;
  });
}
async function copyImage(path) {
  const generation = dialogGeneration;
  if (
    !window.isSecureContext ||
    !window.ClipboardItem ||
    !navigator.clipboard?.write
  ) {
    await previewImage(path);
    return;
  }
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        "image/png": boundedImageBlob(path).then(blobToPng),
      }),
    ]);
    showToast("Image copied", "success");
  } catch (error) {
    if (generation !== dialogGeneration) return;
    await previewImage(path);
    $("#image-preview-help").textContent =
      `Image copying unavailable: ${error.message}. Long-press/right-click the preview or download the original.`;
  }
}

const tasks = [];
let queueRunning = false,
  taskSequence = 0;
function renderTask(task) {
  task.element.classList.toggle("error", task.state === "Failed");
  task.status.textContent = task.detail || task.state;
  task.progress.setAttribute(
    "aria-valuetext",
    `${task.state}: ${task.detail || task.state}`,
  );
  task.progress.value = task.percent || 0;
  if (
    task.state === "Finishing" ||
    (task.state === "Uploading" && task.indeterminate)
  )
    task.progress.removeAttribute("value");
  task.action.hidden = ["Done", "Canceled"].includes(task.state);
  task.action.setAttribute(
    "aria-label",
    `${task.state === "Failed" ? "Retry" : "Cancel"} ${task.file?.name || task.name}`,
  );
  task.action.textContent = task.state === "Failed" ? "Retry" : "Cancel";
  $("#queue-title").textContent =
    `Transfers · ${tasks.filter((item) => ["Queued", "Uploading", "Finishing"].includes(item.state)).length} active`;
}
function createTask(file, destination) {
  const task = {
    id: ++taskSequence,
    file,
    name: file.name,
    destination,
    state: "Queued",
    percent: 0,
    element: node("div", "upload-item"),
    status: node("span", "upload-status", "Queued"),
    progress: node("progress"),
    action: button("Cancel", () => cancelTask(task)),
  };
  task.progress.max = 100;
  const name = node("span", "upload-name", file.name);
  name.id = `transfer-name-${task.id}`;
  task.status.id = `transfer-status-${task.id}`;
  task.element.setAttribute("role", "group");
  task.element.setAttribute("aria-labelledby", name.id);
  task.progress.setAttribute("aria-labelledby", name.id);
  task.progress.setAttribute("aria-describedby", task.status.id);
  task.action.classList.add("task-action");
  task.element.append(
    name,
    node(
      "span",
      "upload-destination",
      destination ? `Folder: ${destination}` : "Shared folder",
    ),
    task.progress,
    task.status,
    task.action,
  );
  task.action.addEventListener("click", () => {
    if (task.state === "Failed") {
      task.state = "Queued";
      task.percent = 0;
      task.detail = "Queued for explicit retry";
      renderTask(task);
      processQueue();
    }
  });
  elements.uploadList.append(task.element);
  tasks.push(task);
  renderTask(task);
  return task;
}
function cancelTask(task) {
  if (task.state === "Failed") return;
  if (task.state === "Queued") {
    task.state = "Canceled";
    task.detail = "Canceled before upload";
    task.file = null;
    renderTask(task);
  } else if (["Uploading", "Finishing"].includes(task.state)) {
    task.request?.abort();
  }
}
function uploadTask(task) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (state, detail) => {
      if (settled) return;
      settled = true;
      task.state = state;
      task.detail = detail;
      task.request = null;
      if (state !== "Failed") task.file = null;
      renderTask(task);
      resolve();
    };
    const file = task.file;
    if (settings.max_upload_size && file.size > settings.max_upload_size) {
      finish("Failed", `Exceeds ${formatSize(settings.max_upload_size)} limit`);
      return;
    }
    task.state = "Uploading";
    task.indeterminate = file.size === 0;
    task.detail = "Uploading…";
    renderTask(task);
    const request = new XMLHttpRequest();
    task.request = request;
    const params = pathParams(task.destination);
    params.set("filename", file.name);
    request.open("PUT", serverUrl(`api/upload?${params}`));
    request.setRequestHeader("Content-Type", "application/octet-stream");
    request.timeout = 30 * 60 * 1000;
    const started = performance.now();
    request.upload.addEventListener("progress", (event) => {
      if (settled) return;
      task.indeterminate = !event.lengthComputable || !event.total;
      const elapsed = Math.max((performance.now() - started) / 1000, 0.001),
        rate = event.loaded / elapsed;
      task.percent =
        event.lengthComputable && event.total
          ? Math.round((event.loaded / event.total) * 100)
          : 0;
      if (event.lengthComputable && event.loaded === event.total) {
        task.state = "Finishing";
        task.detail = "Finishing · waiting for server";
      } else
        task.detail =
          event.lengthComputable && event.total
            ? `${task.percent}% · ${formatSize(rate)}/s · ${rate ? Math.ceil((event.total - event.loaded) / rate) : "—"}s left`
            : `Uploading · ${formatSize(event.loaded)}`;
      renderTask(task);
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        let name = file.name;
        try {
          name = JSON.parse(request.responseText).name;
        } catch (_) {}
        task.percent = 100;
        task.savedName = name;
        finish("Done", `Done · ${name}`);
      } else {
        let message = `Upload failed (${request.status})`;
        try {
          message = JSON.parse(request.responseText).detail || message;
        } catch (_) {}
        finish("Failed", message);
      }
    });
    request.addEventListener("abort", () =>
      finish(
        "Canceled",
        "Cancel requested · the server may already have saved this file",
      ),
    );
    request.addEventListener("error", () =>
      finish(
        "Failed",
        "Network error · check before retrying; the server may have saved the file",
      ),
    );
    request.addEventListener("timeout", () =>
      finish("Failed", "Timed out · check before retrying"),
    );
    request.send(file);
  });
}
async function processQueue() {
  if (queueRunning) return;
  queueRunning = true;
  const processed = [];
  try {
    while (true) {
      const task = tasks.find((item) => item.state === "Queued");
      if (!task) break;
      await uploadTask(task);
      processed.push(task);
    }
    const done = processed.filter((task) => task.state === "Done");
    const failed = processed.filter((task) => task.state === "Failed");
    if (processed.length === 1 && done.length)
      showToast(`Uploaded ${done[0].savedName}`, "success");
    else if (processed.length)
      showToast(
        `${done.length} uploaded · ${failed.length} failed. See Transfers for details.`,
        failed.length ? "warning" : "info",
      );
    elements.fileInput.value = "";
    if (settings.can_read) await loadDirectory();
  } finally {
    queueRunning = false;
    if (tasks.some((task) => task.state === "Queued")) processQueue();
  }
}
function uploadFiles(files) {
  if (!settings?.can_upload) {
    showToast("File uploads are disabled in this mode.", "warning");
    return;
  }
  const destination = settings.can_read ? currentPath : "";
  for (const file of files) createTask(file, destination);
  if (!files.length) return;
  $("#transfer-queue").hidden = false;
  elements.uploadList.hidden = false;
  $("#toggle-queue").setAttribute("aria-expanded", "true");
  processQueue();
}
$("#toggle-queue").addEventListener("click", () => {
  elements.uploadList.hidden = !elements.uploadList.hidden;
  $("#toggle-queue").setAttribute(
    "aria-expanded",
    String(!elements.uploadList.hidden),
  );
  $("#toggle-queue").setAttribute(
    "aria-label",
    elements.uploadList.hidden ? "Expand transfers" : "Collapse transfers",
  );
});
$("#clear-transfers").addEventListener("click", () => {
  for (let i = tasks.length - 1; i >= 0; i--)
    if (["Done", "Canceled", "Failed"].includes(tasks[i].state)) {
      tasks[i].file = null;
      tasks[i].element.remove();
      tasks.splice(i, 1);
    }
  $("#transfer-queue").hidden = tasks.length === 0;
});
elements.chooseFiles.addEventListener("click", () => {
  if (settings?.can_upload) elements.fileInput.click();
});
elements.fileInput.addEventListener("change", () =>
  uploadFiles([...elements.fileInput.files]),
);
let dragDepth = 0;
function hasFiles(event) {
  return [...event.dataTransfer.types].includes("Files");
}
function resetDrag() {
  dragDepth = 0;
  elements.overlay.hidden = true;
}
document.addEventListener("dragenter", (event) => {
  if (!hasFiles(event)) return;
  event.preventDefault();
  dragDepth++;
  if (settings?.can_upload && !document.querySelector("dialog[open]"))
    elements.overlay.hidden = false;
});
document.addEventListener("dragover", (event) => {
  if (hasFiles(event)) event.preventDefault();
});
document.addEventListener("dragleave", (event) => {
  if (!event.relatedTarget || --dragDepth <= 0) resetDrag();
});
window.addEventListener("blur", resetDrag);
document.addEventListener("drop", (event) => {
  if (!hasFiles(event)) return;
  event.preventDefault();
  resetDrag();
  if (document.querySelector("dialog[open]")) {
    showToast("Close the dialog before uploading files.", "warning");
    return;
  }
  const items = [...event.dataTransfer.items];
  if (items.some((item) => item.webkitGetAsEntry?.()?.isDirectory)) {
    showToast(
      "Folder uploads are not supported. Choose individual files.",
      "warning",
    );
    return;
  }
  uploadFiles([...event.dataTransfer.files]);
});
document.addEventListener("paste", (event) => {
  if (!settings) return;
  const editable = isEditing(event.target);
  if (editable && event.target !== elements.text) return;
  if (document.querySelector("dialog[open]")) return;
  const files = [...event.clipboardData.files];
  if (files.length) {
    event.preventDefault();
    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
    uploadFiles(
      files.map((file, index) => {
        if (
          !file.type.startsWith("image/") ||
          !/^(image|blob)(\.[a-z]+)?$/i.test(file.name)
        )
          return file;
        const extension =
          { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[
            file.type
          ] || "bin";
        return new File([file], `paste_${stamp}_${index}.${extension}`, {
          type: file.type,
        });
      }),
    );
  } else if (!editable && settings.can_write_text) {
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    event.preventDefault();
    elements.text.value = text;
    editVersion++;
    localDraft = true;
    showWorkspace("clipboard");
    sendText();
  }
});
let folderRequest = null;
function clearFolderError() {
  $("#folder-error").hidden = true;
  $("#folder-error").textContent = "";
  elements.folderName.removeAttribute("aria-invalid");
  elements.folderName.removeAttribute("aria-describedby");
}
function folderBusy(busy) {
  const submit = elements.folderForm.querySelector("[type=submit]");
  submit.disabled = busy;
  submit.textContent = busy ? "Creating…" : "Create";
  elements.folderName.readOnly = busy;
  elements.folderForm.setAttribute("aria-busy", String(busy));
}
elements.folderName.addEventListener("input", clearFolderError);
elements.folderDialog.addEventListener("close", () => {
  folderRequest = null;
  folderBusy(false);
});
elements.newFolder.addEventListener("click", () => {
  if (!settings?.can_upload || !settings.can_read) return;
  folderRequest = null;
  folderBusy(false);
  clearFolderError();
  elements.folderForm.reset();
  openDialog(elements.folderDialog);
  elements.folderName.focus();
});
elements.cancelFolder.addEventListener("click", () =>
  closeDialog(elements.folderDialog),
);
elements.folderForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (folderRequest) return;
  const submission = { path: currentPath, name: elements.folderName.value };
  folderRequest = submission;
  clearFolderError();
  folderBusy(true);
  try {
    await api("api/directories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(submission),
    });
    if (folderRequest !== submission || !elements.folderDialog.open) return;
    closeDialog(elements.folderDialog);
    showToast("Folder created", "success");
    await loadDirectory();
  } catch (error) {
    if (folderRequest !== submission || !elements.folderDialog.open) return;
    const message =
      error.status === 409
        ? "An item with this name already exists. Choose another name."
        : [400, 422].includes(error.status)
          ? "Use one folder name without slashes, and avoid hidden or reserved names."
          : `${error.message}. Check the connection and try again.`;
    $("#folder-error").textContent = message;
    $("#folder-error").hidden = false;
    elements.folderName.setAttribute("aria-describedby", "folder-error");
    if ([400, 409, 422].includes(error.status))
      elements.folderName.setAttribute("aria-invalid", "true");
    elements.folderName.focus();
  } finally {
    if (folderRequest === submission) {
      folderRequest = null;
      folderBusy(false);
    }
  }
});

let shareEntry = null;
function sensitiveShare() {
  return settings?.private_link || /^\/s\/[^/]+\//.test(baseUrl.pathname);
}
function shellQuote(value) {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}
function validateShareLink(value) {
  if (/[\x00-\x20\x7f]/.test(value))
    throw new Error(
      "Use a complete link without whitespace or control characters.",
    );
  let url;
  try {
    url = new URL(value);
  } catch (_) {
    throw new Error("Paste a complete HTTP or HTTPS terminal link.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.origin !== baseUrl.origin ||
    url.pathname !== baseUrl.pathname ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new Error(
      "Use the terminal link for this exact origin and shared base path. To change the LAN address, open that terminal link first.",
    );
  const keys = [...url.searchParams.keys()];
  if (
    keys.length > 1 ||
    keys.some((key) => !["token", "pin"].includes(key)) ||
    (keys.length && !url.searchParams.get(keys[0]))
  )
    throw new Error("Only one nonempty token or pin parameter is allowed.");
  if (
    [...url.searchParams.values()].some((value) =>
      /[\x00-\x20\x7f]/.test(value),
    )
  )
    throw new Error(
      "Link credentials cannot contain whitespace or control characters.",
    );
  return url;
}
function curlCommand(entry, base, auth) {
  const target = new URL("api/download", base);
  target.searchParams.set("path", entry.path);
  const key = auth.includes("token")
    ? "token"
    : auth.includes("pin")
      ? "pin"
      : null;
  if (key)
    target.searchParams.set(
      key,
      base.searchParams.get(key) || `REPLACE_${key.toUpperCase()}`,
    );
  let command = "curl --fail --location --globoff";
  if (auth === "unknown") command += " REPLACE_AUTH_OPTIONS";
  if (auth.includes("basic")) command += " --user 'USERNAME'";
  return `${command} --output ${shellQuote(`./${entry.name}`)} --url ${shellQuote(target.href)}`;
}
function openShare(entry = null) {
  if (!settings) return;
  shareEntry = entry;
  $("#share-title").textContent = entry
    ? "Copy curl command"
    : "Share connection";
  $("#share-guidance").textContent = sensitiveShare()
    ? "This protected session cannot be exported. Paste the complete link printed in the terminal; credentials are not read from your browser."
    : "Use the terminal LAN address on both devices. Loopback addresses cannot connect another device.";
  $("#share-link").value = sensitiveShare() ? "" : baseUrl.href;
  $("#curl-controls").hidden = !entry;
  $("#curl-auth").value = sensitiveShare() ? "unknown" : "none";
  $("#generate-share").textContent = entry ? "Generate command" : "Generate QR";
  $("#share-result-status").textContent = "";
  $("#share-qr").hidden = true;
  $("#curl-output").hidden = true;
  $("#curl-output-label").hidden = true;
  $("#copy-command").hidden = true;
  openDialog($("#share-dialog"));
}
function copyCurl(entry) {
  if (!sensitiveShare()) {
    copyAndNotify(curlCommand(entry, baseUrl, "none"), "curl command copied");
  } else {
    openShare(entry);
    generateShare();
  }
}
$("#open-share").addEventListener("click", () => openShare());
function generateShare() {
  try {
    const value = $("#share-link").value,
      auth = $("#curl-auth").value;
    let base,
      template = false;
    if (value) base = validateShareLink(value);
    else if (shareEntry) {
      base = new URL("http://REPLACE_HOST:8000/");
      template = true;
    } else
      throw new Error(
        "Paste the complete terminal link before generating a QR code.",
      );
    if (shareEntry) {
      if (template && /^\/s\//.test(baseUrl.pathname))
        base.pathname = "/s/REPLACE_RANDOM_PATH/";
      const command = curlCommand(shareEntry, base, auth);
      template =
        template ||
        command.includes("REPLACE_") ||
        auth.includes("basic") ||
        (sensitiveShare() && auth === "none");
      $("#curl-output").value = command;
      $("#curl-output").hidden = false;
      $("#curl-output-label").hidden = false;
      $("#copy-command").hidden = false;
      $("#share-result-status").textContent = template
        ? "Template — credentials required. Replace every placeholder and choose the configured authentication. Basic will prompt for a password. POSIX shell only."
        : "POSIX shell command. Confirm the selected authentication matches the server before using it.";
    } else {
      const qr = qrcodegen.QrCode.encodeText(
          base.href,
          qrcodegen.QrCode.Ecc.MEDIUM,
        ),
        border = 4,
        scale = 6,
        canvas = $("#share-qr");
      canvas.width = canvas.height = (qr.size + border * 2) * scale;
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#000000";
      for (let y = 0; y < qr.size; y++)
        for (let x = 0; x < qr.size; x++)
          if (qr.getModule(x, y))
            context.fillRect(
              (x + border) * scale,
              (y + border) * scale,
              scale,
              scale,
            );
      canvas.hidden = false;
      $("#share-result-status").textContent = [
        "localhost",
        "127.0.0.1",
        "[::1]",
      ].includes(base.hostname)
        ? "Loopback address: other devices cannot connect. Open the terminal LAN link first."
        : "Scan from another device on the same network. Basic Auth may still ask for credentials.";
    }
  } catch (error) {
    $("#share-result-status").textContent = error.message;
    $("#share-qr").hidden = true;
    $("#curl-output").hidden = true;
    $("#copy-command").hidden = true;
  }
}
$("#generate-share").addEventListener("click", generateShare);
$("#copy-command").addEventListener("click", () =>
  copyAndNotify($("#curl-output").value, "Command copied"),
);
function clearSharing() {
  shareEntry = null;
  $("#share-link").value = "";
  $("#curl-output").value = "";
  $("#share-result-status").textContent = "";
  const canvas = $("#share-qr");
  canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  canvas.width = canvas.height = 0;
  canvas.hidden = true;
}
$("#share-dialog").addEventListener("close", clearSharing);
$("#share-dialog").addEventListener("cancel", clearSharing);

async function initialize() {
  try {
    settings = await (await api("api/config")).json();
    const {
      can_read: read,
      can_upload: upload,
      can_write_text: write,
    } = settings;
    const badge = $("#mode-badge");
    badge.textContent = !read
      ? "DROP-ONLY"
      : upload && write
        ? "FULL"
        : write
          ? "FILES READ-ONLY"
          : "READ-ONLY";
    badge.className = `badge ${!read ? "droponly" : upload && write ? "full" : "readonly"}`;
    elements.chooseFiles.disabled = !upload;
    elements.newFolder.disabled = !upload;
    $("#clear-text").disabled = !write;
    elements.chooseFiles.hidden = !upload;
    elements.newFolder.hidden = !upload || !read;
    elements.dropZone.hidden = !upload;
    elements.textLimit.textContent = read
      ? "Text in memory · Images saved in shared folder"
      : "Submitted text and images are saved to the inbox";
    elements.uploadHelp.textContent = `${settings.max_upload_size ? `Up to ${formatSize(settings.max_upload_size)}` : "Unlimited size"} per file · ${settings.rename_on_conflict ? "Conflicts get numbered" : "No overwrites"}`;
    $("#mode-help").textContent = !read
      ? "Upload files or explicitly submit text to the inbox. Earlier submissions are private."
      : !upload
        ? write
          ? "Files are read-only. You can still download files and share text."
          : "Read-only mode. Download files and copy shared text; changes are disabled."
        : "";
    $("#sync-text").hidden = !write || !read;
    $("#clear-text").hidden = !write;
    elements.submitText.hidden = read || !write;
    elements.text.readOnly = !write;
    if (!read) {
      for (const control of [
        elements.fileTable,
        elements.breadcrumbs,
        elements.refreshFiles,
        elements.selectionToolbar,
        elements.copyShared,
        $("#copy-path"),
        $("#file-controls"),
        $("#file-count"),
      ])
        control.hidden = true;
      elements.breadcrumbs.hidden = false;
      elements.breadcrumbs.textContent = "Inbox";
      elements.text.placeholder =
        "Submit text to the inbox. Earlier submissions are hidden.";
      $("#files-title").textContent = "Upload to inbox";
      $("#clipboard-title").textContent = "Submit text";
      $("#files-tab-label").textContent = "Upload";
      $("#clipboard-tab-label").textContent = "Submit text";
    }
    elements.clipboardHelp.textContent =
      "Paste text, images or files with Ctrl+V / Cmd+V, or drop files anywhere. Images are saved to the shared folder. Your system clipboard is never read automatically.";
    if (!window.isSecureContext)
      elements.clipboardHelp.textContent +=
        " HTTP image copying uses preview and long-press/right-click. Trusted HTTPS still depends on browser permissions.";
    updateCount();
    connectClipboard();
    await loadDirectory();
  } catch (error) {
    setConnection(
      "offline",
      [401, 403, 429].includes(error.status)
        ? "Access denied — use the terminal link"
        : "Cannot connect",
    );
    $("#listing-status").hidden = false;
    $("#listing-status").textContent = error.message;
    $("#retry-files").hidden = false;
    showToast(error.message, "error");
  }
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && settings?.can_read) loadDirectory();
});
initialize();
