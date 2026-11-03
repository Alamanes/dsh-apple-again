# dsh-ui-skill-explorer

按来源浏览、启用、新建、删除技能的技能中心面板。

2.1 起从界面套件移出，独立成包。包内声明了 `dsh.bundle.patch`，装进 profile 的
`dsh.profile.bundles` 后自动挂载，不需要手写 patch。

## 安装

```json
{
  "dependencies": {
    "dsh-ui-skill-explorer": "file:/absolute/path/to/dsh-apple-again/plugins/dsh-ui-skill-explorer"
  },
  "dsh": {
    "profile": {
      "bundles": ["dsh-ui-skill-explorer"]
    }
  }
}
```

也可以用 `github:Alamanes/dsh-apple-again#path:plugins/dsh-ui-skill-explorer`。

## 宿主路由

`/dsh-ui-copy/skill-explorer/` 下的 list、read、set-enabled、set-provider-enabled、
create、update、delete、health。旧前缀 `/api/dsh-skill-explorer/` 仍注册为别名。

## 许可

MIT；宿主与浏览器半边移植自 `@linxin666/dsh-client-ui-skill-explorer@0.4.14`，
按 BSD-3-Clause 收录，版权归原作者。上游随包提供的匿名使用统计端点随移植保留。
许可证原文见仓库根的 `THIRD-PARTY-NOTICES.md`。
