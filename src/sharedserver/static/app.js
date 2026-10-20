"use strict";

const elements = {
  connection: document.querySelector("#connection"),
  text: document.querySelector("#shared-text"),
  count: document.querySelector("#character-count"),
  copyShared: document.querySelector("#copy-shared"),
  textLimit: document.querySelector("#text-limit"),
  clipboardHelp: document.querySelector("#clipboard-help"),
  sendDraft: document.querySelector("#send-draft"),
  submitText: document.querySelector("#submit-text"),
  refreshFiles: document.querySelector("#refresh-files"),
  uploadHelp: document.querySelector("#upload-help"),
  breadcrumbs: document.querySelector("#breadcrumbs"),
  fileList: document.querySelector("#file-list"),
  empty: document.querySelector("#empty-state"),
  chooseFiles: document.querySelector("#choose-files"),
  fileInput: document.querySelector("#file-input"),
  dropZone: document.querySelector("#drop-zone"),
  uploadList: document.querySelector("#upload-list"),
  newFolder: document.querySelector("#new-folder"),
  folderDialog: document.querySelector("#folder-dialog"),
  folderForm: document.querySelector("#folder-form"),
  folderName: document.querySelector("#folder-name"),
  cancelFolder: document.querySelector("#cancel-folder"),
  toast: document.querySelector("#toast"),
  selectAll: document.querySelector("#select-all"),
  downloadZip: document.querySelector("#download-zip"),
  selectionToolbar: document.querySelector("#selection-toolbar"),
  fileTable: document.querySelector("#file-table"),
  overlay: document.querySelector("#page-drop-overlay"),
  imageDialog: document.querySelector("#image-dialog"),
  imagePreview: document.querySelector("#image-preview"),
  imageTitle: document.querySelector("#image-title"),
  imageDownload: document.querySelector("#image-download"),
  closeImage: document.querySelector("#close-image"),
  sharedImage: document.querySelector("#shared-image"),
  sharedImagePreview: document.querySelector("#shared-image-preview"),
  viewSharedImage: document.querySelector("#view-shared-image"),
};

let currentPath = "";
let socket;
let reconnectDelay = 500;
let toastTimer;
let settings;
let localDraft = false;
let sequence = 0;
let editVersion = 0;
let sentVersion = -1;
let sentContent = "";
let directoryRequest = 0;
const utf8 = new TextEncoder();
const baseUrl = new URL("./", location.href);
const selectedFiles = new Set();
let listedFiles = [];
let sharedImagePath;
let uploadQueue = Promise.resolve();

function serverUrl(path) {
  return new URL(path.replace(/^\//, ""), baseUrl).href;
}

function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.className = `toast visible${isError ? " error" : ""}`;
  toastTimer = setTimeout(() => { elements.toast.className = "toast"; }, 3200);
}

async function api(url, options) {
  const response = await fetch(serverUrl(url), options);
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try { message = (await response.json()).detail || message; } catch (_) { /* no JSON body */ }
    throw new Error(message);
  }
  return response;
}

function setConnection(state, label) {
  elements.connection.className = `connection ${state}`;
  elements.connection.lastElementChild.textContent = label;
}

function connectClipboard() {
  const address = new URL("ws", baseUrl);
  address.protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(address);
  setConnection("pending", "Connecting");

  socket.addEventListener("open", () => {
    reconnectDelay = 500;
    elements.sendDraft.disabled = false;
    setConnection("online", "Live sync connected");
  });
  socket.addEventListener("message", event => {
    let message;
    try { message = JSON.parse(event.data); } catch (_) { return; }
    if (message.type === "clipboard") {
      elements.text.disabled = false;
      elements.text.readOnly = !settings.can_write_text;
      if (localDraft) {
        elements.sendDraft.hidden = false;
        showToast("Your unsent draft was preserved. Send it when ready.");
      } else if (elements.text.value !== message.content) elements.text.value = message.content;
      updateCount();
    } else if (message.type === "ack" && message.id === sequence) {
      const unchanged = sentVersion === editVersion && sentContent === elements.text.value;
      localDraft = !unchanged;
      elements.sendDraft.hidden = unchanged || !settings.can_write_text;
      if (!settings.can_read && unchanged) {
        elements.text.value = "";
        updateCount();
        showToast("Text submitted to the inbox");
      } else if (!settings.can_read) {
        showToast("Previous text submitted. Your new draft was preserved.");
      }
    } else if (message.type === "image" && settings.can_read) {
      sharedImagePath = message.path;
      elements.sharedImagePreview.src = serverUrl(`/api/image?${pathParams(message.path)}`);
      elements.sharedImage.hidden = false;
    } else if (message.type === "error") {
      showToast(message.message, true);
    }
  });
  socket.addEventListener("close", () => {
    elements.sendDraft.disabled = true;
    setConnection("offline", "Connection lost, retrying");
    setTimeout(connectClipboard, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 8000);
  });
  socket.addEventListener("error", () => socket.close());
}

function updateCount() {
  const count = utf8.encode(elements.text.value).length;
  elements.count.textContent = `${formatSize(count)} / ${formatSize(settings.max_text_size)}`;
  elements.text.setAttribute("aria-invalid", String(count > settings.max_text_size));
}

function sendText(manual = false) {
  if (!settings?.can_write_text) return;
  updateCount();
  localDraft = true;
  if (!settings.can_read && manual !== true) return;
  if (utf8.encode(elements.text.value).length > settings.max_text_size) {
    showToast(`Text is too large. Limit: ${formatSize(settings.max_text_size)} of UTF-8 text.`, true);
    return;
  }
  if (socket?.readyState === WebSocket.OPEN) {
    sentVersion = editVersion;
    sentContent = elements.text.value;
    socket.send(JSON.stringify({type: "clipboard", content: elements.text.value, id: ++sequence}));
  } else {
    elements.sendDraft.hidden = false;
  }
}
elements.text.addEventListener("input", event => {
  editVersion++;
  updateCount();
  localDraft = true;
  if (!event.isComposing) sendText();
});
elements.text.addEventListener("compositionend", () => sendText());
elements.sendDraft.addEventListener("click", () => sendText(true));
elements.submitText.addEventListener("click", () => sendText(true));
async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (_) { /* Try the user-initiated selection fallback. */ }
  }
  const focused = document.activeElement;
  const helper = document.createElement("textarea");
  helper.value = text;
  helper.style.position = "fixed";
  helper.style.opacity = "0";
  document.body.append(helper);
  let copied;
  try {
    helper.focus();
    helper.select();
    helper.setSelectionRange(0, helper.value.length);
    copied = document.execCommand("copy");
  } finally {
    helper.remove();
    focused?.focus({preventScroll: true});
  }
  if (!copied) throw new Error("Clipboard access was denied by the browser");
}

elements.copyShared.addEventListener("click", async () => {
  try {
    await copyTextToClipboard(elements.text.value);
    showToast("Text copied");
  } catch (error) { showToast(error.message, true); }
});

function pathParams(path) {
  const params = new URLSearchParams();
  params.set("path", path);
  return params;
}

function renderBreadcrumbs(path) {
  elements.breadcrumbs.replaceChildren();
  const parts = path ? path.split("/") : [];
  const crumbs = [{name: "Shared folder", path: ""}];
  let built = "";
  for (const part of parts) {
    built = built ? `${built}/${part}` : part;
    crumbs.push({name: part, path: built});
  }
  crumbs.forEach((crumb, index) => {
    if (index) {
      const separator = document.createElement("span");
      separator.textContent = "/";
      elements.breadcrumbs.append(separator);
    }
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = crumb.name;
    if (index < crumbs.length - 1) button.addEventListener("click", () => loadDirectory(crumb.path));
    elements.breadcrumbs.append(button);
  });
}

function formatSize(bytes) {
  if (bytes === null) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** unit)).toFixed(unit ? 1 : 0)} ${units[unit]}`;
}

function button(label, action, accessibleLabel = label) {
  const node = document.createElement("button");
  node.type = "button";
  node.className = "button secondary small";
  node.textContent = label;
  node.setAttribute("aria-label", accessibleLabel);
  node.title = accessibleLabel;
  node.addEventListener("click", action);
  return node;
}

function renderEntry(entry) {
  const row = document.createElement("tr");
  const nameCell = document.createElement("td");
  nameCell.className = "name-cell";
  const nameContent = document.createElement("div");
  nameContent.className = "name-content";
  if (!entry.is_directory) {
    const select = document.createElement("input");
    select.type = "checkbox";
    select.className = "file-select";
    select.setAttribute("aria-label", `Select ${entry.name}`);
    select.addEventListener("change", () => {
      if (select.checked && selectedFiles.size >= 200) {
        select.checked = false;
        showToast("Select up to 200 files per ZIP.", true);
        return;
      }
      select.checked ? selectedFiles.add(entry.path) : selectedFiles.delete(entry.path);
      updateSelection();
    });
    select.dataset.path = entry.path;
    nameContent.append(select);
  }
  const icon = document.createElement("span");
  icon.className = "file-icon";
  icon.textContent = entry.is_directory ? "▰" : "▤";
  nameContent.append(icon);

  if (entry.is_directory) {
    const link = document.createElement("button");
    link.type = "button";
    link.className = "folder-link";
    link.textContent = entry.name;
    link.title = entry.name;
    link.addEventListener("click", () => loadDirectory(entry.path));
    nameContent.append(link);
  } else {
    const name = document.createElement("span");
    name.className = "entry-name";
    name.textContent = entry.name;
    name.title = entry.name;
    nameContent.append(name);
  }
  nameCell.append(nameContent);

  const sizeCell = document.createElement("td");
  sizeCell.className = "size-cell";
  sizeCell.textContent = formatSize(entry.size);
  const dateCell = document.createElement("td");
  dateCell.className = "date-cell";
  dateCell.textContent = new Date(entry.modified).toLocaleString();
  const actions = document.createElement("td");
  actions.className = "actions";
  const actionList = document.createElement("div");
  actionList.className = "action-list";

  if (!entry.is_directory) {
    if (entry.copy_kind === "text") {
      actionList.append(button("Copy", () => copyFileText(entry.path), "Copy file text"));
    } else if (entry.copy_kind === "image") {
      actionList.append(button("Copy", () => copyImage(entry.path), "Copy image"));
    }
    const download = document.createElement("a");
    download.className = "button secondary small download-link";
    download.textContent = "Download";
    download.setAttribute("aria-label", `Download ${entry.name}`);
    download.title = `Download ${entry.name}`;
    download.href = serverUrl(`/api/download?${pathParams(entry.path)}`);
    actionList.append(download);
  }
  actions.append(actionList);
  row.append(nameCell, sizeCell, dateCell, actions);
  return row;
}

async function loadDirectory(path = currentPath) {
  if (!settings?.can_read) return;
  const request = ++directoryRequest;
  try {
    const response = await api(`/api/files?${pathParams(path)}`);
    const listing = await response.json();
    if (request !== directoryRequest) return;
    currentPath = listing.path;
    selectedFiles.clear();
    listedFiles = listing.entries.filter(entry => !entry.is_directory);
    updateSelection();
    renderBreadcrumbs(currentPath);
    elements.fileList.replaceChildren(...listing.entries.map(renderEntry));
    elements.empty.hidden = listing.entries.length !== 0;
  } catch (error) { showToast(error.message, true); }
}

async function copyFileText(path) {
  try {
    const response = await api(`/api/text?${pathParams(path)}`);
    await copyTextToClipboard((await response.json()).content);
    showToast("File contents copied");
  } catch (error) { showToast(error.message, true); }
}

function blobToPng(blob) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(blob);
    image.onload = () => {
      const canvas = document.createElement("canvas");
      if (image.naturalWidth * image.naturalHeight > 40000000) {
        URL.revokeObjectURL(url);
        reject(new Error("Image is too large to copy; use Download."));
        return;
      }
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d").drawImage(image, 0, 0);
      canvas.toBlob(result => {
        URL.revokeObjectURL(url);
        result ? resolve(result) : reject(new Error("Image conversion failed"));
      }, "image/png");
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read the image")); };
    image.src = url;
  });
}

async function copyImage(path) {
  if (!window.isSecureContext || !window.ClipboardItem || !navigator.clipboard?.write) {
    previewImage(path);
    showToast("This browser needs trusted HTTPS to copy images. Long-press/right-click the preview, or try --https after trusting its certificate.", true);
    return;
  }
  try {
    const pngPromise = api(`/api/image?${pathParams(path)}`)
      .then(response => {
        if (Number(response.headers.get("Content-Length")) > 20 * 1024 * 1024) {
          throw new Error("Image is too large to copy; use Download.");
        }
        return response.blob();
      })
      .then(blobToPng);
    await navigator.clipboard.write([new ClipboardItem({"image/png": pngPromise})]);
    showToast("Image copied");
  } catch (error) {
    previewImage(path);
    showToast(`Copy failed: ${error.message}. You can copy or save the preview.`, true);
  }
}

function previewImage(path) {
  elements.imageTitle.textContent = path.split("/").pop();
  elements.imagePreview.src = serverUrl(`/api/image?${pathParams(path)}`);
  elements.imageDownload.href = serverUrl(`/api/download?${pathParams(path)}`);
  if (!elements.imageDialog.open) elements.imageDialog.showModal();
}
elements.closeImage.addEventListener("click", () => elements.imageDialog.close());
elements.viewSharedImage.addEventListener("click", () => previewImage(sharedImagePath));

function updateSelection() {
  elements.downloadZip.disabled = selectedFiles.size === 0;
  elements.downloadZip.textContent = `Download ZIP (${selectedFiles.size})`;
  elements.selectAll.checked = listedFiles.length > 0 && selectedFiles.size === listedFiles.length;
  elements.selectAll.indeterminate = selectedFiles.size > 0 && !elements.selectAll.checked;
}
elements.selectAll.addEventListener("change", () => {
  selectedFiles.clear();
  if (elements.selectAll.checked) listedFiles.slice(0, 200).forEach(entry => selectedFiles.add(entry.path));
  for (const select of elements.fileList.querySelectorAll(".file-select")) {
    select.checked = selectedFiles.has(select.dataset.path);
  }
  updateSelection();
});
elements.downloadZip.addEventListener("click", () => {
  if (!settings.can_read || !selectedFiles.size) return;
  // Let the browser stream the attachment to disk; do not buffer a ZIP Blob.
  const form = document.createElement("form");
  form.method = "POST";
  form.action = serverUrl("/api/zip");
  form.hidden = true;
  for (const path of selectedFiles) {
    const input = document.createElement("input");
    input.name = "path";
    input.value = path;
    form.append(input);
  }
  document.body.append(form);
  form.submit();
  // Native form submission is scheduled by the browser. Removing it in this
  // task cancels that navigation before a download request can be dispatched.
  setTimeout(() => form.remove(), 60000);
});

function uploadFile(file, destination) {
  return new Promise((resolve, reject) => {
    if (settings.max_upload_size && file.size > settings.max_upload_size) {
      reject(new Error(`${file.name}: exceeds the ${formatSize(settings.max_upload_size)} upload limit`));
      return;
    }
    const item = document.createElement("div");
    item.className = "upload-item";
    const name = document.createElement("span");
    name.className = "upload-name";
    name.textContent = file.name;
    const progress = document.createElement("progress");
    progress.max = 100;
    progress.value = 0;
    const percent = document.createElement("span");
    percent.textContent = "0%";
    item.append(name, progress, percent);
    elements.uploadList.append(item);

    const params = pathParams(destination);
    params.set("filename", file.name);
    const request = new XMLHttpRequest();
    request.open("PUT", serverUrl(`/api/upload?${params}`));
    request.setRequestHeader("Content-Type", "application/octet-stream");
    const started = performance.now();
    request.upload.addEventListener("progress", event => {
      if (!event.lengthComputable) return;
      const value = Math.round((event.loaded / event.total) * 100);
      progress.value = value;
      const elapsed = Math.max((performance.now() - started) / 1000, 0.001);
      const rate = event.loaded / elapsed;
      const remaining = rate ? Math.ceil((event.total - event.loaded) / rate) : 0;
      percent.textContent = `${value}% · ${formatSize(rate)}/s · ${remaining}s left`;
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        progress.value = 100;
        percent.textContent = "Done";
        setTimeout(() => item.remove(), 1500);
        let uploadedName = file.name;
        try { uploadedName = JSON.parse(request.responseText).name; } catch (_) { /* old server */ }
        showToast(`Uploaded ${uploadedName}`);
        resolve();
      } else {
        let message = `Upload failed (${request.status})`;
        try { message = JSON.parse(request.responseText).detail || message; } catch (_) { /* no JSON body */ }
        item.classList.add("error");
        percent.textContent = "Failed";
        reject(new Error(`${file.name}: ${message}`));
      }
    });
    request.addEventListener("error", () => {
      item.classList.add("error");
      percent.textContent = "Failed";
      reject(new Error(`${file.name}: network error`));
    });
    request.send(file);
  });
}

function uploadFiles(files) {
  if (!settings?.can_upload) {
    showToast("File uploads are disabled in this mode.", true);
    return Promise.resolve();
  }
  const destination = currentPath;
  const batch = [...files];
  uploadQueue = uploadQueue.then(async () => {
    for (const file of batch) {
      try { await uploadFile(file, destination); } catch (error) { showToast(error.message, true); }
    }
    elements.fileInput.value = "";
    await loadDirectory();
  });
  return uploadQueue;
}

elements.chooseFiles.addEventListener("click", () => elements.fileInput.click());
elements.fileInput.addEventListener("change", () => uploadFiles([...elements.fileInput.files]));
let dragDepth = 0;
document.addEventListener("dragenter", event => {
  if (![...event.dataTransfer.types].includes("Files")) return;
  event.preventDefault();
  dragDepth++;
  if (settings?.can_upload) elements.overlay.hidden = false;
});
document.addEventListener("dragover", event => {
  if ([...event.dataTransfer.types].includes("Files")) event.preventDefault();
});
document.addEventListener("dragleave", event => {
  if (!event.relatedTarget || --dragDepth <= 0) {
    dragDepth = 0;
    elements.overlay.hidden = true;
  }
});
document.addEventListener("drop", event => {
  if (![...event.dataTransfer.types].includes("Files")) return;
  event.preventDefault();
  dragDepth = 0;
  elements.overlay.hidden = true;
  uploadFiles(event.dataTransfer.files);
});
window.addEventListener("blur", () => { dragDepth = 0; elements.overlay.hidden = true; });

document.addEventListener("paste", event => {
  if (!settings) return;
  const target = event.target;
  const editable = target instanceof Element ? target.closest("input, textarea, [contenteditable='true']") : null;
  if (editable && target !== elements.text) return;
  const files = [...event.clipboardData.files];
  if (files.length) {
    event.preventDefault();
    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
    const named = files.map((file, index) => {
      if (!file.type.startsWith("image/") || !/^(image|blob)(\.[a-z]+)?$/i.test(file.name)) return file;
      const extension = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}[file.type] || "bin";
      return new File([file], `paste_${stamp}_${index}.${extension}`, {type: file.type});
    });
    uploadFiles(named);
  } else if (!editable && settings.can_write_text) {
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    event.preventDefault();
    elements.text.value = text;
    editVersion++;
    sendText();
  }
});

elements.newFolder.addEventListener("click", () => {
  if (!settings?.can_upload || !settings.can_read) return;
  elements.folderForm.reset();
  elements.folderDialog.showModal();
  elements.folderName.focus();
});
elements.cancelFolder.addEventListener("click", () => elements.folderDialog.close());
elements.folderForm.addEventListener("submit", async event => {
  event.preventDefault();
  try {
    await api("/api/directories", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({path: currentPath, name: elements.folderName.value}),
    });
    elements.folderDialog.close();
    showToast("Folder created");
    await loadDirectory();
  } catch (error) { showToast(error.message, true); }
});

elements.refreshFiles.addEventListener("click", () => loadDirectory());
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && settings) loadDirectory();
});

async function initialize() {
  try {
    settings = await (await api("/api/config")).json();
    elements.textLimit.textContent = settings.can_read ? "Text in memory · Images saved in shared folder"
      : "Submitted text and images are saved to the inbox";
    const limit = settings.max_upload_size ? `Up to ${formatSize(settings.max_upload_size)}` : "Unlimited size";
    elements.uploadHelp.textContent = `${limit} per file · ${settings.rename_on_conflict ? "Conflicts get numbered" : "No overwrites"}`;
    if (!settings.can_upload) {
      elements.chooseFiles.hidden = true;
      elements.newFolder.hidden = true;
      elements.dropZone.hidden = true;
      const note = document.createElement("p");
      note.className = "helper-text";
      note.textContent = settings.can_write_text ? "Files are read-only. You can still download files and share text." : "Read-only mode. Download files and copy shared text; changes are disabled.";
      elements.breadcrumbs.before(note);
    }
    if (!settings.can_read) {
      elements.submitText.hidden = false;
      for (const node of [elements.fileTable, elements.breadcrumbs, elements.refreshFiles,
                          elements.newFolder, elements.selectionToolbar, elements.copyShared]) node.hidden = true;
      elements.text.placeholder = "Submit text to the inbox. Earlier submissions are hidden.";
    }
    elements.text.readOnly = !settings.can_write_text;
    elements.clipboardHelp.textContent = "Paste text, images or files with Ctrl+V / Cmd+V, or drop files anywhere. Images are saved to the shared folder. Your system clipboard is never read automatically.";
    if (!window.isSecureContext) elements.clipboardHelp.textContent += " HTTP image copying opens a preview for long-press/right-click; trusted HTTPS enables supported clipboard APIs.";
    elements.viewSharedImage.disabled = !settings.can_read;
    connectClipboard();
    await loadDirectory();
  } catch (error) {
    setConnection("offline", "Cannot connect");
    showToast(error.message, true);
  }
}
initialize();
