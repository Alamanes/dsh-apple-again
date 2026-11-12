# dsh-ui-pet 虚拟宠物

> 独立的 DSH bundle，自带令牌层、语言包与宿主半边，不需要套件也能安装。装在同一
> profile 里时，它读的是同一套 `--dshui-*` 令牌，和 [`dsh-ui-suite`](../dsh-ui-suite)
> 的组件保持同一套外观。

把 Codex 格式的宠物包养进 DeepSeek Harness：左下角账号菜单里多一行「显示虚拟宠物」，
右边带 `⌥ Space` 的快捷键提示；宠物浮在窗口右下角，可拖动、双击跳回原位。

## 宠物包放在哪

按这个顺序找，前一个目录里没有可用宠物才看后一个：

1. `~/.dsh/pets`
2. `~/.codex/pets`

「可用」指这个目录下至少有一个子目录，里面有 `pet.json` 和一张能被读到的精灵图。

```text
~/.dsh/pets/
└── boba/
    ├── pet.json
    └── spritesheet.webp
```

`pet.json` 用 Codex 的写法：

```json
{
  "id": "boba",
  "displayName": "Boba",
  "spriteVersionNumber": 2,
  "spritesheetPath": "spritesheet.webp"
}
```

- `spriteVersionNumber: 1` 是 8×9 格，`2` 是 8×11 格；不写按 v1。
- `spritesheetPath` 省略时按 `spritesheet.webp`、`spritesheet.png` 等常见名字找。
- 每一行对应一个动作，顺序是 idle、右跑、左跑、挥手、跳、失败、等待、运行中、审阅。
- 每行实际有几帧由图片的透明像素决定，不需要在清单里写帧数。

改完目录后点设置页「通用」里的「刷新」，或者刷新页面。

## 安装

```sh
cd ~/.dsh/profiles/desktop
pnpm install
```

套件以 `file:` 方式安装，源码改动后要重新 `pnpm install` 再重启 DSH。

## 用法

- 点左下角头像打开账号菜单，里面有一行「显示虚拟宠物」，右边标着 `⌥ Space`；
  点它显示或收起宠物，菜单随之关闭。
- 快捷键 `⌥ Space` 在任何页面都能切换。
- 拖动宠物可以挪位置；双击让它跳一下并回到右下角。
- 设置 → 通用 → 虚拟宠物：显示来源（`~/.dsh/pets` 还是退回的 `~/.codex/pets`），
  也可以刷新宠物列表。

## 许可

本包代码为本仓库自写，[MIT](./LICENSE)。宠物图集由用户自行提供，随包不分发任何第三方素材。
