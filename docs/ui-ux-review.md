# sharedserver 0.3.0 UI/UX 独立评审

评审日期：2026-10-20。代码基线：`1030e76`，`pyproject.toml` 声明版本 `0.3.0`。本次交付仅新增本评审与开发 Prompt，不修改业务代码，不提交、不推送、不发布。

## 1. 结论与输入评价

建议实施一次有边界的前端工作台重构。三份输入的视觉、搜索、文本效率与移动卡片方向成立，但不能原样拼接：断点、卡片圆角、sticky 层叠、权限徽章、受保护 URL 分享和预览能力存在冲突。最需要优先解决的是窄屏动作被挤出、状态反馈与权限语义；二维码和音视频不能靠猜测后端能力实现。

已完整阅读原始附件 `Pasted text.txt`（“前端 UI/UX 现代化重构与高频交互升级”），同时纳入移动专项 A 和统一建议 B，三者权重相同。以下为独立判断：

| 输入 | 可保留部分 | 需要修正部分 |
| --- | --- | --- |
| 原始附件 | 零 CDN、CSS 变量、主题持久化、工作台、搜索排序、全局粘贴/拖放、可取消队列、文本工具、HTTP 复制降级 | 960px 双栏过早；当前地址不能恢复私密凭证；音视频没有专用预览接口；模式不能只看 `mode`；图片原件并非一定 PNG |
| A：移动专项 | 768px 表格/卡片分界、文件名完整换行、常驻下载、44px 热区、长命令局部处理 | 底部常驻 curl 改入更多；10px 卡片圆角统一为 12px；tabs 的 top:0 不能与 sticky header 冲突 |
| B：统一建议 | 浅深色令牌、12/8 圆角、系统字体、四态 Toast、移动更多菜单、保持 API/CLI | 768px 就双栏会让文本栏和文件动作过窄；“不准 confirm”落实为自定义清空确认；不得为了 UI 效果改变同步/权限机制 |

本文的判断基于本地源码和测试，不依赖互联网泛搜，也没有把浏览器模拟等同于真实手机验证。可直接执行的完整规格见 [ui-ux-development-prompt.md](ui-ux-development-prompt.md)。

## 2. 真实代码约束与可行性

| 证据 | 已确认事实 | 对重构的约束 |
| --- | --- | --- |
| `templates/index.html`、`static/app.css` | 已用本地静态资源；当前主体纵向排列、700px 简化表格；动作栏存在最小宽度；按钮目前可小于 44px | 需要实际重排为三段响应式；不能只加全局 `overflow-x:hidden` 掩盖现有溢出 |
| `static/app.js:54–62`、`server.py:289–295` | URL 以当前根页相对构造，随机路径通过外层 mount 提供 | HTML、CSS、JS、API、WS、下载、ZIP 必须保留 `/s/<secret>/` 前缀；不能硬编码站点根 `/api/...` |
| `server.py:133–139`、`config.py:31–41` | config 返回 `mode/can_read/can_upload/can_write_text/private_link`；不返回 token、PIN、密码、完整私密 URL；旧只读仅锁文件写入 | 按 capability 驱动控件；增加 `FILES READ-ONLY` 徽章，避免误报 FULL 或完全 READ-ONLY |
| `server.py:78–114`、`access.py` | token/PIN 首访后 303 清查询，换 HttpOnly、SameSite Cookie；Basic 可以与 PIN/token 组合；random path 单独启用时 `private_link` 仍可为 false | `location.href` 不是通用可分享凭证；不能读取/导出 Cookie、反查秘密或开放认证配置接口；random path 本身也需按分享秘密处理 |
| `server.py:239–255`、`clipboard.py` | 文本预览可复用 `/api/text`；按配置 allowlist、字节上限读取，使用 UTF-8-SIG 并替换无效字节；图片接口校验扩展名和 PNG/JPEG/WebP 头签名 | 不误写“所有文本严格拒绝非法 UTF-8”：严格校验属于 raw 文本写入。`.sh` 不在默认 allowlist，不能因 UI 示例而私自扩大；图片不执行 SVG |
| `server.py:201–237` | 普通下载是 attachment，支持 HEAD/Range；ZIP 由磁盘临时归档后返回，支持原生表单 POST | 保留下载语义；ZIP 不能 fetch 后全量 Blob。暂无专用音视频流路由，不应假装已有媒体播放器能力 |
| `static/app.js:439–513`、`file_manager.py` | PUT/XHR 直接发送 File，队列串行且入队捕获目录，已有速率/ETA；取消路径尚未接到 UI | 只需显式任务状态与 abort，不需要重写 multipart、并发大缓冲或修改后端上传协议 |
| `static/app.js:86–167`、`websocket.py` | full 输入实时同步、IME 有处理；drop-only 明确提交并落盘；本地版本、发送快照与 ACK 防止清新草稿；断线重连保留草稿 | 不用“统一保存按钮”替换 full 自动同步，不在 drop-only 输入/粘贴时自动提交；不做透明重发导致重复落盘 |
| `static/app.js:168–192,349–403,543–569` | 文字已有 HTTP execCommand 降级；图片已有受限 PNG 转换与预览降级；粘贴尊重其他输入框 | 增强反馈、资源释放与焦点恢复，不能退化为只支持 HTTPS、自动读取系统剪贴板或抢走其他输入框内容 |
| `tests/test_project_language.py` | 应用源码、Python 测试含中文会失败；页面不得声明 favicon | 中文规格不意味着翻译产品 UI；实现和 UI 文案保持英文，品牌内联 SVG 不添加 favicon |
| `scripts/browser_smoke.cjs`、`scripts/browser_vnext.cjs` | 依赖现有 IDs、角色/英文名称、全局 `socket`，且默认面板同时可见 | 保留单一 DOM 与业务断言；允许迁移测试以显式选择 tabs/更多菜单；不得通过删除测试或绕开隐藏面板来“通过” |

## 3. 单一冲突决策

### 3.1 布局、视觉与空间

1. **统一三段布局**：`>=1024px` 为左文件、右剪贴板 62:38；`768–1023px` 为单工作区 tabs + 紧凑表格；`<768px` 为 tabs + 文件卡片。1024px 时左栏已经需要容纳五列表格，若 768/960px 就双栏，动作和完整文件名无法可靠兼顾。以 CSS 布局视口宽度判断，缩放后重新响应；不按设备型号判断。
2. **五列表格**：选择、图标/名称、大小、修改时间、动作。动作各宽度统一为 Download、支持时的 Preview、More，curl 和原有内容复制放 More；桌面可用带可访问名称的 44px 图标按钮，防止 1024px 左栏动作过宽。目录只有进入导航，不出现下载、curl 或 ZIP 选择。`<768px` 保留可访问结构，将每条记录变卡片，隐藏 thead；首行名称与下载主按钮，第二行 12px 元数据，底部预览/更多。文件名 `word-break:break-all`，下载不缩小、不挤出。移动选择框放底部工具栏，避免320px首行拥挤；1024px双栏的表格按实际面板宽度换行，并将次要动作收进More，不能仅以视口断点判断列宽充足。卡片间距 12px、padding 14px；圆角统一 12px，控件 8px。
3. **单一 sticky 责任**：桌面 header sticky top:0；窄于 1024px 时 header 正常随文档滚动，tabs sticky top:0、z-index:100、blur(8px)。不要同时让两者 top:0。面包屑可在 header 内分行/局部滚动，不能挤掉按钮。
4. **右栏 sticky 有条件生效**：桌面 top 为实测 header 高度 + 16px；仅当右栏全部内容高度不超过可用视口高度时 sticky。短高度、编辑器拉高、200% 缩放、虚拟键盘或内容增长使其放不下时改为正常文档流；不能固定高后裁掉操作。动态重测高度，不能仅依赖一个宽度 media query。
5. **不横向溢出的含义**：文档不横向滚动，每个实际操作按钮都在可见宽度内。名称/路径/错误可换行，flex/grid 子项用 min-width:0，工具栏可换行。长代码/命令/面包屑允许有标识的局部滚动，按钮不放进那个滚动区。禁止以全局 overflow:hidden 或父容器裁切当作修复。
6. **主题三态**：System / Light / Dark，默认 System；用户可恢复 System。只存非敏感显示偏好，storage 抛错则内存降级；系统变化仅在 System 状态影响页面。CSS 提供无 JS 时的系统主题，初始化脚本保持本地外部文件，不添加 inline script。

### 3.2 能力与行为

| 实际 capability | 徽章与界面语义 |
| --- | --- |
| read=true, upload=true, write_text=true | FULL：浏览、下载、ZIP、上传、新目录、自动同步文本 |
| read=true, upload=false, write_text=false | READ-ONLY：浏览、下载、预览、复制到本机；隐藏服务端写操作 |
| read=true, upload=false, write_text=true | FILES READ-ONLY：文件只读，文字仍自动同步；不允许粘贴/拖放文件上传 |
| read=false, upload=true, write_text=true | DROP-ONLY：仅上传根目录、编辑并明确提交文字；不读取目录、历史文本或图片，不展示假文件数/历史记录 |

以 boolean capability 作最终门禁，`mode` 只作说明。配置尚未加载或失败时所有写入口默认不可用，并可重试；不新增账号、登录页面或认证要求。只读仍可复制内容到本机，因为这不是服务端写入。

搜索只过滤当前目录名称；目录固定排前，默认名称升序。排序改变顺序但保留选择；搜索改变时选择集取与可见普通文件的交集，并提示移除了多少项。全选仅选可见普通文件，最多 200 项；成功重新加载目录（含刷新、自动刷新、上传后刷新）清空选择，失败则保留旧快照并标明旧数据。规则在工具栏明确呈现，防止不可见选择被打入 ZIP。

full 的“同步”快捷键只是立即发送当前草稿，日常编辑继续自动同步；drop-only 的同一位置标记为 Submit text，必须明确操作才落盘。清空 full 共享文本需自定义确认，确认后同步空文本；drop-only 清空仅丢弃本地未提交草稿；readonly 不提供清空。状态时间只在 ACK/收到远端更新后更新，不能把发起请求伪装成已同步。

### 3.3 受保护 QR/curl 的唯一安全流程

- 点击 QR 才进入分享对话框。普通无保护、无随机前缀服务可使用当前 base URL，点击 Generate 才展示码；若是 localhost/127.0.0.1/::1，明确提示其他设备无法用该地址连接。
- `private_link=true` **或** base 含随机 `/s/<secret>/` 时，不自动以当前地址生成可分享码或复制命令。要求用户手动粘贴终端完整链接；也可只生成“需补凭证”的 curl 模板。不能因为 `private_link=false` 就把 random path 当公开路径。
- 手动链接限定 HTTP(S)、当前 origin 与完整 base pathname（含随机前缀和末尾 `/`）；只允许单一 token 或 pin 查询，拒绝 userinfo、fragment、其他查询和控制字符。不联网试探输入链接。若需改用 LAN 地址，先用终端 LAN 链接打开该地址再操作；不猜测网络接口。Basic 仍可能需要设备各自输入凭证，二维码不承诺含全部认证。
- QR 显示前用英文内联说明“二维码可能包含访问秘密；持码者可访问”。这是用户主动分享步骤，不是新增登录。无法安全生成时显示原因和终端已有二维码指引，不伪造二维码。
- curl 用真实 `api/download?path=...`，`URLSearchParams` 编码路径、保留 base；对 URL 和输出文件名作 POSIX shell 单引号转义；输出名加 `./` 前缀，使用 `--globoff --output`，避免 `-O` 取错查询文件名、前导 `-` 或 shell 注入。只承诺 POSIX shell，不能宣称同一命令通用于 PowerShell/cmd。
- config 不区分 Basic/PIN/token 类型。curl 辅助器由用户选择 None / Token / PIN / Basic / Basic+Token / Basic+PIN 模板。Basic 采用 `--user 'USERNAME'` 让 curl 提示密码，token/PIN 用清楚的占位 query 或用户手动输入链接已有的 query；未知凭证时标记“Template — credentials required”，禁止提示“可直接执行”。不读取浏览器 Basic 缓存或会话 Cookie。
- 真实手动链接仅在当前对话框内存中暂存。用户显式点击复制/Generate 才输出，关闭即清输入、临时 QR/命令和引用；不写 local/sessionStorage、URL hash/history、日志、Toast、上传队列、截图或自动下载。random path 同样不落地。测试只使用合成凭证。
- QR 生成器允许 vendored 小型官方源码并附版本、来源与完整许可证，运行时全本地；优先 Canvas 或 DOM 创建 SVG，不能由库生成 inline handler/script。若现有 CSP 不兼容，换实现或明确阻塞，禁止加 unsafe-inline/unsafe-eval、扩大 connect-src 或降低认证。

### 3.4 预览、图片下载与范围

首版必须实现 **纯文本/代码模态预览和安全图片预览**，使用后端 `copy_kind` 与已有 API。HTML/Markdown/XML/JS 即使被允许读取，也只通过 `textContent`/`pre` 显示字符；不做 Markdown 渲染、iframe、srcdoc、object、eval，不内联用户 SVG。超限、非 allowlist、伪图片明确回退下载。

**音频/视频预览延期**。已有下载的 Range/HEAD 不代表 CSP/MIME/attachment 已适合播放器；本轮不添加媒体路由，不为播放器全量 fetch 大 Blob，不改变下载响应头。媒体文件仍有类型图标和下载，说明首版不支持预览。后续需独立定义同权限流路由、MIME allowlist、CSP、带宽和浏览器验证。

图片原件下载继续走 `/api/download`，按钮称 Download original，保留真实 PNG/JPEG/WebP 后缀；不能把 JPEG/WebP 重命名成 PNG。复制图片时才做受限 PNG 转换，沿用 20 MiB / 40,000,000 像素边界，拒绝大图、错误解码和缺少 API；非安全上下文用预览、长按/右键与原件下载降级。HTTPS 仅改善条件，不保证权限、证书信任或浏览器支持。

## 4. 必须、可选与延期清单

| 等级 | 范围 | 验收条件 |
| --- | --- | --- |
| 必须 | 主题、令牌、图标、布局、header、面包屑、权限/连接状态、快捷键帮助、可访问 Toast/模态 | 不新增外链资源、保持英文 UI、全部宽度按钮可达；四态不只靠颜色 |
| 必须 | 当前目录搜索/排序、卡片/表格、可见选择、原生 ZIP、既有新目录/文件内容复制/原件下载 | 不丢旧功能；目录不可下载；选择上限 200，错误/空/无结果分开 |
| 必须 | 安全图片/文本预览、图片 HTTP 降级 | 不执行内容、不突破 allowlist；清除异步预览、objectURL 与转换画布资源 |
| 必须 | 可折叠可取消上传队列、全局文件拖放/粘贴 | 保持串行流式 PUT、捕获目的目录；取消与异常释放队列，继续后续任务 |
| 必须 | 文本统计/字体/换行/复制/同步/清空、草稿与 ACK 回归 | 字符与 UTF-8 字节分别显示；IME、断线保留、drop-only 不自动提交/不读历史 |
| 必须 | QR 入口、手动凭证分享、curl 模板与安全引用 | 缺凭证时说明限制；绝不伪造可分享链接或导出 Cookie |
| 可选 | 微动画 | 尊重 reduced-motion、不阻碍功能；静态 SVG 定义不混入用户内容 |
| 延期 | 上传文件夹/目录拖放递归 | 没有目录上传协议，不能静默扁平化/递归发路径。后续单独设计，不影响本轮验收 |
| 延期 | 音视频预览、富文本/语法高亮、目录递归 ZIP、云中转/账号、后台持久化任务 | 不扩大首版 API、安全或资源范围 |

## 5. 开发验证与交付边界

开发 Prompt 明确列出 320/360/390/430/767/768/820/960/1024/1280/1920 全宽度测试，短高度、横屏、200% 缩放、虚拟键盘、按钮 boundingRect/44px 热区/遮挡、权限、认证与断线回归。`scrollWidth <= clientWidth` 只是必要条件，必须逐项证明按钮能看见和点击，不能通过隐藏/裁切通过。

现有浏览器脚本在 950/1000/390px 下默认可直接操作两面板；新的默认 Files tab 会使原脚本失败。开发时必须加入 `showWorkspace()` 一类真实 tab 操作，移动更多菜单显式打开，保持原有选择器/角色名称或提供逐一迁移。不能让测试直接写隐藏 textarea、force click 或取消原有断言。共享 socket 仍只有一个，tabs 切换不重新创建 DOM/状态/连接。

本次本地实际执行 `.venv/bin/python -m pytest --collect-only -q` 确认 57 项，再执行 `.venv/bin/python -m pytest -q`，结果 **57 passed**。本次未运行浏览器或真实手机验证；两套浏览器回归及新增响应式/交互矩阵是后续实现的交付门槛，不能将此文档视为 UI 已通过验收。

后续交付需列出修改文件、关键行为和延期项、命令及通过/失败/未测证据、截图视口与设备类型。新增 vendored 文件必须验证 wheel/sdist 中资源及许可证可用。无需提交、推送、创建 PR 或发布；若开发任务另有授权，再按该授权执行。
