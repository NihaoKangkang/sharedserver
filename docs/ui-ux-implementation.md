# UI/UX 工作台重构实施记录

日期：2026-10-20。基于 `1030e76` / sharedserver 0.3.0，在本地实现统一开发 Prompt。没有改动后端 Python 路由、CLI、认证策略、CSP、默认配置或版本；没有提交、推送、创建 PR 或发布。本次界面尚未进入 PyPI 0.3.0。

## 已实现

| 区域 | 实际行为 |
| --- | --- |
| 布局 | ≥1024px 为 62:38 双栏；768–1023px 为 Tab＋五列表格；<768px 为 Tab＋卡片。单一 DOM、保留文本、选择和队列；短高度时右栏退出 sticky。 |
| 手机 | 名称完整换行、下载按钮常驻、选择框在卡片底部、次要动作收 More。顶部工具菜单收 QR/帮助，主题仍可直接选择；上传/搜索工具栏减少纵向占用。没有全局隐藏横向溢出。 |
| 主题与图标 | System/Light/Dark；仅非敏感显示偏好写 localStorage，失败时降级。使用本地原生 CSS/JS、系统字体、内联 SVG；深色强调按钮使用黑色文字，对比度约4.70:1；浅色主按钮约6.29:1，并有计算断言。 |
| 文件 | 当前目录搜索、稳定排序、筛选移除隐藏选择、全选可见普通文件（最多200）、区分加载/空目录/无结果/失败快照、原生 ZIP 下载。旧目录响应不能覆盖新导航。 |
| 预览 | 复用安全图片与文本接口；HTML/Markdown/脚本只按纯文本显示。图片20MiB大小检查、40MP加载后检查、受限 PNG 复制转换、实际流字节限制和资源释放；原件保持真实格式。 |
| 上传 | 串行 XHR PUT，入队捕获目标目录；Queued/Uploading/Finishing/Done/Failed/Canceled、速度/ETA、未知长度不定进度、折叠和清理、取消、显式重试。取消竞争如实提示可能已保存，不自动重试。 |
| 文本 | 字符/行/UTF-8字节统计、字体/换行、快捷同步、自定义清空确认、HTTP复制降级与手动复制。保留 full 自动同步、drop-only 明确提交、IME、重连草稿及迟到 ACK 保护；重复未确认的同版本提交合并。 |
| 权限 | 按 can_read/can_upload/can_write_text 判断；旧文件只读单列 FILES READ-ONLY。收集箱无历史探测，界面显示 Inbox / Upload / Submit text。 |
| 分享 | 本地 QR；受保护或随机路径必须用户手动粘贴终端链接。curl 使用同源真实下载路由、POSIX shell 引用、未选择认证时保留 REPLACE_AUTH_OPTIONS 的显式模板，不猜测 Token/PIN/Basic，不读取/导出浏览器 Cookie、密码或 Basic 缓存。关闭对话框立即清理分享输入、命令和二维码像素。 |
| 可访问性 | 44px操作热区、原生 dialog 焦点/Esc/返回、键盘 Tab 切换、带名称的 SVG 按钮、四态可关闭 Toast、表格/卡片语义。Toast 在模态内显示，不藏在 backdrop 后。 |

图片自然尺寸检查发生在浏览器加载/解码之后，不能当作解码前内存防护保证。下载 HEAD/目录大小也无法保证文件在请求间绝不被本机修改。安全边界仍以既有受信任共享目录和后端策略为准。

## 修改文件

- `src/sharedserver/templates/index.html`：工作台、Tab、工具与预览/分享/确认/帮助对话框。
- `src/sharedserver/static/app.css`：主题变量、响应式卡片/表格、触控、弹窗、浮动队列。
- `src/sharedserver/static/app.js`：界面状态、文件操作、预览、同步、传输和分享。
- `src/sharedserver/static/theme.js`：早期主题初始化和显示偏好。
- `src/sharedserver/static/vendor/`：未修改的 [Project Nayuki QR Code generator v1.8.0](https://github.com/nayuki/QR-Code-generator/releases/tag/v1.8.0) ES6 发行文件、来源/哈希及完整 MIT 许可证。运行时没有外链请求。
- `pyproject.toml`：仅补充 vendor 静态资源和许可证打包，不增加 Python 运行依赖。
- `scripts/browser_smoke.cjs`、`scripts/browser_vnext.cjs`：显式切 Tab/More，保留原有业务断言；上传等待实际目录记录。
- `scripts/browser_ui.cjs`：新增响应式、交互、安全和异常回归。独立二维码解码使用测试依赖 [jsQR](https://github.com/cozmo/jsQR)，不会打包进产品。
- `.github/workflows/ci.yml`：在原浏览器作业中加入 jsQR 测试依赖与第三套测试；没有修改发布工作流。
- 两份 README：说明源码 UI 与已发布包的区别、交互入口和测试方法。

## 实际验证

- Python：`.venv/bin/python -m pytest -q`，57 passed。
- 源码局域网 HTTP：两套原有 Chromium 测试，均设置 `LAN_SMOKE=1` 运行并通过。覆盖私密会话、文本双向同步/复制、图片上传预览降级、真实下载内容、新目录、离线草稿、随机路径＋Basic＋PIN、ZIP、只读与收集箱、350ms延迟ACK和重连未提交草稿。
- 安装包：构建 wheel/sdist、Twine 校验；使用 `--target build/ui-wheel` 安装 wheel，确认模块来自该目录。新增 UI 矩阵使用这个安装目录运行服务，确认并非从 src 导入。
- UI 矩阵：72个布局/权限/认证场景通过；宽度320/360/390/430/767/768/820/960/1024/1280/1920，两主题、两面板；另含短高度、横屏、长文件名、深路径、模态和移动传输队列。逐控件检查真实矩形、44px热区、横向边界和命中遮挡，检查文档无横向溢出。
- 交互：筛选/排序选择、200/201选择边界、失败快照、迟到目录响应、纯文本XSS不执行、伪图片降级、有效图片预览、字符/字节统计、长命令局部滚动、复制权限失败的手动路径、取消/重试/固定上传目的目录、清空期间远端更新竞争。
- 分享：独立jsQR解码结果与原URL一致；生成的curl在临时目录实际执行，含引号、反引号、美元括号、&/[]/#/%/中文的文件名下载内容一致，没有执行嵌入命令；私密链接输入校验、模板、关闭清理和不落storage。
- 网络：页面仅加载本服务资源，未发现外部资源/遥测请求、CSP violation 或未处理 pageerror。无认证源码服务可以在外网不可用而本服务可达时运行。
- Safari桌面：隔离本地服务加载成功，能看到文件表格与文本工作区；这只是加载检查，不是完整Safari回归。

复现新矩阵（测试依赖不属于产品）：

```sh
npm install --no-save playwright jsqr@1.4.0
npx playwright install chromium
SHARED_PYTHON=.venv/bin/python node scripts/browser_ui.cjs
```

本机执行时使用了工具内置 Node/Playwright 路径，并通过 `JSQR_MODULE` 指向本地测试用 jsQR 1.4.0；该测试包下载后校验了 npm 的 SHA-512 integrity。`build/ui-evidence.json` 保存场景列表，`build/ui-screenshots/` 保存320px/1280px的浅深色完整页面截图。它们是可重建本地测试产物，不包含真实分享凭证。

## 明确未测与延期

- 未完成真实浏览器200%页面缩放验证：Safari检查期间桌面切换到其他内容，未继续抢占用户当前窗口。CSS缩放重排和短高度已有实现，但不能用 deviceScaleFactor 或窄视口替代该项验证。
- 未测真实手机软键盘、iOS/Android实体设备、真实手机照片选择器。已实现 visualViewport/dvh、安全区及键盘缩小视口时的对话框约束，不能据此宣称真机兼容已认证。
- 未做完整Safari/Firefox回归、完整读屏人工验收、真实手机图片写入剪贴板权限验证。
- 音视频播放器、目录递归上传/ZIP、富文本渲染、语法高亮、独立PNG导出、账号/云中转/自动系统剪贴板/持久后台任务按统一Prompt延期。保留既有文件浏览与原件下载能力。
- 本地CI配置已补齐，但本轮未推送，因此没有为这些未提交修改运行GitHub Actions。

## UI skill 独立审计迭代

后续按用户要求安装 UI UX Pro Max，并由新会话独立审计。目录重试、焦点连续性、新目录提交/错误和上传无障碍已落实修复；另修复 Toast 组合暂停。见 [审计与改进记录](ui-skill-workflow.md)、[初审](ui-skill-audit-1.md) 、[第二轮复审](ui-skill-audit-2.md) 与 [第三轮验收](ui-skill-audit-3.md)。第三轮57项定向断言通过，长列表导航及Retry焦点残余已关闭。新增 `browser_ui_audit.cjs` 已加入 CI 配置。当前发布状态仍为本地未提交修改。
