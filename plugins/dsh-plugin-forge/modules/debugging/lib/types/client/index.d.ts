/**
 * 浏览器半体：侧边栏「插件（Plugins）」→「已安装（Installed）」组 → **点 dsh-plugin-debugging
 * 进它的详情页**，配置卡片就内联在描述与「包含的组件」之间 —— 没有多一次 Configure。
 *
 * 挂载点是插件管理页声明的 `plugins.bundle.config` 槽，key 是**包名**。
 * 这个槽**只渲染 `view: 'page'`**，而且座位里**没有** `form`（已回 0.2.0-rc.2 的
 * `dsh-client-ui-plugin-manager/lib/client.js` 核过：页面那处是
 * `renderSlot('plugins.bundle.config', { view: 'page' }, { entryKey: pkg.name })`，
 * 只递 `view` 与 `entryKey`）—— 表单因此由卡片自己向 `ctx.configForms.get(<loader entry id>)` 取，
 * 这也是该槽唯一的官方取表单路径。
 *
 * ⚠️ **槽契约的 `.d.ts` 里 `owner` 声明了可选的 `form` 字段，而页面从不递它** ——
 * 照那个声明去写「形参里有 form」会在运行时拿到 undefined，且类型上完全说得过去（它是可选的）。
 * 取表单只能自己取。
 *
 * 于是有两个**今天同串、却不是一回事**的 id：
 * - 槽 key = [package.json](../../package.json) 的 `name`（包名）；
 * - `get()` 的实参 = [cordis.patch.yml](../../cordis.patch.yml) 那条 insert 的 `id`（loader entry id）。
 *
 * 写错前者 = 整块配置不出现；写错后者 = 卡片照常出现、**永远只读且不报错**。
 *
 * 卡片只承载**一个布尔**：宿主侧 `Config.enableRestart`（`dsh_restart` 的总闸，默认关）。
 * 字段名由宿主侧的 schema 决定，本文件**只渲染与写值，不定义它**。
 * ⚠️ **绝不碰任何 secret 字段**：本仓 `dsh_sign_cookie` 是唯一经手密钥的工具，
 * 而活动 profile 的 Cordis patch 是明文可读的 —— 任何落进 `form.mutate` 的值都会出现在那里。
 *
 * 文案全部走 DSH 的 locale 服务（`ctx.locale`），不硬编码 —— 字典在 [locales.ts](./locales.ts)。
 */
import type { Context } from '@deepseek-ai/cordis';
/** 依赖的浏览器端服务。
 *
 * `slots` 与 `locale` 都是硬依赖：注册与渲染就需要它们，缺席时 DSH 会直接报错而不是降级。
 * 标准 web 装配必然带这两个（`ui-renderer` 与 `dsh-client-locale`）。
 *
 * ⚠️ **`configForms` 刻意不在这里**：inject 是**激活门禁**，把一个并非每个宿主都有的服务
 * 写进模块级 inject，会让那些宿主上的整个客户端半体 pending（连字典注册都轮不上）。
 * 它走嵌套的 `ctx.inject(['configForms'], …)`，缺席时降级限制在「卡片不注册」这一件事上。
 */
export declare const inject: string[];
/**
 * 注册配置卡片与它的字典。
 *
 * 槽是插件管理页的 `plugins.bundle.config`，`key` 是**包名**（见 {@link BUNDLE_NAME}）：
 * 页面按它寻址一个 bundle 的配置，写错即整块不出现。**只给 `page`** ——
 * 该槽只渲染 `page`，`summary` 没有任何渲染路径，所以不留那条死文案。
 *
 * `configForms` 走**嵌套 `ctx.inject`** 而不是写进模块级 {@link inject}：
 * 后者是**激活门禁**，会让更早宿主上的整个客户端半体 pending（字典、探测连发声机会都没有）。
 * 嵌套的代价只是「卡片可选」，而且这个缺席**可观测**（探测的那条 WARN 正是报它）。
 *
 * 字典注册进 `ctx.effect`，插件卸载时随之注销（`register` 返回 disposer）。
 *
 * @param ctx - 浏览器端 Cordis 上下文。
 */
export declare function apply(ctx: Context): void;
