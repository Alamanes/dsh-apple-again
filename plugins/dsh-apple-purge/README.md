# dsh-apple-purge

提示词清洗与持久化插件：把官方提示词里的身份句、免责声明、边界话术洗掉，并保证注入段在每一轮重新组装时不丢失。

补丁引擎与条目定义派生自 [dsh-purge](https://github.com/kingcharleslzy-ai/dsh-purge)（MIT），本仓库只保留三组补丁，并重做了注入、面板与更新监测。

## 三组补丁

| 分组 | 条数 | 默认 | 作用 |
|---|---|---|---|
| 提示词洗白 | 21 | 开 | 去掉官方身份句、免责声明、边界话术 |
| 持久化 | 12 | 开 | 每轮重新组装，压缩/回退后注入不丢 |
| 审批与沙箱 | 17 | 关 | 审批默认放行、沙箱默认放宽，可单独开 |

不包含：红队演练台、市场、自带 agent 预设、自动安装更新。沙箱与审批补丁是独立开关，默认关闭。

## 注入正文

仓库只带一段通用骨架（约 800 字符）。你的规则写在本地，不随仓库发布：

| 文件 | 用途 |
|---|---|
| `$DSH_HOME/apple-purge/inject.md` | 你的注入正文，面板可直接编辑 |
| `$DSH_HOME/apple-purge/full-inject.md` | 可选，面板「载入完整原版」读取它 |
| `$DSH_HOME/apple-purge/state.json` | 模块开关与最近一次应用记录 |

注入段名为 `dsh-apple-purge`，order `-99900`，独立 section，不覆盖其它插件的注入段。

## 面板

侧栏「限制」一行进入面板（斜杠盾牌图标），全部沿用 `--dshui-*` 设计令牌，跟随主题：

- 三个模块开关
- 注入正文编辑器（保存 / 恢复默认 / 载入完整原版）
- 上游锚点监测：依赖的上游版本与上游最新版本对比，只提示差异，不自动安装
- 补丁清单：已应用绿色、未应用橙色，附备份与回滚

## HTTP API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/dsh-apple-purge/status` | 宿主路径、模块、补丁状态 |
| GET/POST | `/dsh-apple-purge/text` | 读取/保存注入正文 |
| POST | `/dsh-apple-purge/reset` | 恢复默认正文 |
| GET | `/dsh-apple-purge/full` | 完整原版正文（读本地文件） |
| POST | `/dsh-apple-purge/module` | 开关模块 |
| POST | `/dsh-apple-purge/backup` | 备份宿主文件 |
| POST | `/dsh-apple-purge/apply` | 应用补丁 |
| POST | `/dsh-apple-purge/revert` | 从备份回滚 |
| GET | `/dsh-apple-purge/update` | 上游版本差异 |
| GET | `/dsh-apple-purge/ui` | 独立控制台页面 |

## 安装

把下面这段直接交给 DSH 里的 AI：

```bash
cd ~/.dsh/profiles/desktop
# 把包加进 profile 依赖并启用
pnpm add link:/path/to/dsh-apple-purge
# 然后在 profile 的 dsh.profile.bundles 里追加 dsh-apple-purge，重启 DSH
```

补丁改动的是宿主安装目录里的文件，应用前会先写 `.applepurge.bak` 备份；需要重启 DSH 才生效。

## 风险提示

- 补丁按字符串锚点匹配宿主源码，宿主升级后锚点可能失效，面板会显示「未应用」而不是静默失败。
- 「审批与沙箱」模块会放宽宿主的确认与沙箱限制，默认关闭，开启前请确认自己的使用场景。
- 本项目不提供自动更新，也不修改宿主之外的任何文件。

## 许可

MIT。补丁条目与引擎派生自 dsh-purge / dsh-purge-community，保留上游版权与许可声明，见 [LICENSE](./LICENSE)。
