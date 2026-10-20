# vNext 独立审阅报告

审阅日期：2026-10-20（Asia/Shanghai）。对象：`feat/vnext-workflows` 当前未提交变更及新增文件，包括审阅期间补充的 `docs/releasing.md`。

**最终结论：适合合并，前提是最终 PR head 的 GitHub CI 通过。初审发现的 1 项 P1 与 2 项 P2 均已由主会话修复，并经本审阅者独立复核关闭；当前没有未解决的 P0/P1。未发现已证实的认证绕过、越权读取、路径逃逸或同源脚本执行问题。**

本报告基于附件完整 vNext 规范、`docs/vnext-implementation.md`、全部源码/配置/文档差异、新模块与测试，以及独立运行的验证。只新增此报告；未修改实现、提交 Git、上传、创建 PR、合并或发布。主会话另行提供的 128 MiB curl/RSS 测量不是本审阅者的独立测量。

## 原始发现与复核状态

以下保留修复前的源码行号、原因和实际复现结果，不能将它们误读为仍然存在的问题。修复后的行号与验证见各项末尾。

### [P1，已修复] 收集箱提交确认会删除提交后新输入的文字

- 位置：`src/sharedserver/static/app.js:105–110`；相关状态更新在 `136–154`。
- 原因：收集箱的普通输入不会递增 `sequence`。提交 A 后、ACK 到达前输入 B，ACK 的 ID 仍等于 `sequence`，于是无条件设置 `localDraft = false` 并清空整个编辑框。B 未提交、未持久化，也无法恢复。慢磁盘、较高网络延迟或继续编辑提交内容时都会扩大这一窗口。
- 最小复现：用一个空目录启动 `sharedserver -b 127.0.0.1 --mode droponly -d <空目录> --no-qr`，打开网页并等待连接成功；输入 A、点击 Submit text，在确认前继续输入 B。可在浏览器控制台执行以下代码，以确定性地把第二次编辑安排在 ACK 之前：

```javascript
const editor = document.querySelector('#shared-text');
editor.value = 'first submission';
document.querySelector('#submit-text').click();
editor.value = 'second unsent draft';
editor.dispatchEvent(new Event('input', {bubbles: true}));
```

- 独立 Chromium 实测：出现 `Text submitted to the inbox` 后，编辑框值是 `""`；目录内唯一文本文件内容为 `first submission`。`second unsent draft` 完全丢失。
- 建议：将每次提交与当时的编辑版本/快照关联。ACK 只确认对应提交；只有编辑框自提交以来未发生新修改时才能清空。保留后续修改的草稿状态与计数。不要仅通过 `message.id === sequence` 推断当前编辑内容已经保存。
- 必要回归：提交 A → ACK 前输入 B → 等待 A 的 ACK；磁盘保留 A，编辑框保留 B，B 可随后正常提交。
- 复核关闭：当前 `app.js:108–117` 以 `sentVersion === editVersion` 和 `sentContent === elements.text.value` 双重确认编辑状态，`152–154` 保存发送时快照，`160` 和 `563` 在本地编辑时递增版本。独立重新执行上面相同的控制台时序后，A 已落盘而 B 保留在编辑框；随后手动提交 B，验证两个文件分别保存 A、B。新增浏览器回归另通过真实 WS 代理延迟 ACK 350ms 验证这一行为。

### [P2，已修复] 收集箱全局粘贴未登记草稿，重连会清空未提交文字

- 位置：`src/sharedserver/static/app.js:549–554`，与 `138`、`100–104` 联合触发。
- 全局粘贴设置 textarea 的 `.value` 后直接调用 `sendText()`；收集箱在第 138 行提前返回，既没有设置 `localDraft`，也没有更新字节计数。重连的空快照随后将其覆盖。普通键入的 input 事件会设置草稿，因而只有全局粘贴这条路径出现差异。
- 最小复现：收集箱页面连接后，在文本框外粘贴 `unsent pasted text`，不要点击提交；断开并恢复 WebSocket。控制台可用以下代码生成同等事件，之后执行 `socket.close()` 触发页面自己的重连：

```javascript
const data = new DataTransfer();
data.setData('text/plain', 'unsent pasted text');
document.body.dispatchEvent(new ClipboardEvent('paste', {
  clipboardData: data, bubbles: true, cancelable: true
}));
```

- 实测：粘贴后编辑框有文字但计数仍为 `0 B / 2.0 MB`；重连后编辑框为 `""`，目录没有文本文件。
- 建议：所有本地编辑入口统一更新编辑版本、草稿状态和字节计数；是否自动发送再由权限模式决定。补充“全局粘贴 → 重连 → 手动提交”的浏览器回归。
- 复核关闭：当前 `app.js:144–146` 在决定收集箱是否自动发送之前更新计数并设置 `localDraft`，全局 paste 同时增加编辑版本。独立按原复现步骤重跑，确认 `unsent pasted text` 显示 `18 B`，WebSocket 重连后内容保留，随后手动提交可落盘。新增套件中的重连回归亦通过。

### [P2，已修复] 收集箱 UI 错误声明文字只存在内存

- 位置：`src/sharedserver/static/app.js:587`。
- 页面无条件显示 `Text in memory · Images saved in shared folder`，但收集箱提交实际上通过 `server.py:57–69` 保存为磁盘上的 `text_*.txt`。README 已正确解释，页面中的存储提示仍与实际行为不一致。
- 最小复现：打开 `--mode droponly` 页面查看文本框下方提示，提交文字并检查共享目录。
- 建议：收集箱显示“Submitted text is saved to the inbox”等符合实际的提示。
- 复核关闭：当前 `app.js:597–598` 按权限模式选择提示；独立浏览器断言收集箱实际显示 `Submitted text and images are saved to the inbox`，与持久化行为一致。

## 独立验证结果

- Python 3.12.14：`.venv312/bin/python -m pytest -q -p no:cacheprovider`，**57 passed**。
- Python 3.15：`.venv/bin/python -m pytest -q -p no:cacheprovider`，**57 passed**。
- 两套既有 Chromium 测试均以 `LAN_SMOKE=1`、Python 3.12 运行通过：`scripts/browser_smoke.cjs`、`scripts/browser_vnext.cjs`。覆盖实际 LAN HTTP 上的文字降级复制、图片预览、受保护路径、PIN/Basic、双端同步、paste/drop、原生表单 ZIP、readonly 与收集箱。测试使用临时目录和合成内容，未重新生成演示资源。
- 额外组合认证探测：分别测试 Basic + PIN + private mount、Basic + token + private mount。只有 Basic 或只有链接均被拒绝；两者组合获得页面和会话后，HTTP API 与 WebSocket 均正常。未发现因认证组合而直接放行的端点。
- 额外清理验证：`TemporaryArchiveResponse` 在响应发送抛出 `OSError` 和 `asyncio.CancelledError` 时均删除临时 ZIP；构建失败也未遗留临时 ZIP。上传限制、流中断、取消及无硬链接回退由已独立重跑的现有测试覆盖。未将这些结果扩大表述为已测所有平台上的磁盘断连或进程强杀。
- 针对性浏览器脚本独立复现上列 P1/P2，而既有 57 项测试及两套端到端均未捕获它们。
- `git diff --check` 通过。未重新执行打包/Twine，以避免在“只新增报告”的范围下改写构建目录；检查了打包声明、资源清单和两份 README。

### 修复后的最终复核

- 复核范围为主会话新增的编辑版本/发送快照逻辑、收集箱持久化提示和 `scripts/browser_vnext.cjs` 中的延迟 ACK/重连回归。
- 两套 Python 测试重新运行，Python 3.12 为 **57 passed**，Python 3.15 为 **57 passed**。
- 为排除已安装旧 wheel 干扰，最终浏览器验证显式设置 `PYTHONPATH=/Users/kyiw/chatgpt/sharedserver/src`；两套脚本均以 `LAN_SMOKE=1`、`.venv312/bin/python` 针对当前源码独立通过。原有 smoke 通过；更新后的 vNext 套件通过，包含 350ms 延迟 ACK 与未提交全局粘贴后重连。
- 独立临时浏览器脚本另外按本报告原始事件顺序重跑两项数据丢失复现，断言修复后草稿、字节计数、后续提交及实际文件内容；同时核对新存储提示。全部通过。
- 初审原始浏览器复现使用当时的已安装修复前版本；复核中曾有一次未显式指定源码的尝试因仍加载旧 wheel 而超时，此次不计为修复后的验证结果。上述最终结果均明确针对源码运行。
- 最终 `git diff --check` 通过。未执行 GitHub 操作或 PyPI 发布。

## 对规范覆盖的判断

| 领域 | 判断 |
| --- | --- |
| 默认与旧参数 | 保留无参数免登录、`0.0.0.0:8000`、当前目录和 1 GiB 默认限制。旧位置端口、`--host`、`--max-upload-size` 保留。旧 `--read-only` 仅文件只读、新 `--mode readonly` 包含文本只读，符合约定兼容选择。 |
| 认证与私密路径 | Basic/PIN/token 及 cookie bootstrap 共用 HTTP/WS 策略；private mount 隐藏未带前缀的页面、静态资源与 API。PIN 有按客户端地址计数及有界跟踪；CLI 关闭代理头信任。HTTP 不加密、低熵 PIN、HTTPS 不自动建立信任均有说明。 |
| 权限模式 | readonly 在 HTTP 与 WS 拦截文本修改并禁止上传；droponly 拒绝列表、下载、ZIP、图文历史读取和创建目录，WS 初始空快照且不广播其他提交。文本持久化含重复提交。前端草稿确认问题已修复并独立验证。 |
| 传输、ZIP、Range | 请求流分块写盘，64 KiB 写入与复制，冲突不覆盖并可选编号；下载使用 FileResponse 的 Range/HEAD。ZIP 使用受校验的相对路径、磁盘暂存和 finally 清理；前端原生表单下载避免全包 Blob。 |
| 无头接口 | PUT `/upload/<filename>` 是规范允许的 multipart 替代；curl/Wget 收到简洁文本。raw 文本读写类型、UTF-8 与字节上限有验证。README 使用对应的真实接口。 |
| 路径与主动内容 | 路径限制在共享根目录，隐藏项、符号链接、特殊文件和活动配置受限；下载均为附件，响应有 nosniff。图片仅 PNG/JPEG/WebP 签名 + 明确图片 MIME，SVG/HTML/JS/XML 不可借自定义白名单作为图片内联。文件名与文本通过 DOM 文本属性渲染。没有发现可复现的存储型 XSS。 |
| TLS | 私有隐藏 TemporaryDirectory 与退出清理，私钥 chmod 0600；有 OpenSSL 或可选 cryptography 路径。现有握手测试独立通过。不会安装证书或修改设备信任。未声称真实手机已信任或剪贴板必然可用。 |
| 前端 | 全局 paste 尊重普通输入框，支持图像/文件；全页 drop、进度/速率/ETA、多选 ZIP 和图片 HTTP 提示均实现。收集箱本地草稿状态已修复，延迟 ACK 和重连回归通过。 |
| 文档与工程 | 双语 README、CLI 表、curl、uvx/pipx、源码预览说明、演示和发布 runbook 基本一致；版本元数据均为 0.3.0。PyPI 发布只由 release 事件触发，合并本身不会发布。 |

CI 文件保留三操作系统与 Python 3.10–3.14，并加入 TLS extra 与第二套浏览器测试。更新后的 action 版本存在于官方发布页：[setup-python v7.0.0](https://github.com/actions/setup-python/releases/tag/v7.0.0)、[setup-node v7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0)、[upload-artifact v7.0.2](https://github.com/actions/upload-artifact/releases/tag/v7.0.2)、[download-artifact v8.0.2](https://github.com/actions/download-artifact/releases/tag/v8.0.2)。这是配置及版本存在性审查；本地无法替代最终 PR head 的 GitHub CI，也未独立运行 Windows/Linux 矩阵。

三项发现均已关闭，针对性浏览器回归及两套 Python 测试独立通过。从本次审查范围看可以合并；主会话仍需等待最终 PR head 的 GitHub CI 通过。此次审阅不构成发布 0.3.0 到 PyPI 的授权。
