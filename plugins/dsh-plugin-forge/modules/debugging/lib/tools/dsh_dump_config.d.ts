/**
 * `dsh_dump_config` —— 跑两种 dump 并把 `x-cordis.diagnostics` 读成人话。
 *
 * 对应 SKILL §3.8。两种 dump 的**退出码语义不同**，但那是**恒定知识** ——
 * 它现在只写在描述层的边界段（`DUMP_CONFIG_DESCRIPTION.boundary`）**一次**，
 * 不再每次调用复述一遍（SHAPE §2「移」的规则，B16 会抓恒定块）。同一处搬走的
 * 还有已知误报的判据（`preset-*` 行的 `unrecognized Loader tree carrier`）。
 *
 * **本工具的门是「已筛出的 `actionable` 列表是否非空」，不是退出码**（这是它最容易
 * 写错的地方）：
 * - `--dump-config`：**退出码恒 0**、不做 schema 校验 → **不能当门禁**，
 *   而组合期错仍写在它的 **stderr** 上（实测 `patch: name mismatch … skipping`）；
 * - `--dump-config-schema`：**退出码 1 = 有 error**，诊断在 stdout 的 `diagnostics` 里。
 *
 * 而这扇门有一个前提：**「筛过了、是空的」与「根本没读到」不是一回事**。所以
 * `key.notScreened` 记下「工具打算读、但这次没读到」的来源，渲染层据此出三值：
 * 读到且为空 = `actionable: none`／读到且有 = 逐条列出／**没读到 = 绝不许印 `none`**。
 * 归集只有一处（`screen()`），**成功与失败分支共用它** —— 一次 dump 失败不该让
 * 已经跑成的那一次变得不可读（那正是本工具曾有过的缺陷）。
 *
 * 而 error **可能是误报**：官方 `preset-*` 行的 `unrecognized Loader tree carrier`
 * 就是已知的那条，判它必须把 `path`（形如 `/182`）解析成组合树里的 entry id ——
 * 所以「有 error」与「有**该管的** error」不是一回事，本工具分两类报。
 *
 * ## 一条**在起子进程之前**就成立的拒：保留 profile
 *
 * `dsh --profile desktop --dump-config` 被 CLI 无条件拒绝（`rejectElectronProfile`），
 * 所以「读 desktop 的组合树」这件事**在任何载体上都做不到**，换个 profile 去答又是另一个问题。
 * 判据因此建在 **profile 名**上（`isReservedDesktopProfile`）而不是载体上 —— 从 web 会话里
 * dump desktop 同样读不出来。结论与理由见 `reservedProfileFailure()`。
 *
 * ## 输出形状（SHAPE §3 / §4.1 / §5）
 *
 * `data` 顶层**恰好三键**：`verdict`（L1，成功失败都有）/ `key`（L2 的原料）/
 * `audit`（给人复核，不进模型文本）。`key` 里放**模型下一步要读的**：
 * `actionable`（正因如此它属于 `key`，不是 `audit`）、`notScreened`（覆盖完整性：
 * 「不知道」不许印成「没有」）、两次 dump 的退出码与失败时的 stderr、以及 hmr 是否可用。
 * 原始全量 `diagnostics` 与 `counts` 放 `audit`。
 *
 * 失败分支也走同一个形状（`ok:false` 只表示「这次操作没完成」），且**必须有实质
 * `verdict`**：新契约下 `error.message` 不进模型文本（SHAPE §4.1 字段角色表），
 * 失败的「所以呢」只能由 `verdict` 承载。
 */
import { type ToolDefinition } from '@deepseek-ai/dsh-tools';
import { type ToolDescription } from './describe.js';
import { type ToolDeps } from './shared.js';
/** 工具名。 */
export declare const DUMP_CONFIG_TOOL = "dsh_dump_config";
/**
 * 本工具的描述（SHAPE §2.1 四段骨架，观察类没有「代价段」）。
 *
 * 逐段理由：
 * - `what`：动词 + 对象。
 * - `useWhen`：模型的路由信号 —— 它回答的是「组合到底产出了什么」，而不是
 *   「补丁文件里写了什么」。
 * - `boundary`：**一行**，承载从输出里搬出来的全部恒定知识：① 两种 dump 的退出码
 *   语义（`--dump-config` 恒 0、不能当门禁）；② 已知误报与判它的方法（看 `path`）。
 *   这两条都是「执行前必须知道、且从本次输出里学不到」的 —— 正是描述层该住的东西。
 */
export declare const DUMP_CONFIG_DESCRIPTION: ToolDescription;
/**
 * 造工具。
 *
 * @param deps 运行期依赖。
 */
export declare function createDumpConfigTool(deps: ToolDeps): ToolDefinition;
//# sourceMappingURL=dsh_dump_config.d.ts.map