# UI Skill 独立验收 3

日期：2026-10-21（Asia/Shanghai）。对象：当前未提交工作区，仅验收第二轮 R1 的三个指定残余场景。

**结论：本轮有限范围通过。R1-A 长列表导航及 R1-B 键盘 Retry 的标题焦点落点已修复；慢导航和刷新响应未抢编辑器焦点、选区或可见滚动位置。** 独立脚本完成 57 项定向断言，全部通过，无新增产品问题。本结论不扩大为完整 UI 或 WCAG 合规审计。

只新增本报告及 `build/ui-skill-audit-3/` 的脚本和证据；未修改产品、现有测试、其他报告，未提交、推送、发布或创建子任务。未操作 Safari 或真实共享目录，也未借用主会话回归结果作为通过证据。

## 方法

显式使用 **$ui-ux-pro-max**，读取 [SKILL.md](/Users/kyiw/.codex/skills/ui-ux-pro-max/SKILL.md)、[quick-reference.md](/Users/kyiw/.codex/skills/ui-ux-pro-max/references/quick-reference.md) 和范围说明 `pro-rules.md`。执行：

```sh
.venv312/bin/python /Users/kyiw/.codex/skills/ui-ux-pro-max/scripts/search.py 'focus not obscured' --domain ux
```

[原始检索结果](../build/ui-skill-audit-3/skill-search.txt) 精确匹配 Focus Not Obscured Minimum / Enhanced。本轮按“标题完整可见且未被 sticky 内容挡住”的指定验收目标检查，没有把 Enhanced AAA 条款当作 AA 要求；等待反馈和防重复参照 quick-reference 的 `loading-buttons`，键盘检查参照 `keyboard-nav`。原生 HTML/CSS/JS 无需另建视觉系统或套用其他框架指南。

阅读 [第二轮 R1](ui-skill-audit-2.md)、当前 [focusDirectory / loadDirectory](/Users/kyiw/chatgpt/sharedserver/src/sharedserver/static/app.js:1004)、目录按钮与面包屑调用、Retry 处理器及刷新调用。未找到适用的仓库或祖先 AGENTS.md。

独立脚本以 `mkdtemp` 合成 **30 个根文件夹**（29 个普通目录及 Z_Target），目标目录含 **50 个子文件**；用随机 loopback 端口直接启动：`PYTHONPATH=src .venv312/bin/python -m sharedserver <port> -b 127.0.0.1 -d <临时目录> --no-qr`。未修改服务或添加 ASGI 包装器。503 与延迟由浏览器路由注入；延迟成功响应来自真实服务的 `route.fetch()`。

浏览器为 Playwright 1.62.1 / Chromium 151.0.7922.34，1280×900 桌面和 375×812 手机触摸仿真，浅色、减少动态效果。服务实际返回的 app.js 与当前源文件逐字节一致，SHA-256：`475837d8198b1492653e53907f7e1fe70b1c68f2d76e7b311193b1ede7f225a9`。运行前后对已有受版本控制及未忽略的未跟踪工作区文件做哈希比较，`unchangedWorkspace=true`。

## 结果

### 1. 深滚动根目录 → 足够长的目标目录：通过

滚动至最后一个根目录按钮并聚焦，实际 Enter 进入 Z_Target；目标高度足以保留原滚动值，排除了短目录自动压回顶部的假通过。

| 视口 | 导航前 scrollY / 文档高度 | 目标文档高度 | 标题 top–bottom | sticky 下沿 | 结果 |
| --- | --- | --- | --- | --- | --- |
| 1280×900 | 1989 / 2889 | 4349 | 152.50–178.75 | 137 | activeElement=`files-title`，五点命中标题 |
| 375×812 | 4716 / 5528 | 10964 | 77.44–102.44 | 61 | activeElement=`files-title`，五点命中标题 |

每次记录标题真实 `getBoundingClientRect()`、两层 chrome 的定位方式与坐标，以及标题四角内侧和中心的 `elementFromPoint()`；全部命中标题自身。标题完整位于视口及 sticky header/tabs 下方，截图中焦点环可见：[桌面](../build/ui-skill-audit-3/navigation-1280.png)、[手机](../build/ui-skill-audit-3/navigation-375.png)。

### 2. 首次 503 → 键盘 Retry：通过

两种宽度均独立注入首次 Z_Target 导航 503。错误后保留 30 个根目录快照，说明包含失败目标。聚焦 Retry 后 Enter，成功响应暂缓；等待期间 Retry 持续可见、保持焦点、显示 **Retrying…**、`aria-disabled=true`。再按四次 Enter，目标请求总数始终是 **2**（首次失败 + 一次 Retry）。

释放真实成功响应后，50 个子文件出现，Retry 隐藏，焦点落在完整可见的 `files-title`，坐标和五点命中同上。[桌面等待](../build/ui-skill-audit-3/retry-pending-1280.png)、[手机等待](../build/ui-skill-audit-3/retry-pending-375.png)、[桌面成功](../build/ui-skill-audit-3/retry-success-1280.png)、[手机成功](../build/ui-skill-audit-3/retry-success-375.png)。

### 3. 慢导航及刷新期间移到编辑器：通过，滚动数值有下述说明

导航响应暂缓时，用户实际点击编辑器（手机先切 Clipboard & text），输入 110 行合成文本，再用 Shift+ArrowLeft 建立非空反向选区。释放响应前后分别取证。另用真实 Refresh 按钮发起同目录刷新后移回编辑器；再通过合成 `visibilitychange` 事件调用现有自动刷新处理器。三条路径在两种宽度下均保留：

- 焦点 `shared-text`，文本长度 6049，反向选区 `[6036,6049]`；
- 编辑器内部 scrollTop：桌面 4643、手机 5717，scrollLeft 均为 0；
- 编辑器在视口中的上下沿；响应阶段没有新增脚本 `focus()`、`window.scrollTo()` 或 `scrollIntoView()` 调用。

**桌面慢导航的原始 window.scrollY 从 2053 变为 1988（−65px）。** 编辑器 top/bottom 在响应前后均为 `353.53125 / 586.375`，文本内滚动和选区也完全相同。这与浏览器在列表/加载提示高度变化时保持当前可见编辑位置的滚动锚定一致，不是脚本将用户滚回目录标题。真实 Refresh 和自动刷新仿真两条路径的 window.scrollY 均保持 0；手机三条路径也保持 0。

首次脚本只比较 window.scrollY，因上述数值变化提前停止；随后补充视口坐标和透明方法调用观测，将“编辑位置是否被滚动带走”作为判据。原始记录保存在 [initial-run](../build/ui-skill-audit-3/initial-run/evidence.json) 与 [raw-scroll-run](../build/ui-skill-audit-3/raw-scroll-run/evidence.json)，没有删除或将早期失败记录冒充通过。最终证据仍完整保留原始 scrollY 差异。[桌面响应前](../build/ui-skill-audit-3/editor-navigation-before-1280.png)、[响应后](../build/ui-skill-audit-3/editor-navigation-1280.png)、[手机响应后](../build/ui-skill-audit-3/editor-navigation-375.png)。

## 复核与限制

入口：[audit.cjs](../build/ui-skill-audit-3/audit.cjs)；结构化原始值及 57 项断言：[evidence.json](../build/ui-skill-audit-3/evidence.json)；[运行结果](../build/ui-skill-audit-3/run-output.txt)；[服务日志](../build/ui-skill-audit-3/server.log)。

```sh
NODE_PATH=/Users/kyiw/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules \
/Users/kyiw/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node \
build/ui-skill-audit-3/audit.cjs
```

最终 `completed=true`、`failed=[]`，未观察到 pageerror，临时服务已停止、临时共享目录已删除。手工查看了标题导航、Retry 等待及编辑器响应前后的截图。

**仿真限制：** 375px 为 Chromium 手机/触摸仿真，没有验证 Safari、真实手机、软键盘、VoiceOver/NVDA 或系统级后台恢复。自动刷新验证使用合成 visibilitychange 事件（`document.hidden=false`），证明现有监听器及其异步刷新路径保持编辑状态，不等于真实操作系统切后台/恢复测试。503 与网络等待为受控注入；透明调用观测保留原方法行为。窗口滚动数值没有被宣称绝对不变。未重复完整 UI 矩阵、上传/Toast、Python、原业务浏览器回归、打包或发布检查。

本轮范围内可关闭第二轮 R1，无需新增产品修改。
