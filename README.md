# dsh-apple-again

DeepSeek Harness 插件的发布仓库。每个插件一个目录，收录的都是可直接安装的发布形态：
已构建的 `lib/`、locale 资源、`cordis.patch.yml` 与清单文件，不含 `node_modules`、构建缓存与源工程杂物。

## 插件

| 目录 | 包名 | 说明 |
|---|---|---|
| `plugins/dsh-plugin-forge` | `@local/dsh-plugin-forge` | 大果的插件工坊：把创造模式的插件制造能力带进任意会话——运行时 API 查询、持久化插件管理、Cordis 插件撰写技能与自诊断 |
| `plugins/dsh-ui-suite` | `dsh-ui-suite` | 界面套件：一个 bundle 包，下挂十六个可独立停用的组件包，共享一套 `--dshui-*` 设计令牌 |
| `plugins/dsh-ui-quota` | `dsh-ui-quota` | 更好的用户菜单：左下角用户菜单收纳侧栏面板入口，设置页「用量」分区展示额度卡片与每日 Token 热力图。必须搭配界面套件 |
| `plugins/dsh-sidebar-memo` | `dsh-sidebar-memo` | 右侧边栏的备忘录：与模型共写的清单、目标簿，以及由 AI 代笔的日记 |
| `plugins/dsh-user-memory` | `dsh-user-memory` | 单 Agent 的长期记忆：Markdown 条目、逐会话冻结进提示词、回合结束自动整理，以及可查看和修改的记忆面板 |

## 界面套件的组件

`dsh-ui-suite` 自身只有 `dsh.bundle.patch` 与一份组件依赖清单，十六个组件各自独立成包，
可在插件页单独停用。它们与套件平级放在 `plugins/` 下，套件以 `file:../<组件>` 指回同级目录。

| 组件包 | 职责 |
|---|---|
| `dsh-ui-copy` | 空态大标题与输入框提示轮换 |
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
| `dsh-ui-chat-fold` | 思考行与过程组的自动开合、轨迹视图收起输入区 |
| `dsh-ui-chat-motion` | 插入符位移、缓存命中率转轮、上下文占用饼 |
| `dsh-ui-chat-diff` | `run_code` 里 write / edit 子调用的 diff 行与流式改动行数 |

## 安装

把插件登记进 profile 的 `package.json`：

```json
{
  "dependencies": {
    "dsh-sidebar-memo": "github:Alamanes/dsh-apple-again#path:plugins/dsh-sidebar-memo",
    "dsh-ui-quota": "github:Alamanes/dsh-apple-again#path:plugins/dsh-ui-quota",
    "dsh-user-memory": "github:Alamanes/dsh-apple-again#path:plugins/dsh-user-memory",
    "dsh-plugin-forge": "github:Alamanes/dsh-apple-again#path:plugins/dsh-plugin-forge",
    "dsh-ui-suite": "file:/absolute/path/to/dsh-apple-again/plugins/dsh-ui-suite"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "dsh-sidebar-memo",
        "dsh-ui-quota",
        "dsh-ui-suite",
        "dsh-user-memory",
        "dsh-plugin-forge"
      ]
    }
  }
}
```

界面套件必须用本地绝对路径的 `file:` 说明符安装：它的十六个组件以 `file:../<组件>` 指回同一个
仓库的同级目录，`github:#path:` 只取套件那一个子目录，解析不到同级组件。其余插件用 `#path:` 即可。

`dsh-plugin-forge` 的包名带 `@local` 前缀，登记依赖时按仓库内的 `name` 书写。

## 许可

各包均为 MIT；随包保留的第三方实现与出处见对应目录的 README。
