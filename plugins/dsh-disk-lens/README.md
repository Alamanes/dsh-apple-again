# dsh-disk-lens

磁盘透视面板。规则先量一遍，模型再补充判断；每条建议都写明做什么、删哪里，勾选后才执行，默认全部进废纸篓。

![盘面](icon.png)

## 它在做什么

- **扫描**：14 条规则覆盖缓存、构建产物、包管理器、AI 模型、容器、浏览器、创意软件、游戏、废纸篓等位置，用 `du -akx` 测量，可并行、可取消、有超时。
- **沙盘**：按占用比例画的容量地图，每一堆沙是一类数据，耙过的平地是可用空间。
- **建议**：规则自带一批清理候选，模型可以再补；每条都有 safety 等级、执行方式与完整命令。
- **执行**：先生成完整 zsh 脚本给你看，确认后才跑；`trash` 移进废纸篓，`delete` 需要在设置里显式打开开关。
- **审计**：每次扫描、建议写入、清理都追加到 `audit.jsonl`，面板里能翻。

## 与 Kanso 的差别

| | Kanso 0.1.11 | dsh-disk-lens |
|---|---|---|
| 大脑 | 外部 CLI（Claude Code / Codex / Pi） | DSH 当前会话的模型，调用 `disk_*` 工具 |
| 规则 | 编在 bundle 里 | `src/host/rules.js`，改完刷新即生效 |
| 执行 | 点确认直接跑 | 先出脚本，再执行；默认废纸篓 |
| 状态 | Application Support 私有目录 | `~/.dsh/storages/dsh-disk-lens/`，纯 JSON |
| 面板 | Tauri + WKWebView | DSH Web GUI 里的一个页面 |

## 规则

规则表是普通数组，每条包含 `id`、`family`、`name`、`items`、可选的 `cleanup` 生成器。加一条自己的规则：

```js
{
  id: 'my-rule',
  family: 'caches',       // content | tools | caches | system
  name: '我的缓存目录',
  items: [{ label: '某个目录', path: '~/some/cache' }],
  cleanup: (measured) => [{
    id: 'my-rule:clear',
    label: '清掉它',
    why: '可以重新生成。',
    bytes: measured.get('~/some/cache') ?? 0,
    safety: 'safe',
    method: 'trash',
    paths: ['~/some/cache'],
  }],
}
```

## 工具（给模型）

- `disk_scan`：跑一次扫描并返回摘要。
- `disk_state`：读上次快照，不测量。
- `disk_propose`：提交分类与清理建议。
- `disk_clean`：执行选中的建议。

面板本身不需要模型；在对话里说「分析一下磁盘」时模型才会用到这些。

## 安全

- 受保护目录不许整目录删除，系统目录、`~/.ssh`、`~/.gnupg`、钥匙串、邮件、信息、iCloud 文档一律拒绝。
- 家目录之外只允许 `/Applications` 与 `/Library/Caches`。
- 命令黑名单挡住 `sudo`、`rm -rf /`、`mkfs`、`diskutil erase`、fork bomb、`dd if=`、写 `/dev/disk*`。
- 每条建议带审查签名（method + paths + command 的 sha256 前缀），执行前重算，改动过就拒绝。
- 默认 `trash`；`delete` 必须在设置里打开「允许直接删除」。

## 数据

```
~/.dsh/storages/dsh-disk-lens/
├── snapshot.json   最后一次扫描
├── settings.json   删除开关、并发数、被关掉的规则
├── plan.json       最后一次生成的清理计划与脚本
└── audit.jsonl     审计日志
```

## 安装

```sh
dsh plugin install /绝对路径/plugins/dsh-disk-lens
```

或在 DSH 的插件管理里安装本地 bundle。

## 许可

MIT。
