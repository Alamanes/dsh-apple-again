# 大果的插件工坊 dsh-plugin-forge

把创造模式相对标准模式多出的能力，加上节点调试工具，打成一个独立、可随时停用的 bundle。

## 包内构成

| 模块 | 来源 | 提供什么 |
| --- | --- | --- |
| 工具包本体 | 自建 | `cordis_inspect_list`、`cordis_inspect_query`、`plugin_manager`、三份 Cordis 编写技能 |
| `modules/debugging` | dsh-plugin-debugging 0.7.1（MIT，zlZayn） | 运行时自检自修工具组与 skill |

debugging 已拆进本仓库的 `modules/` 下，作为本包内的子路径加载，不单独安装。代码在你手里，改完直接生效。

## 安装

在 Web 侧栏的「插件」页选择安装本地 bundle，目录指向本文件夹。

装完重启一次。验证：

1. 新开任务，`cordis_inspect_list` 能列出 provider；
2. `dsh_list_instances` 能枚举本机 DSH 实例；
3. `dsh_diagnose_plugin_load` 能对任意插件给出加载结论。

## 改 debugging

工具都在 `modules/debugging/lib/tools/`，每个工具一个文件，入口在 `lib/tools/index.js`；宿主主逻辑在 `lib/index.js`。

改完不需要重新打包，本包用 `file:` 安装，重装本 bundle 或热重载即可。

## 设计约束

- **不改预设。** `cordis.patch.yml` 只有 `insert`，没有覆盖条目。
- **随开随用。** 停用 bundle 后这些行全部退出组合。
- **权限照旧。** `plugin_manager` 的每个动作仍要求 Full access 或逐次批准；诊断工具里的重启、热重载同样是显式动作。
