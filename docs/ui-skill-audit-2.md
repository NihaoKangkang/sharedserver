# UI Skill 独立复审 2

日期：2026-10-21（Asia/Shanghai）。对象：SharedServer 第一轮修复后的**当前未提交工作区**。

**结论：F1–F5 的原始问题已独立验证修复，Toast 悬停与焦点组合暂停通过；F6 部分修复，仍需补齐目录导航的焦点可见性和 Retry 焦点落点。** 本轮记录一组 P3 焦点连续性残余，含下面两个可复现场景；未发现新的 P0/P1/P2 问题。没有证据支持重做现有视觉方向。

本会话只新增本报告及 `build/ui-skill-audit-2/` 内的独立脚本、截图、结构化证据。未修改产品、现有测试、第一轮报告，未提交、推送、发布或新建子任务。主会话运行的回归和 72 UI 矩阵仅作背景，未计入本轮通过证据。

## 方法与规则来源

显式使用 **$ui-ux-pro-max**，读取安装的 [SKILL.md](/Users/kyiw/.codex/skills/ui-ux-pro-max/SKILL.md)、[quick-reference.md](/Users/kyiw/.codex/skills/ui-ux-pro-max/references/quick-reference.md) 及 `pro-rules.md`。同时阅读 `docs/ui-ux-development-prompt.md`、`docs/ui-skill-audit-1.md`、当前模板/CSS/JS/theme、相关服务路由及现有浏览器回归。未找到适用的仓库或祖先 AGENTS.md。

本地规则检索通过 skill 脚本绝对路径执行，原始结果在 [skill-searches.txt](../build/ui-skill-audit-2/skill-searches.txt)：

| Query，均为 `--domain ux` | 使用方式 |
| --- | --- |
| `keyboard focus navigation` | Keyboard Navigation、Focus States，支持可见焦点检查 |
| `error field validation` | Error Placement、Error Messages；单字段表单无需额外增加多错误摘要 |
| `async loading buttons` | Loading Buttons、Loading States、Loading Indicators，检查等待反馈和防重复提交 |
| `error recovery` | Error Recovery，检查 Retry 的真实目标与恢复路径 |
| `focus not obscured` | 返回 Minimum / Enhanced 两条，区分 AA 与 AAA；本报告不据此宣称完整 WCAG 合规或不合规 |
| `toast pause focus` → `toast hover pause` | 两次未返回精确的组合暂停规则，只得到通用 Toast / Hover / Focus 结果；组合暂停直接依据项目 Prompt §11 和实测，不声称数据库有专门匹配 |

进度条命名使用 quick-reference 的 `aria-labels` / `voiceover-sr` 通用指导，目录导航使用 `focus-on-route-change` / `keyboard-nav`。检测到原生 HTML/CSS/JS，未用 Tailwind 栈冒充项目栈，未生成新设计系统。`pro-rules.md` 有原生移动范围声明，未把其 pt/dp 当作 Web CSS px；44×44 CSS px 来自项目自身规格。

隔离服务绑定随机 loopback 端口，共享目录均为 `mkdtemp` 新建的合成数据，结束后停止服务并删除。启动显式设置 `PYTHONPATH=/Users/kyiw/chatgpt/sharedserver/src`；主脚本通过测试专用 ASGI 包装器调用**未修改的** `create_app`，仅为指定上传延迟发送响应，以观察真实浏览器上传后的 Finishing。另一个聚焦确认脚本直接用 `python -m sharedserver` 启动默认免登录服务。未操作用户 Safari 或真实共享目录。

服务返回的 HTML、app.js、app.css、theme.js 和本地 QR JS 均与当前源文件 SHA-256 一致，结束后及报告写入前再核对产品源文件没有变化。详见 [source-sha256.json](../build/ui-skill-audit-2/source-sha256.json)。

## 第一轮修复验收

结构化证据均位于 [evidence.json](../build/ui-skill-audit-2/evidence.json) 的 `cases`；下表没有借用主会话测试结果。

| 项目 | 本轮结论与实际证据 |
| --- | --- |
| **F1 失败导航 Retry 目标** | **已修复原问题。** Alpha 首次请求注入 503，失败后仍显示根目录列表、根面包屑和 hello.txt 的选中；错误说明同时包含失败目标与旧快照目录。键盘执行 Retry 后请求序列为 `['Alpha','Alpha']`，出现 child.txt，目录上下文为 Alpha。证据：`retry`、[失败截图](../build/ui-skill-audit-2/failed-navigation-desktop.png)。Retry 成功后的焦点残余见下文 R1-B。 |
| **F2 More 复制焦点** | **已修复。** 键盘执行 Copy file text 后菜单关闭，焦点在可见的原 More summary；读取到的本机剪贴板内容与合成源文本相同。Copy curl 同样返回 summary。另延迟 api/text 响应，用户先移到编辑器，复制完成后焦点仍在编辑器，没有迟到抢焦点。证据：`copyText`、`copyCurl`、`slowCopy`。 |
| **F3 新目录异步防重复与迟到隔离** | **已修复。** Enter 提交后，追加 Enter 及额外 `requestSubmit()`，实际仅一个 POST；按钮 disabled 且显示 Creating…，form `aria-busy=true`，名称暂为只读，最终只创建一次。分别测试旧请求成功和 409 失败：关闭并重开、输入 NewDraft 后释放旧响应，dialog 仍打开，新值、焦点、无错误状态和可提交状态均保留。证据：`folderPending`、`lateFolder_success`、`lateFolder_error`。正常提交使用实际键盘；额外 submit 事件用于验证同步 guard。 |
| **F4 持久字段错误、关联与焦点** | **已修复。** 对真实已有目录 Alpha 提交，出现可执行的 Choose another name 指引，保留 Alpha，输入 `aria-invalid=true`、`aria-describedby=folder-error`，焦点回名称输入。AX 快照有 invalid textbox 和 alert；移开指针等待 10.5 秒，内联错误仍在。编辑后错误及 invalid 属性清除。证据：`folderValidation`、[桌面浅色](../build/ui-skill-audit-2/folder-validation-desktop.png)、[手机深色](../build/ui-skill-audit-2/mobile-dark-folder-error.png)。 |
| **F5 上传进度名称与阶段** | **已修复。** 第一个真实上传已被服务接收、响应暂缓时，显示 Finishing，第二项 Queued；AX 树为分别命名的 group 和 progressbar。每条 progress 通过 `aria-labelledby` 关联文件名、`aria-describedby` 关联状态，`aria-valuetext` 包含阶段。Finishing 移除数值，响应完成后第一项 Done/100，第二项注入 409 后 Failed/错误原因，名称关联继续保留；没有逐百分比 live region。证据：`progress`、`mobileQueueAX`、[桌面阶段](../build/ui-skill-audit-2/upload-stages-desktop.png)、[手机队列](../build/ui-skill-audit-2/mobile-dark-queue.png)。 |
| **F6 目录导航焦点及后台刷新** | **部分修复。** 未滚动时键盘进入 Alpha 后，焦点为 Files 标题，`aria-describedby` 连接 Current folder: Alpha，[截图可见焦点环](../build/ui-skill-audit-2/folder-focus-desktop.png)。真实上传完成触发目录刷新时，编辑器焦点、文本及选区 `[9,15]` 保留，未抢焦点。长列表导航和 Retry 仍有残余，不能整体标为通过。证据：`navigation`、`backgroundRefresh`、`scrolledNavigation_*`。 |
| **Toast 悬停+焦点暂停** | **已修复本轮目标。** 同时悬停并聚焦 Toast 关闭按钮，再移开指针，等待 4.4 秒仍可见；另一次同时悬停并聚焦后将焦点移出、保持指针悬停，等待 4.4 秒仍可见。两种情况下都在最后一种暂停条件解除后正常消失。证据：`toast`。 |

## R1 · P3：目录导航焦点连续性仍未完整修复

这是第一轮 F6 的残余与同类恢复路径遗漏，按一组问题记录，未将两个触发场景拆成多个独立设计缺陷。保留 P3：会失去当前可见焦点/目录起点，但没有阻断后续操作；聚焦确认实测再按 Tab 可回到可见 Upload files，不是键盘陷阱。

### A. 从长列表进入长目录，标题获焦但完全在视口上方

**复现：** 建立 ManyFolders，内有 24 个普通子目录及末尾 Z_Target；Z_Target 内有 50 个普通文件。打开 ManyFolders，滚动到 Z_Target，聚焦其按钮，Enter 进入。新目录也足够长，不会因页面缩短自动把滚动位置压回顶部。

| 视口 | 导航前 scrollY / 文档高度 | 导航后 scrollY / 文档高度 | 标题 top | 实际焦点 |
| --- | --- | --- | --- | --- |
| 1280×900 | 1624 / 2524 | 1623 / 4349 | -1411.5 | `#files-title`，完全在屏外 |
| 375×812 | 3907 / 4719 | 3907 / 10964 | -3638.6 | `#files-title`，完全在屏外 |

截图显示视口停在 destination_17 等新目录中段，没有标题焦点环。[桌面](../build/ui-skill-audit-2/scrolled-navigation-1280.png)、[手机](../build/ui-skill-audit-2/scrolled-navigation-375.png)。独立 CLI 服务上的第二次手机复现也得到标题 top≈-3845；随后 Tab 到 `#choose-files`，浏览器才滚回顶部。见 [focus-confirm.json](../build/ui-skill-audit-2/focus-confirm.json)。这不是只看 activeElement 或被短目录自动回顶造成的判断。

**定位：** [app.js:947](/Users/kyiw/chatgpt/sharedserver/src/sharedserver/static/app.js:947) 在原目录行消失后将焦点回退到标题，但使用 `preventScroll:true`；[app.js:739](/Users/kyiw/chatgpt/sharedserver/src/sharedserver/static/app.js:739) 的面包屑焦点回退也沿用该选项。前者在本轮长列表场景已实际复现；后者为相同实现的定位参考，未额外宣称已测完全部面包屑路径。

### B. 键盘执行 Retry 成功后，焦点回到 body

**复现：** 根目录进入 Alpha 首次失败 → Tab/聚焦 Retry → Enter → 成功显示 child.txt。请求目标已正确修复，但 `document.activeElement` 为 BODY，既无标题落点，也无可见焦点环。证据：`cases.retry.after`。

**定位：** [app.js:1007](/Users/kyiw/chatgpt/sharedserver/src/sharedserver/static/app.js:1007) 在发起请求时先隐藏获焦的 Retry；成功后焦点既不属于旧表格行，也不属于面包屑，[app.js:1018](/Users/kyiw/chatgpt/sharedserver/src/sharedserver/static/app.js:1018) 的渲染没有为该恢复动作建立新落点。

**建议：** 给用户显式导航（目录、面包屑、导航失败后的 Retry）保留本次动作及焦点归属；成功且用户没有移向其他编辑控件/模态时，将上下文标题聚焦并确保其在实测 sticky header/tabs 下方可见。可针对显式导航使用合适的滚动/scroll-margin，而非统一 `preventScroll:true`。后台刷新、上传完成以及用户已经移动焦点时继续保持现有不抢焦点行为；同路径刷新还应区分于进入新目录。无需修改后端、API、权限或引入路由框架。

## 有限探索与视觉检查

独立验证 Alpha 慢旧响应在 Beta 成功后到达，当前目录仍是 Beta、second.txt 仍可见，child.txt 未覆盖新列表（`staleListing`）。markup.html 预览按原字符显示 `<script>` 与 `<h1>`，未执行脚本，Esc 后焦点回对应 More（`plainPreview`）。这些有限探索未产生新的重大问题。

Playwright 1.62.1 / Chromium 151.0.7922.34。实际查看桌面浅深色、手机浅深色、平板表格、目录字段错误、编辑器、队列和长列表导航截图。基础 Files 抽样如下，未重跑 72 场景矩阵：

| 视口 | 主题 | 实际布局与溢出 |
| --- | --- | --- |
| 320×568 | Light / Dark | tabs + 卡片，scrollWidth/clientWidth 均 320 |
| 375×812 | Light / Dark | tabs + 卡片，均 375 |
| 768×900 | Light / Dark | tabs + 五列表格，均 768 |
| 1280×900 | Light / Dark | 双面板 + 五列表格，均 1280 |

html/body 的 overflow-x 实测均为 visible，没有以全局裁切掩盖横向溢出。长文件名仍完整换行，下载入口保留。375×812 的另一个 `hasTouch/isMobile` Chromium 上实际 tap 打开/关闭预览、提交目录名并看到错误、切到文字面板输入；聚焦确认另外等待并验证了真实预览文本，见 [手机浅色预览](../build/ui-skill-audit-2/mobile-light-preview.png)。主脚本 `mobilePreview.content` 是刚打开时读取的加载中空值，不当成预览内容成功证据。

对手机长文件名卡片的 Download / Preview / More 分别滚入视口，测得 96×44 / 44×44 / 44×44 CSS px，中心命中正确且在视口内（`mobileTargets`）。这只证明抽样目标，未将其扩大成所有控件/所有浮层组合都已通过。

现有浅深主题、系统字体、SVG 图标、表格/卡片和错误表现一致；本轮没有提出无依据的配色、间距或框架重做。观察到的 HTTP 页面/资源请求无跨源请求，主页面与触摸仿真页未记录 pageerror 或 CSP violation；这是本轮观察，不等同完整安全审计。源码保持既有本地资源、默认免登录、原生前端与后端/API/CLI/CSP/权限边界。

## 产物、命令与限制

- 主验证：[audit.cjs](../build/ui-skill-audit-2/audit.cjs)、[isolated_server.py](../build/ui-skill-audit-2/isolated_server.py)、[evidence.json](../build/ui-skill-audit-2/evidence.json)、[运行结果](../build/ui-skill-audit-2/run-output.txt)。`completed=true` 表示取证流程完成，不代表所有产品检查无残余。
- 聚焦确认：[focus-confirm.cjs](../build/ui-skill-audit-2/focus-confirm.cjs)、[focus-confirm.json](../build/ui-skill-audit-2/focus-confirm.json)。运行成功，临时服务/目录已清理。
- [harness-notes.md](../build/ui-skill-audit-2/harness-notes.md) 记录取证脚本先前的两项调整：上传拦截影响真实发送、Preview label 同时匹配隐藏菜单副本。二者均为 harness 调整，未误报为产品问题。
- 其余截图与规则检索均在 `build/ui-skill-audit-2/`，只含合成目录、文件与文本。

实际运行：

```sh
NODE_PATH=/Users/kyiw/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules \
/Users/kyiw/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node \
build/ui-skill-audit-2/audit.cjs

NODE_PATH=/Users/kyiw/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules \
/Users/kyiw/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node \
build/ui-skill-audit-2/focus-confirm.cjs
```

服务使用 `.venv312/bin/python`；脚本启动时显式设置 `PYTHONPATH=<repo>/src`。503、旧目录请求失败和第二个上传 409 使用可控注入；目录重名来自真实后端，首个上传正常写入合成共享目录。没有用直接修改产品状态或强制点击隐藏控件替代用户路径。

未测：真实 iOS/Android、Safari/Firefox、真实软键盘/文件选择器、VoiceOver/NVDA 人工听读、真实浏览器 200% 页面缩放、全量文字/焦点对比度、全部权限/认证组合、LAN HTTP 剪贴板降级、ZIP/QR 解码/CLI 全套功能、完整上传取消竞态和 72 场景回归。浏览器 AX 快照不等同真实读屏听读，触摸仿真不等同真机，loopback 剪贴板成功不等同 LAN HTTP 可用。因本轮只读产品，未重复 Python 全量测试、打包或发布检查。

**收尾：仍建议补完 R1 后对两个触发场景定向验收；其余已通过项不需要本轮额外修复。** 本轮到报告与证据交付结束。
