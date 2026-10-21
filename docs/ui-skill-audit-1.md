# UI Skill 独立审计 1

日期：2026-10-20 至 2026-10-21。对象：`/Users/kyiw/chatgpt/sharedserver` 本轮初审时的**未提交、修复前工作区** UI。结论：现有视觉方向可以保留；本轮选出 **5 个 P2、1 个 P3** 的可复现交互/无障碍问题，没有发现需按 P0/P1 处理的已复现问题。优先修复目录 Retry、隐藏菜单焦点和新目录重复提交。

本轮只新增此报告与 `build/ui-skill-audit-1/` 内的隔离验证脚本、截图及证据；没有修改产品、现有测试或其他报告，没有提交、推送、发布或创建子任务。

> **快照与收尾说明：** 主会话在读取本报告初稿后开始修复六项问题。以下结论、严重度、代码行号及证据均对应初审时的修复前源码（校验值见 `build/ui-skill-audit-1/source-sha256.json`），不能据此断言修复中的当前文件仍存在同样问题。源文件链接会打开当前工作区，行号可能已移动。按主会话后续指示，本轮停止追加复审；未将正在修改的代码判定为通过或未通过，修复后的独立验收留待第二轮新会话。初审脚本与证据完整保留，临时追加复审进程已停止并清理，未保留其结果。

## 方法与范围

显式使用安装的 **$ui-ux-pro-max**，读取：

- `/Users/kyiw/.codex/skills/ui-ux-pro-max/SKILL.md`
- `references/quick-reference.md`（可访问性、触控、性能、布局、表单与导航规则）和 `references/pro-rules.md`。后者有 native/mobile 范围声明，未把原生 pt/dp 要求直接当作 Web 的 WCAG 要求；项目自身规定的 44×44 **CSS px** 仍作为项目验收标准。
- `docs/ui-ux-development-prompt.md`、`docs/ui-ux-implementation.md`、当前模板/CSS/JS/theme 脚本、现有 `scripts/browser_ui.cjs` 与相关服务路由。

按 skill 使用其绝对路径做了针对性本地检索，原始结果在 [skill-searches.txt](../build/ui-skill-audit-1/skill-searches.txt)：

| Query（均为 `--domain ux`） | 实际适用结果 |
| --- | --- |
| `keyboard focus modal` | Focus States、Focus Not Obscured、Keyboard Navigation |
| `touch target feedback` | Touch Target Size、Touch Spacing、Touch Friendly；区分 Web 和原生单位 |
| `error recovery empty state` | Error Recovery、Error Messages、Empty States |
| `error field validation` | Error Placement、Focusable Error Summary、Error Messages |
| `loading buttons async` | Loading Buttons：异步期间防重复提交并显示加载反馈 |
| `focus route change` → `focus-on-route-change` | 两次均未匹配到目标规则，不能用返回的 Focus Appearance 代替；F6 改用 quick-reference 的 `focus-on-route-change` 和 `keyboard-nav` 静态规则 |
| `progress accessible name` → `progress indicators` | 只匹配到通用 Progress Indicators 等，未精确匹配进度条名称问题；F5 使用 quick-reference 的通用 `aria-labels` / `voiceover-sr` 指导和实测 AX 树，未声称检索返回了专门的 progress 命名规则 |

检测到原生 HTML/CSS/JS，无对应的纯原生 Web stack 数据集；没有用 `html-tailwind` 冒充项目栈，也没有重新生成设计系统。审计建议均可在原生前端完成，保留零 CDN、默认免登录、既有后端/API/CLI/CSP/权限和英文源码、界面文案。

服务使用 `.venv312/bin/python`，显式 `PYTHONPATH=<repo>/src`，监听随机 loopback 端口；共享目录由 `mkdtemp` 创建，只放合成文件，结束后停止服务并删除。脚本逐字比对服务实际返回的 HTML、app.js、app.css、theme.js 与工作区源文件，避免测到 HEAD、旧 wheel 或 PyPI 安装。未操作 Safari 或用户真实共享目录。

严重度口径：P2 为应进入正常修复队列的可用性/无障碍问题；P3 为影响较轻、仍有顺畅继续操作路径的问题。没有把 skill 数据库的 High 标签机械映射成产品 P1。

## 已复现问题（按建议修复顺序）

### F1 · P2：目录导航失败后，Retry 重试了旧目录

**影响：** 临时失败恢复后，用户点击 Retry 仍进不了刚才请求的目录；错误消失但内容仍在旧目录，操作结果与按钮含义不符。刷新当前目录失败时不会触发这一特定问题。

**复现：** 根目录有 `Alpha/child.txt` → 让首次 `GET api/files?path=Alpha` 返回 503（后续恢复正常）→ 点击 Alpha → 点击 Retry。网络记录为 `['Alpha', '']`，而非再次请求 Alpha；面包屑仍是 Shared folder，child.txt 未出现。

**定位：** [app.js:966](/Users/kyiw/chatgpt/sharedserver/src/sharedserver/static/app.js:966) 的 `loadDirectory` 在成功前不更新 currentPath（保留旧快照的行为正确）；[app.js:992](/Users/kyiw/chatgpt/sharedserver/src/sharedserver/static/app.js:992) 的 Retry 却只调用无参数 `loadDirectory()`，丢失失败目标。

**建议：** 单独保存当前请求/失败请求的目标路径，Retry 显式传该路径；保留 currentPath、旧列表和旧选择，成功后再更新。沿用现有请求序号防止旧失败覆盖新导航。错误区可同时说明失败目标及当前展示的快照目录。

**证据：** `evidence.json → findings.retry`；[failed-folder.png](../build/ui-skill-audit-1/failed-folder.png)。依据：Error Recovery。

### F2 · P2：从 More 执行复制后，焦点留在隐藏菜单项

**影响：** 键盘用户看到菜单已关闭，但失去可见焦点；读屏焦点也没有回到仍可操作的 More 入口。此处并非键盘陷阱，继续 Tab 能到下一行，问题是执行动作后的焦点不可见。

**复现：** 在 hello.txt 的 More summary 获焦 → Enter 展开 → Tab 两次到 Copy file text → Enter。复制成功后 `document.activeElement` 仍是 Copy file text 按钮，其祖先 `details.open=false`，Playwright `isVisible()` 为 false；再 Tab 跳到下一文件的选择框。

**定位：** [app.js:769](/Users/kyiw/chatgpt/sharedserver/src/sharedserver/static/app.js:769) 的复制处理先关闭 details 后调用异步复制，未将焦点返回 summary；同一模式还用于 Copy curl。现有 `openDialog` 对关闭菜单的触发器有恢复逻辑，但直接成功复制不经过模态。

**建议：** 统一菜单动作关闭逻辑：由菜单内键盘激活、且不转移到模态时，将焦点同步返回该 summary，再开始异步复制；若列表刷新使其消失则回稳定入口。保留复制成功/手动复制反馈；不要在异步完成后抢走用户已移动的焦点。

**证据：** `findings.beforeCopy / afterCopy / copyActionVisible / afterCopyNextTab`。注意证据内 `visible` 字段仅检查矩形存在，closed details 的后代仍可能有矩形；真正的可见性检查为 `copyActionVisible=false`。依据：Keyboard Navigation、Focus States / Focus Not Obscured；本报告不宣称已完成正式 WCAG 合规判定。

### F3 · P2：New folder 请求期间没有等待状态，可重复提交

**影响：** 慢网下第二次点击/Enter 会重复发 POST。默认服务中首次已创建成功，第二次又返回冲突，最后 Toast 成了错误，用户容易误以为创建失败。

**复现：** 将 POST api/directories 延迟约 900ms → New folder 输入一个新名称 → 连续点击 Create 两次。请求期间按钮始终 enabled，文案仍为 Create，无 busy 状态；实测发出两次请求，末条反馈是 `name already exists…`，目录实际已创建。

**定位：** [app.js:1600](/Users/kyiw/chatgpt/sharedserver/src/sharedserver/static/app.js:1600) 的异步 submit 无进行中 guard；[index.html:345](/Users/kyiw/chatgpt/sharedserver/src/sharedserver/templates/index.html:345) 的提交按钮没有加载状态更新。

**建议：** submit 设置同步 guard，等待期间禁用提交并显示英文 `Creating…`，给表单合适的 busy 状态；finally 恢复。给本次表单打开/提交保存代次，避免用户关闭并重开后旧响应关闭或改写新表单。不需要修改后端或引入自动重试。

**证据：** `findings.folderPending / doubleCreate`。依据：Loading Buttons、Loading Indicators。

### F4 · P2：目录名错误仅为临时 Toast，未关联输入且恢复指引不适用

**影响：** 重名是可以直接改字段解决的常见错误。当前错误消失后，表单看起来没有失败原因；读屏重新访问字段无法获得错误说明。后端原文建议 `--rename-on-conflict`，浏览器用户无法在此表单执行该操作，且这里需要处理的是目录重名。

**复现：** New folder 输入已有名称 Alpha → Create。Toast 在模态内可见且为 alert（这一点正确），但输入没有 `aria-invalid` / `aria-describedby`；焦点仍在 Create。将指针移出 Toast 且不聚焦 Toast，约 10 秒后错误自动隐藏，dialog 仅剩 New folder / Folder name / Create。

**定位：** [app.js:1614](/Users/kyiw/chatgpt/sharedserver/src/sharedserver/static/app.js:1614) 只调用 showToast；[app.js:183](/Users/kyiw/chatgpt/sharedserver/src/sharedserver/static/app.js:183) 设置错误 Toast 10 秒；[index.html:337](/Users/kyiw/chatgpt/sharedserver/src/sharedserver/templates/index.html:337) 没有字段错误容器。

**建议：** 对目录名校验/409 映射为输入旁持续的英文错误，例如 `A folder with this name already exists. Choose another name.`，用 aria-describedby 关联、设置 aria-invalid，失败提交后回到名称输入并保留值。编辑或重新提交时合理清除旧错误。单字段表单无需额外做复杂错误摘要；一般网络错误仍可保留表单级反馈。

**证据：** `findings.folderError / folderErrorAfterTimeout`；[folder-validation.png](../build/ui-skill-audit-1/folder-validation.png)。依据：Error Placement、Error Recovery、focus-management。并非“错误完全没有读屏播报”。

### F5 · P2：上传进度条没有可访问名称，多个任务无法按控件区分

**影响：** 通过读屏的进度控件导航时，多个任务均只有无名称的 progressbar。视觉上旁边有文件名，但并未成为进度控件的名称，也没有任务分组语义；Queued / Uploading / Finishing 等状态与条形值缺少程序化关联。

**复现：** 一次选择 first-upload.txt、second-upload.txt，延迟上传响应 → 读取 Transfers 的浏览器无障碍树。两个条目分别是独立文本、无名称的 `progressbar`、状态文本、已命名的 Cancel 按钮；progress 既无 label 也无 aria-label / aria-labelledby。后续失败状态仍为无名称 progressbar。

**定位：** [app.js:1314](/Users/kyiw/chatgpt/sharedserver/src/sharedserver/static/app.js:1314) 的 createTask 创建裸 progress 和普通 div，没有关联文件名/状态。

**建议：** 给文件名与状态生成稳定 id；progress 用 aria-labelledby 关联文件名、aria-describedby 关联状态，必要时用 aria-valuetext 表达阶段；每项可有命名 group。保留现有批量结果 Toast，**不要**将每个百分点塞进 live region。

**证据：** `findings.queueAX / progress / queueFailedAX`；[mobile-active-queue.png](../build/ui-skill-audit-1/mobile-active-queue.png)。依据：quick-reference 的通用命名与读屏规则；这是浏览器 AX 结构复现，未冒充 VoiceOver/NVDA 人工听读结果。

### F6 · P3：键盘进入目录后，焦点落回 body，没有目录内容的稳定落点

**影响：** 用户可以继续 Tab 操作，但当前焦点环消失；辅助技术缺少一个包含新目录名称/内容的明确落点。影响低于 F2：下一次 Tab 实测能进入 child.txt 的选择框，未发生阻断。

**复现：** 键盘聚焦 Alpha 文件夹按钮 → Enter → 等待 child.txt 列表成功。activeElement 为 BODY；下一次 Tab 到 child.txt 选择框。面包屑/列表更新时原触发器被删除，没有恢复或转移焦点。

**定位：** [app.js:707](/Users/kyiw/chatgpt/sharedserver/src/sharedserver/static/app.js:707) 与 [app.js:980](/Users/kyiw/chatgpt/sharedserver/src/sharedserver/static/app.js:980) 重建节点，导航完成后没有针对被删除触发器的焦点管理。

**建议：** 仅对用户显式目录导航且焦点仍属于本次旧内容的情形，将焦点放到可程序聚焦的文件区域标题/当前目录说明，包含目录名；与被动刷新区分，不在上传完成、visibilitychange 等后台刷新时抢焦点。可用包含目录名的完成状态补充反馈。

**证据：** `findings.folderFocus / folderNextTab`；[folder-keyboard.png](../build/ui-skill-audit-1/folder-keyboard.png)。依据：quick-reference 的 focus-on-route-change、keyboard-nav；此项是适用于本工具的连续导航建议，不要求引入 SPA 路由或修改 URL/API。

## 视觉与交互观察：不列为缺陷的部分

初审浏览器为 Playwright 1.62.1 / Chromium 151.0.7922.34。另建 hasTouch/isMobile 的 375×812 模拟上下文，实际 tap 长文件名的 Preview 和关闭按钮成功，预览热区为 44×44 CSS px；reduced-motion 下 Toast animationName 为 none。该模拟不代替真机验证。

实际查看了桌面双栏、手机卡片、浅深色、短横屏、文本面板、空目录/无搜索结果、模态错误和展开队列截图。1280×900、375×812、320×568、844×390 的浅深色共 8 个基础 Files 场景均有 `scrollWidth === clientWidth`，未发现这些场景中的页面横向溢出。此结论不推广到未测的所有内容组合。

现有分栏/卡片、系统字体、主题和 SVG 图标具有一致性；空目录有明确文案，无结果有 Clear search；目录失败保留旧快照并有说明；模态内能看见错误 Toast。手机文本可编辑和同步，Clear 模态 Esc 后焦点回到 Clear。没有证据支持为了个人审美推翻当前配色、布局或引入框架/CDN。

**可选审美建议（非缺陷、非发布阻塞）：** 若后续用户反馈手机浏览文件效率低，可微调目录卡片的留白与元数据排布。当前完整换行、保留修改时间和 44px 操作区符合既定取舍，不建议在本轮审计中直接压缩或隐藏信息。

## 复现产物与限制

- 验证脚本：[build/ui-skill-audit-1/audit.cjs](../build/ui-skill-audit-1/audit.cjs)。这是独立问题复现/记录脚本，不是对现有 72 场景矩阵的重跑，也没有修改已有浏览器脚本。
- 结构化结果：[evidence.json](../build/ui-skill-audit-1/evidence.json)；运行输出：[run-output.json](../build/ui-skill-audit-1/run-output.json)；源文件校验值：[source-sha256.json](../build/ui-skill-audit-1/source-sha256.json)。全部截图都在同一 build 子目录，仅包含合成数据。
- 运行命令：

  ```sh
  NODE_PATH=/Users/kyiw/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules \
  /Users/kyiw/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node \
  build/ui-skill-audit-1/audit.cjs
  ```

503、上传 409 与慢网由 Playwright 拦截注入；目录重名和双提交的最终冲突来自真实临时目录服务。主页面记录未见 pageerror 或跨源请求；这只是本轮请求观察，不是完整 CSP、安全或权限审计。所有六项均不需要修改后端权限边界。

未测：真实 iOS/Android、软键盘/真机图片选择器、真实 200% 浏览器页面缩放、完整 Safari/Firefox、VoiceOver/NVDA 人工听读、全量颜色/焦点对比度测量，以及各种认证/权限组合、LAN HTTP 剪贴板降级、ZIP/QR 解码/CLI、完整上传取消竞态与 72 场景回归。本轮默认服务免登录；不将 loopback secure context 的复制结果当作 LAN HTTP 兼容证明。原实施报告的测试结果仅作为上下文，未当成本轮重新验收通过。没有改产品，因此未重复 Python 全量测试或构建/打包。
