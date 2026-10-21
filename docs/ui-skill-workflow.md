# UI skill 审计与改进记录

日期：2026-10-20 至 2026-10-21。

## Skill 选择与安装

比较了 [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)、[Impeccable](https://github.com/pbakaus/impeccable) 和 [Anthropic Frontend Design](https://github.com/anthropics/skills/tree/main/skills/frontend-design)。本次选择 UI UX Pro Max：现有原生工作台需要的是可检索的响应式、操作反馈、表单和无障碍规则。它适合这项任务，不代表存在客观通用的“最好”排名。

使用系统 `skill-installer` 的 GitHub 安装脚本，将 `.claude/skills/ui-ux-pro-max` 固定在提交 `56ea9cf174ed86786187daa9de0e6247cb0747e4`，安装至 `/Users/kyiw/.codex/skills/ui-ux-pro-max`。入口、文件树、运行脚本依赖与 I/O 和 MIT 许可已检查；此目录无符号链接，查询使用本地 CSV、Python 标准库，不执行安装钩子。保留了上游 MIT LICENSE，并写入 INSTALLATION.json 记录源提交和入口 SHA-256。安装不改 SharedServer 运行依赖，也不为其引入 CDN。

新会话显式使用 `$ui-ux-pro-max`，并读取安装目录的 SKILL.md。查询脚本使用绝对路径；不把 Tailwind 数据集当作原生 CSS 栈，不把原生 pt/dp 规则混同为 Web CSS px，也不照搬不适用的建议。

## 每轮独立会话

按用户要求，每次 UI 审计/复审均新建独立会话，修复由主会话完成，不在同一审计会话里反复自审。

1. 初审：`01a15a04-8cd2-7ce3-b0ff-5fbf5f7d5d2d`，报告 [ui-skill-audit-1.md](ui-skill-audit-1.md)。六项发现对应修复前快照，不能把旧行号当作当前缺陷。
2. 修复：主会话实现并验证，完成后才开始第二轮；复审期间产品代码保持稳定。
3. 第二轮：`01a15a0d-1426-7711-a9b7-7653493871e4`，报告 [ui-skill-audit-2.md](ui-skill-audit-2.md)。五项与 Toast 通过，目录焦点仍有长列表屏外与 Retry 成功丢焦的残余。
4. 补修：明确区分用户目录导航与被动刷新，将标题移到固定栏下；Retry 等待时保留焦点并用 aria-disabled 与处理器 guard 防重复。新增坐标与命中回归修复前失败、修复后通过。
5. 第三轮原会话 `01a15a16-f0db-7ed3-acb0-f4b0997fbb9f` 因用量限制在准备阶段中断，没有结论。用户继续后另开 `01a15c4c-4e39-7831-a04f-dd21c0f5428d` 补完，报告 [ui-skill-audit-3.md](ui-skill-audit-3.md)。57项独立定向断言通过，第二轮 R1 关闭。桌面浏览器在布局变化时调整 scrollY 以维持视觉锚点，编辑器在视口中的位置、焦点、选区和内部滚动保持不变；没有脚本主动抢焦点或滚动。

每次审计使用临时共享目录、随机 loopback 端口和合成文件，检查返回静态资源确实匹配当前工作区；不操作用户当前 Safari 或真实共享目录。审计只写自己的报告与 build/ 证据，未经请求不提交、推送或发布。

## 本轮修复

- 失败导航独立记录目标，Retry 重试失败目录；旧快照和当前目录在错误区明确说明，仍保留序号竞争保护。
- More 菜单动作同步将焦点交回可见入口，再执行复制或打开模态，异步完成后不抢焦点。
- 新建目录用提交对象防重复，Creating…/disabled/aria-busy 反馈；提交固定目的路径和名称，关闭重开后旧响应不能关闭新表单或覆盖新草稿。
- 名称错误持久显示在输入旁，关联 aria-describedby/aria-invalid，保留输入并返回焦点；编辑后清除。重名提示直接引导改名。
- 每个上传任务有文件名分组，进度条关联名称与阶段说明，不将每个百分点设置为 live 播报。
- 导航移除旧触发器后有含目录说明的可聚焦标题；被动列表刷新恢复同项焦点，不抢正在编辑的文本焦点。
- 额外修复 Toast 悬停与焦点组合暂停：同一计时器只暂停一次，指针移出时若仍获焦不会开始倒计时。

新增 `scripts/browser_ui_audit.cjs` 覆盖以上行为，包括真实临时目录重名、慢请求重复提交、迟到响应、上传 AX 树和 Toast 倒计时。CI 浏览器作业已加入该脚本，README 更新运行方法；本轮没有触发远端 CI。

保留离线资源、英文界面、默认免登录、原后端/API/CLI/CSP/权限。真机软键盘、实体 iOS/Android、200% 真实页面缩放和完整人工读屏仍不能由 Chromium 仿真替代。

## 主会话验证（修复后）

- `pytest -q`：57 passed。
- `browser_smoke.cjs` 和 `browser_vnext.cjs`：均以 `LAN_SMOKE=1` 运行，通过；最终 wheel 安装后再次补验这两套业务测试。
- `browser_ui.cjs`：72个布局/权限/认证场景及搜索/选择、预览、二维码独立解码、真实 shell curl、上传取消、清空竞争与存储失败路径，通过。
- `browser_ui_audit.cjs`：失败目标重试、焦点连续性、重复提交防护、持续错误、迟到响应、具名进度和 Toast 组合暂停，通过；最后再次安装 wheel 到隔离 target 并用该安装目录运行，也通过。
- `.venv/bin/python -m build`、Twine 校验通过；wheel 的所有 HTML/CSS/JS/文本静态资源与当前源码逐字一致。构建使用项目开发环境。
- `git diff --check` 通过。

以上均为本地结果；远端 CI、本轮 GitHub 合并与 PyPI 发布尚未执行。

## 最终结论

三轮独立 skill 审计与修复已完成：初审六项及第二轮焦点残余均有后续独立验收证据，当前没有本轮待修复发现。第三轮以 Chromium 的1280/375宽度、真实临时服务及合成内容验收；自动刷新使用合成 visibilitychange 验证处理器，并不代表真实切出/切回浏览器已完整覆盖。真机、软键盘、200%页面缩放与人工读屏限制仍保留。本轮未提交、推送、合并或发布。
