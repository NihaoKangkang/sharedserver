# 可复制开发 Prompt：sharedserver 0.3.0 前端工作台重构

以下全文可直接交给开发 Agent 执行，不需要原会话、附件或其他 AI 建议。所有冲突已经收敛为本 Prompt 的单一规则。

---

你是负责 sharedserver 产品交互、原生前端和安全回归的开发 Agent。请在 `/Users/kyiw/chatgpt/sharedserver` 基于当前 0.3.0 实现完成浏览器 UI/UX 重构，并验证以下规格。目标是内网离线可用、桌面高效、手机不溢出、权限准确、原有后端/CLI 完全兼容。完成实际代码和验证，不停在计划或样式示意。本任务不授权 git commit/push、PR、部署或发布。

## 1. 范围、现状与硬边界

先读仓库适用的 AGENTS.md，再阅读：

- `src/sharedserver/templates/index.html`、`src/sharedserver/static/app.css`、`src/sharedserver/static/app.js`。
- `server.py`、`config.py`、`access.py`、`clipboard.py`、`websocket.py`、`models.py`、`file_manager.py`、`archives.py`（均在 `src/sharedserver/`）。
- `scripts/browser_smoke.cjs`、`scripts/browser_vnext.cjs`、`tests/`、`pyproject.toml`、`MANIFEST.in`、`.github/workflows/ci.yml` 和两份 README 的权限/认证说明。

主要修改模板、本地 CSS/JS、对应浏览器测试，必要时补充本地小工具文件、许可证/打包配置和功能说明。不要改后端 API/CLI、权限/认证/CSP/下载语义、配置默认值、版本或发布流程。不要顺手重构无关 Python 模块。只允许为本地新增静态文件修正打包清单；若发现必须扩展后端才能做的功能，应按下文延期范围处理，不能自行降低安全策略。

应用源码和测试源码、界面文案均保持英文（已有 `test_application_source_uses_english_only`）；交付说明可中文。无 favicon 声明（已有测试）；品牌可以用模板内静态 SVG。

所有运行时资源来自服务自身：零 CSS/JS/font/icon/QR/分析 CDN，零远程字体、图片、遥测、第三方 iframe。使用原生 CSS Variables/Grid/Flex、原生 JS、系统字体和静态内联 SVG，不引入 React/Vue/UI 框架或构建链。可为二维码 vendored 小型官方 JS 源码，保留来源 URL、上游版本、完整许可证，确保安装包实际包含代码和许可证；浏览器运行不访问来源 URL。禁止 unsafe-inline/unsafe-eval、远程连接白名单扩张、从第三方获取 QR。现有 CSP 不支持某实现时改实现，不改 CSP。

“离线可用”指外网断开但服务自身可访问；不新增 Service Worker、敏感内容缓存或离线服务器幻觉。

## 2. 必须复用的接口与安全事实

所有资源和请求使用统一的相对 base：当前根页的 `new URL('./', location.href)`，支持普通 `/` 和 `/s/<secret>/`。API 输入可在封装内部去掉前导 `/` 后相对解析，不能将 `/api/...` 直接解析为站点根。WebSocket 使用同 base 的 `ws`，按 HTTP/HTTPS 切换 ws/wss。保留终端上传 `/upload/{filename}`、原有 aliases 和所有 route。

| 接口/协议 | 当前行为与用法 |
| --- | --- |
| GET `api/config` | 返回 `max_text_size,max_upload_size,read_only,mode,can_read,can_upload,can_write_text,private_link,rename_on_conflict`；没有 token/PIN/密码/可分享 URL，也没有认证类型列表 |
| GET `api/files?path=` | `{path,parent,entries}`；每项有 `name,path,is_directory,size,modified,copy_kind`，copy_kind 为 text/image/null；mtime 是带时区 ISO 字符串 |
| POST `api/directories` | JSON `{path,name}`；仅可读且可上传时可用 |
| PUT `api/upload?path=&filename=` | 请求体直接 File/octet-stream，流式上传；不要改 multipart、base64 或先读整个 File；冲突默认 409，rename 模式以响应 name/path 为准；上限 0 表示无限 |
| GET/HEAD `api/download?path=` | 浏览器原件 attachment，已有 HEAD/Range；保留其 MIME/响应头/路由 |
| POST `api/zip` | URL 编码原生 form，重复 `path` 字段，1–200 个普通文件；使用浏览器原生下载，不 fetch 全量 Blob、不导航到新前端页、不用 iframe 绕过 CSP |
| GET `api/text?path=` | `{content}`，按后端 allowlist 与 `max_text_size` 读取；UTF-8-SIG 解码会替换坏字节。不要误把它描述为拒绝所有非法 UTF-8 |
| GET `api/image?path=` | 仅 allowlist 内 PNG/JPEG/WebP，检查头签名；签名不等于完整成功解码，仍需处理 img error |
| POST `api/clipboard/image` | `{path}`，需可读与可写文字；保留接口，不把“复制到本机”误接成修改共享图片 |
| GET/POST `api/clipboard/raw` | raw 文本兼容 CLI；写入严格 UTF-8 和字节上限，保持接口；不作为新的轮询或额外同步路径 |
| WS `ws` | 发 `{type:'clipboard',content,id}`；收 clipboard/content、ack/id、image/path、error/message。保留单连接、现有草稿版本和 ACK 防护 |

`/api/text` 能否读取由后端 `copy_kind` 和配置决定，不能只凭扩展名扩大能力。默认 `.sh` 不在文本 allowlist；`.html/.js/.xml/.md` 即使可读取，也只能呈现纯文本。raw 文本提交、WS、图片内容校验仍由后端最终约束。

token/PIN 首访在服务根页换 HttpOnly/SameSite Cookie 并 303 清查询。Basic 可与 PIN/token 组合。random mount 单独使用时 `private_link` 可能为 false。绝不尝试读 HttpOnly、导出 document.cookie/cookie jar、读终端环境变量或给 config 增加秘密。不要新建账号、登录界面或默认认证要求，现有浏览器 Basic 对话框继续由浏览器处理。

## 3. 视觉系统与主题

使用语义 CSS 变量，不在各组件散落主题常量：

| 变量用途 | Light | Dark |
| --- | --- | --- |
| app | `#f8fafc` | `#09090b` |
| card | `#ffffff` | `#18181b` |
| muted background | `#f1f5f9` | `#27272a` |
| border | `#e2e8f0` | `#27272a` |
| main text | `#0f172a` | `#fafafa` |
| muted text | `#64748b` | `#a1a1aa` |
| accent | `#4f46e5` | `#6366f1` |
| accent hover | `#4338ca` | `#818cf8` |

卡片圆角 12px、控件 8px、1px 边框与轻阴影。正文系统字体：`system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'PingFang SC','Microsoft YaHei',sans-serif`；代码/命令/路径可用 `ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace`。不得下载字体。按钮文字/状态图标需足够对比度，深色 accent 背景上的文字不能未经检查直接沿用白色；普通文字目标 4.5:1，大字/关键图形 3:1。

主题用 System / Light / Dark 三态控件，默认 System，用户可返回 System；根 `data-theme` 驱动显式套色。只保存主题、字体和换行等非敏感显示偏好；localStorage get/set、matchMedia 和事件 API 均处理不可用/异常。storage 不可用时页面仍可使用内存偏好；System 响应系统变化，显式主题不被系统改变覆盖。无 JS/初始化前 CSS 仍能跟随系统；本地外部脚本尽早应用主题，禁止 inline script/style handler 来绕过 CSP。更新 color-scheme/theme-color。动画尊重 prefers-reduced-motion，blur 不支持时用实色背景。

## 4. 唯一响应式规则

宽度均指 CSS 布局视口，断点只用 768 和 1024：

| 宽度 | 工作区 | 文件呈现 |
| --- | --- | --- |
| >=1024px | 左 Files、右 Clipboard & text，扣除 gap 后 62:38；容器 max-width 1440px、居中，两侧留白 | 五列表格 |
| 768–1023px | 单面板 tabs，默认 Files，可切 Clipboard & text | 全宽紧凑五列表格 |
| <768px | 同一 tabs，默认 Files | 每条记录为卡片 |

桌面两栏的 grid track 与所有可伸缩子项设置 min-width:0，不能用百分比 62%+38% 再加 gap 导致溢出。两面板保留唯一一份 DOM；切换/跨断点不丢编辑草稿、选中、过滤、队列、滚动位置或建立新 socket。tabs 有 role/aria-selected/aria-controls，左右键/Home/End 与焦点规则；inactive panel 真正 hidden/inert，不让键盘进入隐藏内容。桌面隐藏 tabs、显示两面板；返回窄屏恢复上次活跃面板。

Header 包含品牌、目录面包屑及复制相对路径、真实权限徽章、连接状态、QR、快捷键帮助、主题。窄屏可换行或把低频工具放可访问的更多菜单，连接/权限仍有文本可读。面包屑保留各级跳转；深路径可有独立水平滚动或折叠祖先菜单，当前路径及复制按钮可达。复制的是相对共享路径，不能混入随机访问前缀秘密。drop-only 显示 Inbox，不读取或展示目录路径历史。

Sticky 规则不可冲突：

- >=1024：header sticky top:0，z-index:100；无 tabs。右栏 top 为实测 header 高度+16px，可用高度扣除该 top 与底部16px，只有整栏高度小于等于此可用高度时 sticky。header 换行、编辑器 resize、图片出现、窗口/visualViewport 变化后重新测量。
- <1024：header 在正常文档流，tabs sticky top:0、z-index:100、backdrop-filter blur(8px)，高度至少 44px。header 和 tabs 绝不能同时 top:0 互盖。
- 右栏放不下、短高度/横屏/200% 缩放/虚拟键盘时取消右栏 sticky，正常随页面滚动。不能用固定高度+overflow:hidden 丢掉底部操作，也不要强制造成多个难操作的整栏内滚动区。
- 模态用原生 dialog top layer；拖放遮罩不盖住已打开模态。上传浮窗、Toast 与 tabs/header 不互盖动作，提供 safe-area inset 和 dvh/visualViewport 降级；键盘弹出时可折叠浮窗并保留入口。

禁止页面横向溢出：不要对 html/body/全局容器用 overflow-x:hidden/clip 来掩盖错误；grid/flex 子项可缩、工具栏换行、名称/错误信息换行、下载按钮不收缩。只允许代码、命令、面包屑等内容块明确的局部水平滚动，操作按钮在其外。不能以父容器裁切、translate 到屏外、缩小热区等方式骗过 scrollWidth。

## 5. 权限、连接与首屏

config 成功前所有写操作禁用，显示加载；失败时显示可重试的错误，不虚报“空目录”或 FULL。

| can_read / can_upload / can_write_text | 标签 | 可用功能 |
| --- | --- | --- |
| true / true / true | FULL（绿+文字） | 浏览/下载/预览/复制/ZIP、新目录、上传、实时共享文字 |
| true / false / false | READ-ONLY（蓝+文字） | 浏览/下载/预览/复制到本机；共享文本只读；隐藏上传/新目录/同步/清空 |
| true / false / true | FILES READ-ONLY（蓝+文字） | 文件只读但文字仍实时同步；明确说明；不允许任何文件上传入口 |
| false / true / true | DROP-ONLY（橙+文字） | 根目录文件上传与明确提交文字；不读历史/目录/图片，无新目录/下载/ZIP/历史复制 |

实际门禁只依赖 capability；`mode`、旧 `read_only` 不覆盖这些 boolean。异常组合按各自能力保守控制，并显示能力说明。旧 `--read-only` 常见 mode 仍为 full，绝不能显示 FULL 误导用户。

drop-only 的 Files tab 标为 Upload，不显示推测文件数；首屏是 Upload，另一 tab 是 Submit text，文案说明文字和图片保存到收集箱。成功任务只反映本页面上传反馈，不能构建“服务器历史”。不发 api/files、api/text、api/image、api/download、GET raw 或其他历史探测；WS 可建立但只接受服务端空初始化/自己的 ACK，不显示历史。提交完成不去刷新目录。

连接状态区分 Connecting / Live sync connected / Connection lost, retrying / Access denied 等；保留退避重连，错误不清草稿。HTTP 401/403/429 说明状态且不紧密循环请求或 PIN 探测；不新建密码输入登录流程。浏览器被拒绝的服务器操作仍显示错误，前端隐藏不是权限安全边界。

## 6. 文件列表、筛选、排序、多选与下载

工具栏保留 Refresh、New folder、Upload files、多选 file input；搜索当前目录名称，大小写不敏感的子串匹配，文件和目录都过滤，不递归请求。排序为 Name / Size / Modified，升/降可选；目录始终排前，目录内部按名称排序，普通文件按所选字段，键相等时名称及 path 稳定打破平局。默认 Name asc。大小以字节排序、日期以时间戳排序，不能比较格式化字符串。显示“可见普通文件 / 当前目录普通文件总数”，目录单独计数；Files(N) 用目录全部普通文件数，不因过滤改变总数。

>=768 使用真实五列表格：选择、图标/名称、大小、修改、动作。文字有表头关联，目录大小为破折号。动作统一为 Download、支持时的 Preview、More；Copy curl 与 Copy file text/Copy image 放入 More，桌面动作可用有明确 aria-label 的44px图标按钮，不能横排四五个长文字按钮挤占1024px左栏。日期可局部换行，名称列可缩并完整换行，表格不得依赖横向滚动。按后端 copy_kind 决定可预览/复制，不以图标认定可执行能力。文件类型用静态 SVG 细分目录、图片、文本/代码、压缩包、音视频、普通文件。

表格以文件面板的实际可用宽度排版，尤其验证 1024px 双栏时的窄左栏。名称列必须 min-width:0 并允许完整换行；大小/时间列可以换行、日期时间分两行显示，不能靠固定最小列宽撑开表格。动作优先保留 Download，空间不足时将 Preview、Copy 和 curl 收入同一个 More 菜单；宽裕时再直接展示次要动作。五列表头及大小/时间信息保留，不为满足双栏比例隐藏元数据或缩小热区。

<768 隐藏 thead（保留必要无障碍关联），每 tr/card 圆角12、间距12、padding14。第一行左侧图标和完整可换行文件名，`word-break:break-all`；右侧常驻主 Download，>=44x44且不收缩。选择框放在底部工具栏，使用带可访问名称的44x44 label热区，避免在320px首行同时挤入选择框、图标、名称和下载。第二行 12px 大小/修改时间并有语义标签；第三行选择框、Preview（支持时）和 More，可换行但热区不重叠。curl 默认收进 More；保留 Copy file text/Copy image 可从 More 操作。目录无选择、Download、curl、预览；文件夹名按钮进入目录，可用 Open 辅助说明。不能把目录画成一个无法下载的 Download 按钮。

选择规则必须明确且实现一致：

1. 用 entry.path 作为选择键，不用索引/文件名；仅普通文件能选，最多200。
2. 单纯排序、tab 切换、主题变化保留选中。筛选变化将选择集与可见普通文件取交集；移除时给 info 提示，不保留不可见选中。
3. Select all 只选当前筛选下按当前顺序的前200个普通文件；超过200显示 warning，表头 mixed 正确；取消全选清当前可见选择（按上述规则即当前全部选择）。第201个单选拒绝并保留原200项。
4. 每次成功目录加载，包括刷新/可见性恢复刷新/上传后刷新，清空选择；成功切目录也清空并重置搜索、保留排序偏好。请求失败保留旧路径/旧列表/旧选择，标记内容是旧快照，不能把失败目标路径套在旧列表上。
5. 目录请求保留请求序号/取消机制，旧响应不能覆盖新路径。区分加载、空目录、No results（可清筛选）、加载失败（可重试），读屏能获取状态。
6. 动态显示已选数量和 ZIP 按钮，禁止 0 或 >200 提交。ZIP 仍用同 base 的 native POST form、重复 path 字段；不能在调度前移除 form，保留既有延迟清理；不能获取 Blob、通过脚本缓存完整归档。

Download 使用原生链接 `api/download`，可访问名称继续包含 `Download <filename>`。URLSearchParams 编码相对文件 path，不能拼接未经编码的 `&/#/?`。已有 Copy file text 只复制本机，不修改共享文本；Copy image 同理。新目录仍用本地 dialog、后端验证与错误反馈，不新增删除/覆盖文件功能。

## 7. 文本和图片预览

必须实现文本/代码和图片预览，音视频预览本轮明确延期；仍给媒体类型图标和原件下载，不出现可点击但无功能的播放按钮。无专用媒体流路由，不改附件响应为 inline，不为了播放器 fetch 巨大 Blob 或放宽 CSP。

文本 Preview 使用 `copy_kind==='text'` 后请求 api/text，直接显示在 `pre/code` 的 textContent，提供换行/复制/原件下载。HTML/Markdown/XML/JS 都作为字符显示；不渲染 HTML、Markdown、SVG，不 eval，不 iframe/srcdoc/object/embed，不引入高亮库。后端拒绝、超大小或文件消失显示原因和可用的原件下载；不绕过接口用 download 再自行当文本解码。

图片只用 api/image 接口，PNG/JPEG/WebP；不 inline 用户 SVG。缩略图与大图共用同一前置检查，不能先自动设置共享缩略图 src 绕过检查。预览前用 listing.size，缺少大小的共享 image/path 用受权限保护的 download HEAD 取 Content-Length；>20MiB 时显示下载降级。头缺失/无效时不发起全量 Blob 预览，说明无法确认大小并提供原件下载。可用图片以直接同源 img URL 显示，不先全量 fetch；加载后检查自然尺寸，超过40,000,000像素移除图并提示下载。该像素检查不是解码前防护保证，交付说明如实表述。处理加载失败/伪签名，取消旧预览请求；关闭或切换时清 src 和旧引用。

图片卡片显示尺寸与可用时的实际字节数，缩略图可开模态。原件按钮统一 Download original，走 api/download，保留 PNG/JPEG/WebP 真实格式；不能将 JPEG/WebP 原件重命名为 .png。首版不新增另一个 PNG 导出下载动作。

Copy image 在用户点击且 secure context、ClipboardItem、navigator.clipboard.write 都可用时尝试受限 PNG 转换；转换输入实际字节必须 <=20MiB、像素 <=40,000,000，不能只信 Content-Length；若 Blob 化，按流累计并在超过限制时取消读取。ClipboardItem 的异步数据方式保留用户手势支持。所有 objectURL 在完成/失败/取消/关闭时 revoke，画布用后释放尺寸、图片引用清除，旧异步操作不能重新打开已关闭模态。

HTTP、不支持 API、权限拒绝、证书未信任或解码错误时打开/保留可长按或右键的预览，加温和 inline banner：浏览器可能限制图片写入，可长按/右键复制或下载原件，可信 HTTPS 可在支持的浏览器中改善支持。不用 error Toast 声称服务故障，不承诺 --https 自动信任证书或真实手机一定可复制。失败不能显示绿色 Copied。

## 8. 上传队列、全局拖放与粘贴

上传保持 XHR PUT 直接 send(File)、串行任务，不引入新的服务端上传协议、自动并发或整个文件 ArrayBuffer。入队时创建显式任务，捕获目的 currentPath；drop-only 固定空路径。后续导航不改变已有任务目的地。文件名、结果与错误用 textContent。

浮动队列默认右下角，手机贴安全区底部，宽度不超过 viewport 减两侧留白，列表可局部纵向滚动、有明确折叠/展开/关闭已完成项。全部任务立即可见（包括尚未开始）；每项显示文件名/目的目录、Queued / Uploading / Finishing / Done / Failed / Canceled、百分比、速率、合理 ETA。0 字节和未知长度显示不定进度，不出现 NaN/Infinity。字节发完等待 HTTP 响应时显示 Finishing，不能提前宣告成功。

每个未结束任务可取消：排队任务直接移除执行资格，进行中调用 xhr.abort()；abort/error/load/timeout 只结算一次，释放引用并继续后续任务，不能让 Promise 悬空堵住队列。取消与服务端已经提交存在竞争，无法确定时说明“取消已请求，服务器可能已保存”；可读模式刷新核实，不声称删除了已保存文件，drop-only 不查询历史。失败可显式重试并沿用原目的路径，不自动重试，尤其防止已提交但响应丢失/收集箱重复。服务端 rename 返回的最终 name/path 用于反馈。成功/失败信息允许查看，批量完成 Toast 合并避免每个文件轰炸。

保留全屏 Files 拖放遮罩，跟踪 dragDepth，dragleave/blur/drop 清理，非 Files 拖放不拦截。无上传权限不显示“松开即可上传”，拒绝时用温和提示；不改变普通文字拖选。打开模态期间的 Files drop 要 preventDefault 防浏览器导航，仅提示先关闭模态，不将文件误送后台目录。目录拖放/文件夹上传本轮不实现：发现目录条目明确提示只支持文件，不递归、不扁平化、不上传空假文件。

粘贴只处理用户 paste 事件，不主动 read/readText 系统剪贴板。其他 input/textarea/contenteditable（含后代、contenteditable 空值和明文编辑宿主）保持原生粘贴；共享编辑器可处理文件，普通文本交给原生输入。非编辑区域粘贴文件/截图入队，Files 优先于同事件文本，避免重复提交；只有文本且可写时按现有行为替换共享编辑器内容、标记草稿、切到文本 tab 并提示。full 自动同步，drop-only 只填草稿不提交。无权限不发写请求；搜索框、目录名、手动链接、curl helper 等不得被全局处理抢内容。图片文件名沿用安全时间戳策略和真实格式；上传图片仍保存到目录，不是只存在内存。

## 9. 文本工作区、同步与快捷键

提供字符数、行数、UTF-8 字节/上限、同步状态、最后确认时间；字符数按 Unicode code point（含空格换行，明确标为 Characters），空文本0行，非空按换行分行；容量始终按 TextEncoder 字节算，不能以 JS .length 代替。保留 aria-invalid 和超限错误，超限不发送、不清内容。切换系统/等宽字体和自动换行，长命令不换行时只在编辑器内部水平滚动。

保留并增强 Copy text、Sync now / Submit text、Clear、Send preserved draft。full/旧文件只读：输入和 compositionend 按现有语义自动同步，Ctrl/Cmd+S 与 Ctrl/Cmd+Enter 立即发送，不能变成仅手动保存。drop-only：输入/全局粘贴仅草稿，按钮/上述快捷键明确提交；成功实际落盘。readonly：textarea.readOnly，允许选择复制，隐藏写操作。

Clear：full/旧文件只读使用自定义 dialog 清楚确认“将清空所有设备共享文本”，确认后发空文本；取消无副作用，打开时捕获文本/版本，等待确认时若本地或远端文本改变则取消本次清空并提示重新确认，不能覆盖新输入。drop-only 只清本地草稿，需自定义确认，无网络提交；readonly 不提供。禁用原生 alert/confirm/prompt。不要把清空收集箱草稿误称为删除服务器文件。

同步必须保留：editVersion、发送时 content/version 快照、递增 id、ACK 只确认对应发送。迟到/乱序 ACK、远端快照和重连不能清掉/覆盖较新的本地草稿。保留草稿时提示差异并让用户主动发送，不在重连时透明重发。drop-only 在 ACK 确认且编辑版本和内容都未改变时才清输入；ACK 前输入 B，则 A 提交后 B 保留。重复快捷键/按钮在同一版本等待 ACK 时合并/禁用，避免重复落盘；ACK 后再次主动提交相同文本仍遵循后端允许重复提交的行为。断线不把内容写 localStorage，也不新增服务端草稿存储。显示“Text in memory”与“Inbox submissions saved to files”的准确区别；最后同步时间只在确认/接收远端更新时更新，并区分“收到远端”与“本机已确认”。

复制文字先试安全上下文 navigator.clipboard.writeText，失败或 HTTP 时创建临时 textarea 选择 + execCommand('copy')；恢复焦点/原选择及滚动，清辅助节点；若仍失败给可选中文本的手动复制界面。成功短暂 Copied 图标/文字，不仅靠绿色。异步 api/text 请求后若手势失效，也必须有再次用户点击的 Copy/手动选择路径。

快捷键帮助用可点击可访问对话框（不能只 hover）：Ctrl/Cmd+V 说明原生粘贴与适用位置；Ctrl/Cmd+S、Ctrl/Cmd+Enter 在共享编辑器获焦或文本面板活跃且焦点不在其他编辑控件/模态时作用；只在适用上下文 preventDefault，IME composing 不触发提交。不劫持其他输入的保存/回车，不让只读假装已保存。`?` 仅在非编辑控件且无其他模态时开帮助；Esc 只关闭最上层模态/菜单，不丢草稿/取消上传。

## 10. QR 与 curl：手动分享，不导出会话

必须提供 QR 入口和 curl 功能，但遵守以下明确限制；缺凭证不生成伪装可用的结果。

1. 定义敏感分享场景为 `settings.private_link===true` 或 base pathname 含 `/s/<secret>/`。后者即使 private_link 为 false 也不能自动导出。
2. 普通无保护服务可用当前 base 预填，用户点击 Generate 才显示 QR。若 origin 是 loopback，提示其他设备无法连接，应先用终端 LAN URL 打开页面；不要猜测局域网地址。
3. 敏感场景 QR 要求用户手动粘贴终端完整链接，当前 clean URL 仅可显示为不含 query 的说明，不自动生成。输入校验：HTTP/HTTPS，origin 和当前 base 完全一致，pathname 也完全一致（含随机前缀、末尾 slash）；无 username/password、fragment、控制字符；query 只可为空或单个非空 token/pin，不能混合/重复/带其他字段。需要另一个 LAN origin 时说明先打开该终端 LAN 链接。本地校验不发请求、不试凭证。
4. 手动链接仍可能缺 Basic。QR 前内联说明其可能包含访问秘密、持码者可访问、Basic 需扫码设备另行输入；不宣称 QR 自动拥有 Cookie 会话。用户点击 Generate 是明确分享动作，不额外要求账号。无可用实现时提供终端二维码指引并如实报告阻塞，不可显示假 QR 或外链图片。
5. QR 库为本地 vendored 官方 JS，审查许可证、CSP 与无外链依赖；优先 canvas/createElementNS 的 SVG，不注入库 HTML/inline handler。码需正确 quiet zone、黑白高对比、屏幕可缩放，长链接报可理解错误；测试以独立解码器校验内容，不能只看图像像二维码。黑白码不随深色主题反转成低可扫描对比。
6. curl 始终生成真实相对 base 下的 `api/download` 加 URLSearchParams path，不使用不存在的 `/download/<name>`。无保护服务点击 Copy curl 可直接复制；敏感场景点击先开 helper，默认提供标为 Template — credentials required 的命令，或用户手动粘贴完整终端链接后按 Generate/Copy 输出。模板仅含占位秘密，random prefix 不自动带出；需要用户粘贴/补齐完整 base。不能把 clean session URL 直接当可执行 curl。
7. 因 config 不揭示认证组合，helper 让用户明确选 None / Token / PIN / Basic / Basic+Token / Basic+PIN。真实密码不进入 UI，Basic 生成 `--user 'USERNAME'` 并说明 curl 会询问密码；用户名本轮也可保持占位模板。token/PIN 使用链接中的手动 query 或明显 `REPLACE_TOKEN/REPLACE_PIN`，不猜测认证类型。缺任何必要信息时只标模板，不显示成功可执行承诺；不读取浏览器 Authorization/Cookie、不生成 -b/--cookie 或会话导出。
8. curl 选项含 `--fail --location --globoff --output`，输出为 `./<文件名>`、URL 用 `--url`。输出名与 URL 均正确 POSIX shell 单引号转义（单引号需结束字符串、转义后重开）；URL path/query 必须 URL 编码。测试空格、单双引号、反引号、美元/括号、&、#、%、中文、前导 - 的合成文件名，执行命令获取同一文件，绝无 shell 命令注入；URL glob 字符不扩展。明确标 POSIX shell，不声称 PowerShell/cmd 通用；不加 -k 绕过证书验证。
9. 手动链接/真实 token/PIN/random prefix 只在当前弹窗内存和用户主动请求的输出中存在，关闭清空输入、QR、命令与引用；不持久化至 local/sessionStorage、history/hash、日志、Toast、自动截图/下载或其他面板。只在显式 Copy/Generate 后输出；生成内容包含秘密时在同一界面提示，不再问无依据的权限确认。不要用 innerHTML 展示输入。

## 11. Toast、模态与可访问性

统一 success / warning / error / info Toast，文本+图标+颜色，不能使用 alert/confirm/prompt。成功/信息适时消失，警告/错误提供更长停留与可关闭/内联持续说明；hover/focus 暂停倒计时，内容换行不挡关键操作。普通反馈 role=status/aria-live=polite；真正需要立即注意的错误用 role=alert，避免同一消息重复播报。上传进度不逐百分比塞 live region，合并批量反馈。Toast 不抢焦点；错误不能只存在瞬间飘过。

dialog 有 accessible name、必要描述、初始焦点、焦点圈定、Esc/关闭、返回触发按钮（按钮已被删除则回稳定位置）。模态可按可视视口滚动，关闭按钮始终可达；不能将输入键盘弹出后的操作放在屏外。原生 dialog top layer 下的错误/live region 要在模态内可见可读，不能藏在 backdrop 后。更多菜单支持键盘与外部点击/Esc关闭，不强制需要 hover；所有 icon-only 按钮有明确英文 aria-label，静态装饰 SVG aria-hidden。

所有可触摸操作区域 >=44x44 CSS px，含 checkbox 的 label 热区、breadcrumbs、tab、菜单项、队列取消、模态关闭、主题控件。焦点可见，不以色彩唯一表达权限/连接/选中；表格/卡片需经读屏结构检查，隐藏表头不得损失名称关联。输入有 label，textarea 不因 tabs 或 disabled 状态丢草稿。

## 12. 验收矩阵与现有测试迁移

完成代码后实际验证，以下为必须交付证据，不以“理论支持”替代。

### 12.1 视口、溢出与按钮

- 测试宽度 **320 / 360 / 390 / 430 / 767 / 768 / 820 / 960 / 1024 / 1280 / 1920** CSS px；常规高度至少覆盖手机844、平板900、桌面1080。767必须卡片，768/820/960必须 tabs+表格，1024必须双栏。
- 追加 320x568、390x400、844x390、1024x480、1280x480、1920x1080；真实浏览器200%缩放并验证重排；模拟触屏与横竖屏切换；虚拟键盘在文本编辑器/搜索/模态输入/QR输入打开时各检查。仅改变 deviceScaleFactor 不等于200%页面缩放，仅截图手机尺寸不等于验证真实键盘。
- 每个宽度跑两主题、两 tabs/桌面两栏、空/多文件、长文件名/深路径、选中工具栏、展开/折叠队列和模态。为所有可见控件滚入视口后逐一检查 `getBoundingClientRect()`：左右边界在 `document.documentElement.clientWidth` 内、尺寸>=44x44（checkbox 按实际 label 热区）、在视觉视口可达，目标点 hit-test 未被 sticky/浮层遮挡，真实点击/键盘操作有预期结果。长列表可正常纵向滚动，不要求所有按钮同时在同一屏。
- 每个场景断言 `document.documentElement.scrollWidth <= document.documentElement.clientWidth`；再检查按钮/文本未被祖先 overflow 裁掉或挤到局部滚动区外。不能仅做这一个断言，不得用全局 overflow:hidden 让它通过。局部代码滚动有独立测试，操作按钮始终在局部滚动外。
- 长文件名包含几百字符、中文/emoji、连续无空格字符、XSS样式字符串、深路径，错误文案与长 curl 也纳入；文件名不得隐藏下载按钮。目录无下载/ZIP/curl，文件按钮均可达。高度不足时右栏恢复文档流、底部工具不会消失。

### 12.2 功能、安全和异常

- 搜索无结果/空目录/加载中/失败/旧请求迟到分别测试；名称/大小/mtime排序稳定，目录规则一致。排序保选中、过滤剔除隐藏选择、select-all只作用可见普通文件、200/201边界、成功刷新清空/失败保旧状态。ZIP 原生 POST 真下载并校验文件内容，不把归档放 JS Blob。
- 文本自动双向同步、IME、字符/行/UTF-8统计、字体与换行、复制/清空/快捷键；full 清空有确认、drop-only清空无网络。断线编辑/全局粘贴后重连保草稿；ACK 前输入新版本、乱序/迟到ACK、关闭旧socket事件不得覆盖新连接状态；drop-only只保存明确提交，等待ACK连续提交不重复、ACK不清新草稿。保留既有350ms延迟ACK浏览器回归。
- 权限按 full、旧 `--read-only`、`--mode readonly`、`--mode droponly` 跑；文件写/文本写分别验证；只读复制下载仍正常；drop-only绝不发读历史请求、另一会话看不到提交；无权限paste/drop不产生请求。
- 无认证、token、PIN、Basic、randomURL单独、randomURL+Basic+PIN及Basic+token组合；验证303后地址无query、HttpOnly仍在、随机前缀的API/WS/静态/ZIP/QR/curl路径正确、根API不能绕过随机prefix。QR/curl无secret默认不自动导出；合成输入合法/非法、缺凭证、模板状态、shell特殊字符、关闭清除、不落storage/日志；测试不靠导出浏览器Cookie使curl成功。
- 纯文本里的HTML/Markdown/SVG/script不执行；未知类型/不在allowlist/过大文本/非法UTF8读取按后端现状处理；伪图片/大图片/解码错/切预览后旧响应不覆盖，objectURL无泄漏。音视频显示不支持预览且下载不受影响。
- 上传串行、入队目的固定、取消未开始/进行中/已上传等待响应/失败后的后续队列；服务器临时文件清理回归、0字节/不限上传/冲突/rename/限额/网络中断。取消竞态如实报告，drop-only不为核实而读历史。模拟连续paste/drop不重复添加同事件内容，其他输入原生粘贴不受干扰。
- 局域网HTTP非secure context：文字降级复制、图片预览/长按/下载；可信HTTPS下成功、API缺失、权限拒绝、异步手势失效各测试；不以localhost被视为secure来替代LAN HTTP验证。真实iOS/Android/Safari未测时明确列未测，不能承诺兼容。
- System主题、显式覆盖、重载持久化、恢复System、系统变化、storage get/set抛错、reduced-motion、blur不支持；Toast四态读屏/计时/焦点；模态Esc/焦点返回/错误可见；键盘遍历所有工具，inactive panel不可进入。
- 在外网不可访问、服务仍在线的情况下加载和使用；记录页面网络请求，除本服务HTTP(S)/WS(S)外无任何资源或遥测请求，无 CSP violation/未处理 pageerror。二维码源码来源链接只是许可证元数据，不运行时访问。

### 12.3 现有测试门槛

当前57项Python测试均需保留并通过：

```sh
.venv/bin/python -m pytest -q
SHARED_PYTHON=.venv/bin/python node scripts/browser_smoke.cjs
SHARED_PYTHON=.venv/bin/python node scripts/browser_vnext.cjs
```

若使用 `.venv312` 等环境，记录真实命令。Playwright/浏览器按仓库现有开发方式准备，不引入产品运行依赖；LAN_SMOKE=1 两套回归在环境能提供局域网地址时实际运行并记录，不能以loopback代替后声称LAN成功。环境缺失需明确错误和未测项，不能伪造通过。

保留/显式迁移这些测试钩子：`#connection #shared-text #character-count #copy-shared #send-draft #submit-text #refresh-files #choose-files #file-input #new-folder #folder-dialog #folder-form #folder-name #cancel-folder #breadcrumbs #file-list #file-table #empty-state #select-all #download-zip #selection-toolbar #drop-zone #upload-list #page-drop-overlay #toast #shared-image #shared-image-preview #view-shared-image #image-dialog #image-title #image-preview #image-download #close-image`，以及 `.topbar`、`Select <filename>`/`Download <filename>`、`Copy image` 角色名及关键草稿反馈。现有脚本通过 `page.evaluate(()=>socket.close())` 模拟断线，保留该兼容钩子或迁移到等效不含秘密的断线测试接口。

现有两套脚本使用950/1000/390宽度，且直接 fill/click 两面板；新tabs默认Files，需要在测试中增加真实 `showWorkspace('files'/'clipboard')` 操作、更多菜单打开，必要时更新英文文案断言，保留所有原有业务断言。不能用 force click、直接修改隐藏元素、删测试、跳过断言或在测试模式下让tabs行为不同来通过。新增上述矩阵的自动化与关键状态截图，避免把当前脚本的一条scrollWidth断言当完整移动验收。

若新增本地QR文件或其他资产，运行 build、twine check，并检查wheel/sdist包含静态代码/许可证，在随机前缀下安装包页面也可使用；不要发布产物。不要把本地全部宽度测试塞进不相关Python测试或新增只复述实现的低价值测试。

## 13. 交付与明确延期

交付实际HTML/CSS/JS重构、必要资源/许可证/打包调整、迁移后的两套浏览器测试和新增回归。说明中列修改文件、关键交互、权限/认证处理、实际测试命令及结果、截图视口、失败/未测项、包资源验证。区分桌面浏览器移动模拟、LAN HTTP、物理手机测试；未测不能写已兼容。不得发布、推送、提交或创建PR。

明确延期：音视频播放器、上传文件夹/目录拖放递归、目录递归ZIP、Markdown/HTML渲染、语法高亮库、PNG独立导出下载、新账号/登录系统、云中转、自动剪贴板读取、后台持久化/自动重试队列。本轮仍需保留媒体文件/目录既有浏览与下载能力，不得以延期为由破坏原有功能。除这里列明的延期外，其余“必须”项需实现并验证；有真实环境阻塞时报告具体证据，不无声缩小范围。
