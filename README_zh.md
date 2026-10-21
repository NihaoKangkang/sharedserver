# SharedServer

[English](https://github.com/NihaoKangkang/sharedserver/blob/main/README.md) · [简体中文](https://github.com/NihaoKangkang/sharedserver/blob/main/README_zh.md)

[![PyPI](https://img.shields.io/pypi/v/sharedserver.svg)](https://pypi.org/project/sharedserver/)
[![Python](https://img.shields.io/pypi/pyversions/sharedserver.svg)](https://pypi.org/project/sharedserver/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/NihaoKangkang/sharedserver/blob/main/LICENSE)
[![CI](https://github.com/NihaoKangkang/sharedserver/actions/workflows/ci.yml/badge.svg)](https://github.com/NihaoKangkang/sharedserver/actions/workflows/ci.yml)

**扫码跨设备传文件、在网页间共享图文，也能从无图形界面的终端传输。默认无需登录。**

## 快速启动

在可信 Wi-Fi 下，进入一个**专用传输文件夹**，运行：

```bash
uvx sharedserver
# 或者临时运行，不永久安装：
pipx run sharedserver
# 也可以常规安装：
python -m pip install sharedserver
sharedserver
```

手机扫描终端二维码即可打开网页。两台设备需要处于同一网络。使用期间保持终端打开，结束后按 **Ctrl+C**。需要 Python 3.10+；如尚未安装，可先安装 [uv](https://docs.astral.sh/uv/getting-started/installation/) 或 [pipx](https://pipx.pypa.io/stable/installation/)。

**默认所有能连接到服务的设备都能访问。** 可用 `sharedserver --token` 生成私密扫码链接，只共享你确实想公开的目录。

![文件与图文共享演示](https://raw.githubusercontent.com/NihaoKangkang/sharedserver/main/docs/assets/demo.gif)

演示使用桌面和手机尺寸的 Chromium 浏览器会话，包含普通局域网 HTTP 场景，不代表已完成真实 iPhone/Android 认证测试。

## 文件与图文共享

- 点击上传、用 **Ctrl+V / Cmd+V** 粘贴图片或文件，或将文件拖到页面任意位置。上传显示百分比、平均速度和预计剩余时间。
- 在其他输入框之外粘贴文字，可填入共享文本区。完整模式下修改实时同步；接收端点击 **Copy text** 复制。
- 支持的图片上传后会出现在其他已打开的页面中。可信安全上下文可使用 **Copy image**；否则打开预览，可长按/右键复制或保存。不会自动监控或写入操作系统剪贴板。
- 可选择当前文件夹内最多 **200 个文件**，点击 **Download ZIP**。服务端临时打包到磁盘，由浏览器原生下载，不把整个压缩包读进浏览器内存。
- 下载支持 **HTTP Range**、断点续传和 HEAD。上传采用分块写入，默认冲突返回 `409`，不会静默覆盖；加上 `--rename-on-conflict` 会保存为 `文件名 (1).扩展名`。
- 共享文本默认上限为 **2 MiB UTF-8 字节**。完整/只读模式的文本仅在内存中保存；收集箱文本提交为唯一的 `text_*.txt` 文件。图片保存到共享目录，WebSocket 只传路径信息。

## 工作台界面

0.4.0 新增离线优先的桌面与移动工作台。可使用 `python -m pip install --upgrade sharedserver` 或 `pipx upgrade sharedserver` 升级。

- 桌面双栏、平板 Tab、手机文件卡片；下载按钮常驻，长文件名换行。
- 系统/浅色/深色主题、当前目录搜索排序、安全纯文本/图片预览、可取消传输队列。
- 手机端开发者动作收进“更多”，顶部工具菜单提供二维码和快捷键帮助；文本支持快捷同步、换行切换和手动复制降级。
- 受保护二维码需手动粘贴终端完整链接；curl 使用明确的认证模板，不导出浏览器会话或密码。音视频播放、文件夹上传另行迭代。

## 权限模式

| 模式 | 浏览、下载、ZIP | 上传文件 | 读取共享图文 | 提交图文 |
| --- | --- | --- | --- | --- |
| `--mode full`（默认） | 允许 | 允许 | 允许 | 允许 |
| `--mode readonly` | 允许 | 禁止 | 允许 | 禁止 |
| `--mode droponly` | 禁止 | 仅收集箱根目录 | 不显示历史 | 文字点击 **Submit text**；图片通过上传提交 |

收集箱模式不能创建目录，也不能通过 HTTP 或 WebSocket 读取历史提交。服务主机的操作者直接查看收集目录；相同文字的重复提交也会分别保存。

为兼容旧版，`--read-only` 仍只禁止**文件写入**，文字可以编辑。需要同时锁定文字请使用 `--mode readonly`。不要将旧开关与 `--mode droponly` 混用。

## 完整参数表

| 参数 | 默认值 | 作用 |
| --- | --- | --- |
| `[port]` | `8000` | 保留原有位置端口写法 |
| `-p, --port PORT` | 配置值或 `8000` | 指定端口，不能与位置端口同时使用 |
| `-b, --bind, --host HOST` | `0.0.0.0` | 绑定地址；`127.0.0.1` 仅本机可访问 |
| `-d, --directory PATH` | 当前目录 | 共享根目录 |
| `-c, --config PATH` | 有则自动读取 `sharedserver.yaml` | YAML 配置文件 |
| `--mode full\|readonly\|droponly` | `full` | 同时约束 HTTP、WebSocket 与页面操作 |
| `--read-only / --no-read-only` | 关闭 | 旧版“仅文件只读”开关 |
| `--max-size, --max-upload-size MB` | `1024` | 单文件上限，单位 MiB；显式设为 `0` 表示不限 |
| `--rename-on-conflict` | 关闭 | 重名追加序号，不覆盖原文件 |
| `--token` | 关闭 | 生成高强度随机访问令牌并放进二维码 |
| `--pin PIN` | 关闭 | 4–6 位 ASCII 数字，通过 `?pin=...` 访问；与 token 二选一 |
| `--random-url` | 关闭 | 仅在随机 `/s/<secret>/` 路径下提供服务 |
| `--auth USER:PASS` | 关闭 | 可选 HTTP Basic Auth，可与私密链接/PIN 叠加 |
| `--https` | 关闭 | 临时自签名 HTTPS 证书，有效期一天 |
| `--qr / --no-qr` | 交互终端默认显示 | 强制显示或隐藏二维码 |
| `--version`, `-h / --help` | — | 版本与帮助 |

```bash
sharedserver -p 8080 -d ~/Transfer --token
sharedserver --mode readonly --random-url
sharedserver --mode droponly --pin 123456 --rename-on-conflict
sharedserver --max-size 0 --rename-on-conflict
python -m sharedserver 8080 --host 127.0.0.1
```

不想让密码出现在进程参数中，可以设置环境变量 **`SHAREDSERVER_AUTH`**（`用户名:密码`）或 **`SHAREDSERVER_TOKEN`**（16–256 个无空白的可打印 ASCII 字符）。优先级为 CLI > 环境变量 > YAML；`--token` 每次生成新令牌。Token/PIN 首次访问后换取 HttpOnly、SameSite 会话 Cookie，并从地址栏移除，重启会让会话失效。Basic Auth 使用浏览器内置认证提示，不创建用户数据库。

PIN 每个客户端地址每分钟最多允许五次失败尝试，跟踪记录有固定数量上限；短 PIN 强度有限，优先使用强随机 token。启用保护时抑制请求访问日志，避免泄露随机路径和查询令牌。

## HTTPS 与浏览器信任

`--https` 在隐藏的私有临时目录中生成证书和密钥，退出时删除。可使用已安装的 OpenSSL，或安装可选依赖：

```bash
python -m pip install 'sharedserver[https]'
sharedserver --https --token
# 临时运行并启用 HTTPS 支持：
uvx --from 'sharedserver[https]' sharedserver --https
```

**自签名 HTTPS 不会自动让设备信任证书。** 程序不会安装根证书、修改浏览器安全设置或绕过证书警告。图片剪贴板仍取决于证书信任、浏览器支持及权限。每次运行都会生成新证书。普通 HTTP 下仍可降级复制文字、预览和下载图片。可参考 [MDN 安全上下文说明](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts)。

## 无头终端 / curl 速查

以下示例使用默认完整模式，未开启访问保护：

```bash
# 上传文件：支持 PUT，不使用 multipart -F 接口。
curl --fail --upload-file ./report.pdf http://192.168.1.23:8000/upload/report.pdf
# 下载与断点续传。
curl --fail -o report.pdf 'http://192.168.1.23:8000/api/download?path=report.pdf'
curl --fail -C - -o report.pdf 'http://192.168.1.23:8000/api/download?path=report.pdf'
# 读取、保存和推送 UTF-8 文本；执行文字前应先确认其内容。
curl --fail --silent http://192.168.1.23:8000/api/clipboard/raw
curl --fail --silent http://192.168.1.23:8000/api/clipboard/raw > clipboard.txt
curl --fail --data-binary 'hello world' http://192.168.1.23:8000/api/clipboard/raw
# 将选中的文件打包为 ZIP。
curl --fail -H 'Content-Type: application/json' -d '{"paths":["one.txt","two.txt"]}' \
  -o selected.zip http://192.168.1.23:8000/api/zip
```

使用 `--random-url` 时，必须保留终端打印的完整基础路径，例如 `/s/<secret>/api/...` 和 `/s/<secret>/upload/...`。Token 客户端带 `Authorization: Bearer <token>`；PIN 客户端带 `?pin=<pin>`；Basic Auth 可用 `curl --user 用户名` 交互输入密码。Basic 与 token 叠加时，用 Basic 加 `?token=...`，一个 Authorization 请求头无法同时放两种认证。

HTTPS 应使用已核实的证书/CA 配合 curl `--cacert`，示例不会禁用证书验证。curl/Wget 上传成功返回 HTTP 201 和 `OK: filename uploaded`；其他 API 客户端返回 JSON。

## 配置、排错与安全边界

参见 [sharedserver.example.yaml](https://github.com/NihaoKangkang/sharedserver/blob/main/sharedserver.example.yaml)。CLI 覆盖 YAML；相对共享路径从配置文件所在目录计算。自定义复制扩展名列表替换默认列表，忽略大小写。HTML、SVG、JS、XML 等主动内容不会作为图片内联预览，即使写进自定义图片白名单。默认图片格式为 PNG/JPEG/WebP，并校验文件签名；其他文件通过附件下载。

连不上时，检查同一 Wi-Fi、访客网络设备隔离和主机防火墙。VPN/多网卡可显式指定 `sharedserver -b 192.168.1.23`。端口被占用可换端口；重定向终端输出时可加 `--qr`。找不到命令时，使用安装时同一个 Python 执行 `python -m sharedserver`。系统限制全局 pip 安装时，可用 uvx/pipx 或 [PyPA 虚拟环境指南](https://packaging.python.org/en/latest/guides/installing-using-pip-and-virtual-environments/)。

**HTTP 不加密传输。** Basic/PIN/token/随机路径提供访问控制，不适合把这个临时局域网工具直接暴露到公网。共享目录内的隐藏路径、符号链接、特殊文件和正在使用的配置文件被屏蔽；路径限制在共享根目录内；下载强制附件，响应禁用 MIME 嗅探。页面通过 `textContent` 渲染名称与文字。文件传输使用分块读写和磁盘暂存。共享目录应由你控制，不支持在不可信本机进程持续替换文件路径的环境下提供隔离保证。

## 开发

```bash
git clone https://github.com/NihaoKangkang/sharedserver.git
cd sharedserver
python -m venv .venv
# 使用对应 shell 激活虚拟环境，然后：
python -m pip install -e '.[dev,https]'
python -m pytest
python -m build
python -m twine check dist/*
```

CI 覆盖 Linux/macOS/Windows、Python 3.10–3.14、安装包资源和四组 Chromium 测试。浏览器测试可安装 `npm install --no-save playwright jsqr@1.4.0`、`npx playwright install chromium` 后，设置 `SHARED_PYTHON=.venv/bin/python` 并运行 `node scripts/browser_vnext.cjs`；不同 shell 设置环境变量的语法不同。额外设置 `LAN_SMOKE=1` 可验证实际内网 IP 的 HTTP 场景。响应式/交互矩阵和独立二维码解码可运行 `SHARED_PYTHON=.venv/bin/python node scripts/browser_ui.cjs`。`SHARED_PYTHON=.venv/bin/python node scripts/browser_ui_audit.cjs` 覆盖目录重试、焦点、表单与上传无障碍回归。参见[发布流程](https://github.com/NihaoKangkang/sharedserver/blob/main/docs/releasing.md)。

[MIT 许可证](https://github.com/NihaoKangkang/sharedserver/blob/main/LICENSE) · [反馈问题](https://github.com/NihaoKangkang/sharedserver/issues)
