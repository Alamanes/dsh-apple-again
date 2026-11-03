# dsh-ui-session-delete

会话行「…」菜单里的「删除会话」与确认弹窗，按血缘彻底删除磁盘数据。

2.1 起从界面套件移出，独立成包。包内声明了 `dsh.bundle.patch`，装进 profile 的
`dsh.profile.bundles` 后自动挂载，不需要手写 patch。

## 安装

```json
{
  "dependencies": {
    "dsh-ui-session-delete": "file:/absolute/path/to/dsh-apple-again/plugins/dsh-ui-session-delete"
  },
  "dsh": {
    "profile": {
      "bundles": ["dsh-ui-session-delete"]
    }
  }
}
```

也可以用 `github:Alamanes/dsh-apple-again#path:plugins/dsh-ui-session-delete`。

## 宿主路由

`POST /dsh-ui-copy/session-delete/delete` 接收 `{ sessionId }`，返回
`{ ok, removed, failed }`。旧拼写 `/dsh-session-delete/delete` 仍注册为同一处理器的别名。

## 许可

MIT。无第三方移植代码。
