# 大果系列 DSH 插件

面向 DeepSeek Harness 的插件集合。各包共享同一套界面令牌与组件层，可单独安装，也可整套启用。
本仓库只收录发布形态：构建后的 `lib/`、`locale` 资源、图标、`cordis.patch.yml` 与包清单，
不含 `node_modules`、构建脚本缓存与源工程标的物。

<p align="center">
  <a href="./plugins/dsh-ui-suite/"><img src="./plugins/dsh-ui-suite/icon.png" width="76" alt="界面套件"></a>
  <a href="./plugins/dsh-ui-quota/"><img src="./plugins/dsh-ui-quota/icon.png" width="76" alt="更好的用户菜单"></a>
  <a href="./plugins/dsh-sidebar-memo/"><img src="./plugins/dsh-sidebar-memo/icon.png" width="76" alt="备忘录"></a>
  <a href="./plugins/dsh-user-memory/"><img src="./plugins/dsh-user-memory/icon.png" width="76" alt="用户记忆"></a>
  <a href="./plugins/dsh-plugin-forge/"><img src="./plugins/dsh-plugin-forge/icon.webp" width="76" alt="插件工坊"></a>
</p>

## 组成

插件分两层组织。基础层定义页面结构；应用层在基础层的呈现规则上提供功能。

| 图标 | 层 | 包 | 版本 | 职责 |
|---|---|---|---|---|
| <img src="./plugins/dsh-ui-suite/icon.png" height="32" alt=""> | 基础层 | `dsh-ui-suite` | 2.1.0 | `--dshui-*` 设计令牌层与十四个界面组件 |
| | 应用层 | `dsh-ui-session-delete` | 2.1.0 | 会话行菜单的「删除会话」，按血缘删除磁盘数据 |
| | 应用层 | `dsh-ui-skill-explorer` | 2.1.0 | 技能中心面板：浏览、启用、新建、删除技能 |
| <img src="./plugins/dsh-ui-quota/icon.png" height="32" alt=""> | 应用层 | `dsh-ui-quota` | 2.1.0 | 左下角用户菜单与设置页「用量」 |
| <img src="./plugins/dsh-sidebar-memo/icon.png" height="32" alt=""> | 应用层 | `dsh-sidebar-memo` | 0.1.0 | 右侧边栏的清单、目标、计划与日记 |
| <img src="./plugins/dsh-user-memory/icon.png" height="32" alt=""> | 应用层 | `dsh-user-memory` | 0.1.0 | 单 Agent 长期记忆与侧栏记忆面板 |
| <img src="./plugins/dsh-plugin-forge/icon.webp" height="32" alt=""> | 工具 | `dsh-plugin-forge` | 0.3.2 | 运行时 API 查询、插件管理与 Cordis 撰写技能 |

## 依赖关系

| 包 | 依赖 | 具体构件 |
|---|---|---|
| `dsh-ui-quota` | `dsh-ui-suite`（硬依赖） | `dsh-ui-menu` 的菜单层级与入场动画、`dsh-ui-sidebar` 的侧栏行样式、`dsh-ui-copy` 的菜单层进入标记、`dsh-ui-identity` 的头像与昵称、`--dshui-*` 令牌全量 |
| `dsh-sidebar-memo` | 无清单级依赖 | 自带样式；侧栏区域与基础层统一 |
| `dsh-user-memory` | 无清单级依赖 | 自带样式；侧栏区域与基础层统一 |
| `dsh-plugin-forge` | 无 | 独立运行 |
| `dsh-ui-session-delete` | 无清单级依赖 | 自带样式与宿主半边 |
| `dsh-ui-skill-explorer` | 无清单级依赖 | 自带样式与宿主半边 |

缺失基础层时，`dsh-ui-quota` 的菜单退回宿主样式，其余包不受影响。`dsh-ui-session-delete`
与 `dsh-ui-skill-explorer` 不依赖基础层，可单独安装。

## 界面套件

`dsh-ui-suite` 自身只包含 `dsh.bundle.patch` 与组件依赖清单，实际界面由十四个组件包提供。
每个组件自带运行时、令牌层与宿主半边，单独安装同样可用；挂入套件后，它们在插件页呈现为
一张「界面套件」卡片下可分别停用的十四行。

| 组件包 | 版本 | 职责 |
|---|---|---|
| `dsh-ui-copy` | 2.0.0 | 空态大标题与输入框提示轮换、预览版徽章 |
| `dsh-ui-ask` | 2.0.0 | ask 弹窗换皮 |
| `dsh-ui-composer` | 2.0.0 | 输入卡片换皮与发送钮 |
| `dsh-ui-menu` | 2.0.0 | 权限、模型、Dock、右键菜单的开合动画 |
| `dsh-ui-sidebar` | 2.0.0 | 侧栏「新会话」按钮降噪 |
| `dsh-ui-identity` | 2.0.0 | 左下角账号芯片的昵称与头像 |
| `dsh-ui-status-phrases` | 2.0.0 | 状态行短语轮换、打字机与流光 |
| `dsh-ui-restart` | 2.0.0 | 标题栏「彻底重启」按钮与 `restart_dsh` 工具 |
| `dsh-ui-effort-slider` | 2.0.0 | 推理强度滑块 |
| `dsh-ui-whale` | 2.0.0 | 粒子鲸鱼壁纸与半透明界面 |
| `dsh-ui-theme` | 2.0.0 | 设置页「主题」分区，十四套配色预设 |
| `dsh-ui-chat-fold` | 2.0.0 | 思考行与过程组的自动开合、卷帘门折叠过渡 |
| `dsh-ui-chat-motion` | 2.0.0 | 插入符位移、缓存命中率转轮、上下文占用饼 |
| `dsh-ui-chat-diff` | 2.0.0 | `run_code` 中 write / edit 子调用的 diff 行与流式改动行数 |

## 兼容性

| 项 | 要求 |
|---|---|
| Node.js | `>=18` |
| DeepSeek Harness | `>=0.2.0-rc.2 <0.3.0-0` |
| 包管理器 | pnpm（`#path:` 子目录说明符需 v9 及以上） |

`dsh-plugin-forge` 未声明 `engines` 约束。

## 安装

在 profile 的 `package.json` 中登记依赖与 bundle：

```json
{
  "dependencies": {
    "dsh-ui-suite": "file:/absolute/path/to/dsh-apple-again/plugins/dsh-ui-suite",
    "dsh-ui-quota": "github:Alamanes/dsh-apple-again#path:plugins/dsh-ui-quota",
    "dsh-sidebar-memo": "github:Alamanes/dsh-apple-again#path:plugins/dsh-sidebar-memo",
    "dsh-user-memory": "github:Alamanes/dsh-apple-again#path:plugins/dsh-user-memory",
    "dsh-plugin-forge": "github:Alamanes/dsh-apple-again#path:plugins/dsh-plugin-forge"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "dsh-ui-suite",
        "dsh-ui-session-delete",
        "dsh-ui-skill-explorer",
        "dsh-ui-quota",
        "dsh-sidebar-memo",
        "dsh-user-memory",
        "dsh-plugin-forge"
      ]
    }
  }
}
```

`dsh-ui-suite` 必须以本地绝对路径的 `file:` 说明符安装。它的十四个组件以 `file:../<组件>`
指向同仓库同级目录，`github:#path:` 只检出套件单个子目录，无法解析同级组件。其余包可直接
使用 `#path:` 子目录说明符，该说明符同时作为更新源。

`dsh-plugin-forge` 的包名带 `@local` 前缀，依赖键按目录内 `name` 字段填写。

### 单独安装

十四个界面组件可脱离套件单独安装，各自提供完整的运行时与令牌层：

```json
"dsh-ui-theme": "github:Alamanes/dsh-apple-again#path:plugins/dsh-ui-theme"
```

## 数据存储

| 包 | 位置 | 内容 |
|---|---|---|
| `dsh-sidebar-memo` | `~/.dsh/storages/dsh-memo` | 清单、目标、计划、日记 |
| `dsh-user-memory` | `~/.dsh/storages/user-memory/memory/` | `MEMORY.md`、主题文件、日记与快照 |

两处均为本地文件，不涉及上传。

## 更新

```sh
cd "$DSH_PROFILE_DIR"
pnpm install
```

pnpm 按 commit 缓存 Git 依赖。仓库有新提交时执行 `pnpm update <包名>` 强制重取，随后重启
`dsh web`。以 `file:` 安装的套件在源码变更后需重新 `pnpm install`。

## 停用与卸载

基础层的十四个组件可在插件页逐个停用，影响范围限于对应界面。停用 `dsh-ui-quota` 会同时收回
侧栏面板入口与设置页用量视图。

卸载时从 `dsh.profile.bundles` 中移除对应条目并删除 `dependencies` 项，再执行
`pnpm install`。

## 许可

各包自产部分均为 MIT。以下实现源自第三方，版权归原作者，按原协议收录，未改变其许可条件。

### 移植自第三方的实现

| 包 | 上游 | 协议 | 移植范围 |
|---|---|---|---|
| `dsh-ui-skill-explorer` | `@linxin666/dsh-client-ui-skill-explorer@0.4.14`（zhu1090093659） | BSD-3-Clause | 技能中心的宿主与浏览器半边、SKILL.md 的解析与改写、技能的启用与增删；包内指向 `dsh-market.com` 的遥测端点随上游保留 |
| `dsh-ui-whale` | `dsh-plugin-harness-whale@0.2.0`（HeShen-1/deepseek-whale-wallpaper） | MIT | 粒子鲸鱼壁纸的 WebGL2 点云、Canvas2D 回退与活动感知调光 |
| `dsh-ui-status-phrases` | `dsh-status-rotator@0.38.0`（01Virex） | MIT | 短语的洗牌袋抽取、打字机锁宽与渐变样式 |
| `dsh-ui-effort-slider` | `dsh-codex-reasoning-effort-slider`（bakabaicai，作者 Nachoneko_miao） | MIT | Codex 风格的推理强度弹层、Fast 开关与滑轨 |
| `dsh-ui-quota` | `dsh-commandcode-quota@0.3.2`（Jovan1666/commandcode-usage） | MIT | Command Code 额度报告的数据模型与取数路由 |
| `dsh-plugin-forge` | `dsh-plugin-debugging@0.7.1`（zlZayn） | MIT | `modules/debugging` 的运行时自检工具组与技能 |

### 外部数据与服务

| 包 | 来源 | 性质 |
|---|---|---|
| `dsh-ui-quota` | Command Code API（`api.commandcode.ai`） | 账号额度与用量，以用户自己的 API key 调用 |
| `dsh-ui-quota` | `NateScarlet/holiday-cn`（MIT，Copyright © 2019 NateScarlet） | 节假日判定，数据经 jsDelivr 与 raw.githubusercontent.com 拉取 |
| `dsh-ui-skill-explorer` | `dsh-market.com/api/telemetry/event` | 上游内置的匿名使用统计，随移植保留 |

### 设计参考

- `dsh-ui-effort-slider` 的交互形态取自 Codex 桌面版的推理强度弹层。
- `dsh-user-memory` 的记忆模型参考 DS Bot 的记忆系统，去掉多 Bot、群聊与权限层。

### 许可证全文

各上游的许可证原文集中在 [`THIRD-PARTY-NOTICES.md`](./THIRD-PARTY-NOTICES.md)。包内另带的许可证文件：

- `plugins/dsh-sidebar-memo/LICENSE` —— 本包 MIT 全文
- `plugins/dsh-plugin-forge/modules/debugging/LICENSE` —— 调试模块的 MIT 全文，版权声明为 Zayn

其余包在各自目录的 `package.json` 中以 `license: MIT` 声明。
