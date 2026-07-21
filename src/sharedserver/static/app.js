"use strict";

const elements = {
  connection: document.querySelector("#connection"),
  text: document.querySelector("#shared-text"),
  count: document.querySelector("#character-count"),
  copyShared: document.querySelector("#copy-shared"),
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
};

let currentPath = "";
let socket;
let reconnectDelay = 500;
let toastTimer;

function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.className = `toast visible${isError ? " error" : ""}`;
  toastTimer = setTimeout(() => { elements.toast.className = "toast"; }, 3200);
}

async function api(url, options) {
  const response = await fetch(url, options);
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
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}/ws`);
  setConnection("pending", "Connecting");

  socket.addEventListener("open", () => {
    reconnectDelay = 500;
    setConnection("online", "Live sync connected");
  });
  socket.addEventListener("message", event => {
    let message;
    try { message = JSON.parse(event.data); } catch (_) { return; }
    if (message.type === "clipboard") {
      elements.text.disabled = false;
      if (elements.text.value !== message.content) elements.text.value = message.content;
      updateCount();
    } else if (message.type === "error") {
      showToast(message.message, true);
    }
  });
  socket.addEventListener("close", () => {
    elements.text.disabled = true;
    setConnection("offline", "Connection lost, retrying");
    setTimeout(connectClipboard, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 8000);
  });
  socket.addEventListener("error", () => socket.close());
}

function updateCount() {
  const count = elements.text.value.length;
  elements.count.textContent = `${count.toLocaleString()} ${count === 1 ? "character" : "characters"}`;
}

elements.text.addEventListener("input", () => {
  updateCount();
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({type: "clipboard", content: elements.text.value}));
  }
});

async function copyText(text) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const helper = document.createElement("textarea");
  helper.value = text;
  helper.style.position = "fixed";
  helper.style.opacity = "0";
  document.body.append(helper);
  helper.select();
  const copied = document.execCommand("copy");
  helper.remove();
  if (!copied) throw new Error("Clipboard access was denied by the browser");
}

elements.copyShared.addEventListener("click", async () => {
  try {
    await copyText(elements.text.value);
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
    download.href = `/api/download?${pathParams(entry.path)}`;
    actionList.append(download);
  }
  actions.append(actionList);
  row.append(nameCell, sizeCell, dateCell, actions);
  return row;
}

async function loadDirectory(path = currentPath) {
  try {
    const response = await api(`/api/files?${pathParams(path)}`);
    const listing = await response.json();
    currentPath = listing.path;
    renderBreadcrumbs(currentPath);
    elements.fileList.replaceChildren(...listing.entries.map(renderEntry));
    elements.empty.hidden = listing.entries.length !== 0;
  } catch (error) { showToast(error.message, true); }
}

async function copyFileText(path) {
  try {
    const response = await api(`/api/text?${pathParams(path)}`);
    await copyText((await response.json()).content);
    showToast("File contents copied");
  } catch (error) { showToast(error.message, true); }
}

function blobToPng(blob) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(blob);
    image.onload = () => {
      const canvas = document.createElement("canvas");
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
  if (!window.ClipboardItem || !navigator.clipboard?.write) {
    showToast("Image copying is unavailable here. Download the image instead.", true);
    return;
  }
  try {
    const pngPromise = api(`/api/image?${pathParams(path)}`)
      .then(response => response.blob())
      .then(blobToPng);
    await navigator.clipboard.write([new ClipboardItem({"image/png": pngPromise})]);
    showToast("Image copied");
  } catch (error) { showToast(`Copy failed: ${error.message}`, true); }
}

function uploadFile(file) {
  return new Promise((resolve, reject) => {
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

    const params = pathParams(currentPath);
    params.set("filename", file.name);
    const request = new XMLHttpRequest();
    request.open("PUT", `/api/upload?${params}`);
    request.setRequestHeader("Content-Type", "application/octet-stream");
    request.upload.addEventListener("progress", event => {
      if (!event.lengthComputable) return;
      const value = Math.round((event.loaded / event.total) * 100);
      progress.value = value;
      percent.textContent = `${value}%`;
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        progress.value = 100;
        percent.textContent = "Done";
        setTimeout(() => item.remove(), 1500);
        resolve();
      } else {
        let message = `Upload failed (${request.status})`;
        try { message = JSON.parse(request.responseText).detail || message; } catch (_) { /* no JSON body */ }
        item.classList.add("error");
        percent.textContent = "Failed";
        reject(new Error(`${file.name}: ${message}`));
      }
    });
    request.addEventListener("error", () => reject(new Error(`${file.name}: network error`)));
    request.send(file);
  });
}

async function uploadFiles(files) {
  for (const file of files) {
    try { await uploadFile(file); } catch (error) { showToast(error.message, true); }
  }
  elements.fileInput.value = "";
  await loadDirectory();
}

elements.chooseFiles.addEventListener("click", () => elements.fileInput.click());
elements.fileInput.addEventListener("change", () => uploadFiles([...elements.fileInput.files]));
["dragenter", "dragover"].forEach(type => elements.dropZone.addEventListener(type, event => {
  event.preventDefault();
  elements.dropZone.classList.add("dragging");
}));
["dragleave", "drop"].forEach(type => elements.dropZone.addEventListener(type, event => {
  event.preventDefault();
  elements.dropZone.classList.remove("dragging");
}));
elements.dropZone.addEventListener("drop", event => uploadFiles([...event.dataTransfer.files]));

elements.newFolder.addEventListener("click", () => {
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

connectClipboard();
loadDirectory();
