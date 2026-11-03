# 大果系列 DSH 插件

面向 DeepSeek Harness 的插件集合。各包共享同一套界面令牌与组件层，可单独安装，也可整套启用。
本仓库只收录发布形态：构建后的 `lib/`、`locale` 资源、图标、`cordis.patch.yml` 与包清单，
不含 `node_modules`、构建脚本缓存与源工程标的物。

## 组成

插件分两层组织。基础层定义页面结构；应用层在基础层的呈现规则上提供功能。

| 层 | 包 | 版本 | 职责 |
|---|---|---|---|
| 基础层 | `dsh-ui-suite` | 2.0.1 | `--dshui-*` 设计令牌层与十六个界面组件 |
| 应用层 | `dsh-ui-quota` | 2.1.0 | 左下角用户菜单与设置页「用量」 |
| 应用层 | `dsh-sidebar-memo` | 0.1.0 | 右侧边栏的清单、目标、计划与日记 |
| 应用层 | `dsh-user-memory` | 0.1.0 | 单 Agent 长期记忆与侧栏记忆面板 |
| 工具 | `dsh-plugin-forge` | 0.3.2 | 运行时 API 查询、插件管理与 Cordis 撰写技能 |

## 依赖关系

| 包 | 依赖 | 具体构件 |
|---|---|---|
| `dsh-ui-quota` | `dsh-ui-suite`（硬依赖） | `dsh-ui-menu` 的菜单层级与入场动画、`dsh-ui-sidebar` 的侧栏行样式、`dsh-ui-copy` 的菜单层进入标记、`dsh-ui-identity` 的头像与昵称、`--dshui-*` 令牌全量 |
| `dsh-sidebar-memo` | 无清单级依赖 | 自带样式；侧栏区域与基础层统一 |
| `dsh-user-memory` | 无清单级依赖 | 自带样式；侧栏区域与基础层统一 |
| `dsh-plugin-forge` | 无 | 独立运行 |

缺失基础层时，`dsh-ui-quota` 的菜单退回宿主样式，其余包不受影响。

## 界面套件

`dsh-ui-suite` 自身只包含 `dsh.bundle.patch` 与组件依赖清单，实际界面由十六个组件包提供。
每个组件自带运行时、令牌层与宿主半边，单独安装同样可用；挂入套件后，它们在插件页呈现为
一张「界面套件」卡片下可分别停用的十六行。

| 组件包 | 版本 | 职责 |
|---|---|---|
| `dsh-ui-copy` | 2.0.0 | 空态大标题与输入框提示轮换、预览版徽章 |
| `dsh-ui-ask` | 2.0.0 | ask 弹窗换皮 |
| `dsh-ui-composer` | 2.0.0 | 输入卡片换皮与发送钮 |
| `dsh-ui-menu` | 2.0.0 | 权限、模型、Dock、右键菜单的开合动画 |
| `dsh-ui-sidebar` | 2.0.0 | 侧栏「新会话」按钮降噪 |
| `dsh-ui-identity` | 2.0.0 | 左下角账号芯片的昵称与头像 |
| `dsh-ui-session-delete` | 2.0.0 | 会话行菜单的「删除会话」 |
| `dsh-ui-status-phrases` | 2.0.0 | 状态行短语轮换、打字机与流光 |
| `dsh-ui-restart` | 2.0.0 | 标题栏「彻底重启」按钮与 `restart_dsh` 工具 |
| `dsh-ui-effort-slider` | 2.0.0 | 推理强度滑块 |
| `dsh-ui-whale` | 2.0.0 | 粒子鲸鱼壁纸与半透明界面 |
| `dsh-ui-skill-explorer` | 2.0.0 | 技能中心面板 |
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
        "dsh-ui-quota",
        "dsh-sidebar-memo",
        "dsh-user-memory",
        "dsh-plugin-forge"
      ]
    }
  }
}
```

`dsh-ui-suite` 必须以本地绝对路径的 `file:` 说明符安装。它的十六个组件以 `file:../<组件>`
指向同仓库同级目录，`github:#path:` 只检出套件单个子目录，无法解析同级组件。其余包可直接
使用 `#path:` 子目录说明符，该说明符同时作为更新源。

`dsh-plugin-forge` 的包名带 `@local` 前缀，依赖键按目录内 `name` 字段填写。

### 单独安装

十六个界面组件可脱离套件单独安装，各自提供完整的运行时与令牌层：

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

基础层的十六个组件可在插件页逐个停用，影响范围限于对应界面。停用 `dsh-ui-quota` 会同时收回
侧栏面板入口与设置页用量视图。

卸载时从 `dsh.profile.bundles` 中移除对应条目并删除 `dependencies` 项，再执行
`pnpm install`。

## 许可

各包均为 MIT。随包保留的第三方实现及其出处见对应目录的 README。
