# 大果的系列 DSH 插件

一组为 DeepSeek Harness 编写的插件，按同一套界面语言组织，单独可用，成套更完整。
工程上分为两层：界面套件定义页面的样子，其余插件在这层地基上长出功能。

## 为什么是一组

界面套件提供整套视觉的根基——`--dshui-*` 设计令牌层，加上十六个可单独停用的界面组件：
文案、输入卡片、侧栏、菜单、身份芯片、状态行、主题与聊天动效。页面上的圆角、间距、颜色与
动效曲线都从这一层取。

更好的用户菜单直接建立在套件之上：菜单的入场动画来自 `dsh-ui-menu`，侧栏行样式来自
`dsh-ui-sidebar`，头像与昵称读 `dsh-ui-identity`，配色全部取自令牌层。它是这套插件里唯一
在清单上写明硬依赖的成员，缺了套件，菜单会退回宿主样式。

备忘录与用户记忆是功能型成员，自带样式，可以独立运行；装进同一套侧栏之后，清单、目标、
计划、日记与记忆面板排在同一条窄栏里，成为一块完整的工作区。

插件工坊与其余成员没有运行依赖。它把制造插件的能力做成可拆卸的包，让这套插件在会话里
继续被扩展。

## 成员

| 插件 | 包名 | 职责 | 依赖 |
|---|---|---|---|
| 界面套件 | `dsh-ui-suite` | 令牌层与十六个界面组件，整套插件的视觉地基 | 无 |
| 更好的用户菜单 | `dsh-ui-quota` | 左下角用户菜单收纳侧栏面板入口，用量抽屉显示月度额度与峰谷，设置页「用量」有额度卡片与 Token 热力图 | 必须搭配界面套件 |
| 备忘录 | `dsh-sidebar-memo` | 右侧边栏的清单、目标、计划与 AI 代笔的日记 | 无 |
| 用户记忆 | `dsh-user-memory` | 单 Agent 的长期记忆：Markdown 条目、逐会话冻结进提示词、回合结束自动整理 | 无 |
| 插件工坊 | `dsh-plugin-forge` | 把创造模式的插件制造能力带进任意会话：运行时 API 查询、持久化插件管理、Cordis 撰写技能 | 无 |

## 界面套件

`dsh-ui-suite` 自身只有 `dsh.bundle.patch` 与一份组件依赖清单。十六个组件各自独立成包，
每个都自带运行时、令牌层与宿主半边，单独安装也能工作；挂进套件后，它们在插件页显示为一张
「界面套件」卡片下可分别停用的十六行。

| 组件包 | 职责 |
|---|---|
| `dsh-ui-copy` | 空态大标题与输入框提示轮换、预览版徽章 |
| `dsh-ui-ask` | ask 弹窗的换皮 |
| `dsh-ui-composer` | 输入卡片换皮与发送钮 |
| `dsh-ui-menu` | 权限、模型、Dock、右键菜单的开合动画 |
| `dsh-ui-sidebar` | 侧栏「新会话」按钮降噪 |
| `dsh-ui-identity` | 左下角账号芯片的昵称与头像 |
| `dsh-ui-session-delete` | 会话行菜单的「删除会话」 |
| `dsh-ui-status-phrases` | 状态行短语轮换、打字机与流光 |
| `dsh-ui-restart` | 标题栏「彻底重启」按钮与 `restart_dsh` 工具 |
| `dsh-ui-effort-slider` | 推理强度滑块 |
| `dsh-ui-whale` | 粒子鲸鱼壁纸与半透明界面 |
| `dsh-ui-skill-explorer` | 技能中心面板 |
| `dsh-ui-theme` | 设置页「主题」分区，十四套配色预设 |
| `dsh-ui-chat-fold` | 思考行与过程组的自动开合、卷帘门折叠过渡 |
| `dsh-ui-chat-motion` | 插入符位移、缓存命中率转轮、上下文占用饼 |
| `dsh-ui-chat-diff` | `run_code` 里 write / edit 子调用的 diff 行与流式改动行数 |

## 安装

把插件按 GitHub 子目录说明符登记进 profile 的 `package.json`：

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

界面套件必须以本地绝对路径的 `file:` 安装：它的十六个组件用 `file:../<组件>` 指回同一仓库的
同级目录，`github:#path:` 只取套件那一个子目录，解析不到同级组件。其余插件用 `#path:` 即可，
整条说明符就是更新源。

`dsh-plugin-forge` 的包名带 `@local` 前缀，登记依赖时按目录内 `name` 字段书写。

## 更新与停用

```sh
cd "$DSH_PROFILE_DIR"
pnpm install
```

pnpm 对 Git 依赖按 commit 缓存，仓库有新提交时用 `pnpm update <包名>` 强制重取，再重启
`dsh web`。`file:` 安装的套件改完源码后重新 `pnpm install`。

套件下的十六个组件可以在插件页逐个停用，停用一个只影响对应的那一处界面；更好的用户菜单
停用后，侧栏面板入口与用量页一并收回。

## 许可

各包均为 MIT，随包保留的第三方实现与出处见对应目录的 README。
