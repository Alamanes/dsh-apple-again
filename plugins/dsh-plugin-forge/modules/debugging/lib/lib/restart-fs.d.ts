/**
 * `RestartFsPort` 的**宿主实现** —— 走宿主的 `ctx.fs` 服务，**不碰 `node:fs`**。
 *
 * ## 为什么必须走宿主服务（`task-28` 实测的阻断 + `task-31` 实测的解法）
 *
 * 红线 B10 里有两半：`judgeFsWriteUsage`（**来源**判据：src/ 里用没用 `node:fs` 写 API）与
 * `judgeHostDataWrites`（**路径**判据）。维护者拍板的「`$DSH_HOME/<包名>/` 可写」（形态 A）
 * 只放宽了**路径**那一半 —— `task-28` 用探针实测过：`src/` 里只要 import 了 `node:fs` 的写 API，
 * **即使路径首段逐字等于包名，B10 照样判红**。⇒ 真实适配器不能落在本仓自己身上。
 *
 * 解法不是放宽红线，而是**换写的人**：宿主的 `ctx.fs` 服务（`@deepseek-ai/dsh-fs` 的
 * `FileSystem`，注册名就是 `fs`）在写。这与本仓既有的 `ctx.get('spillStore')` 同族 ——
 * 「宿主在写」，所以不经 B10 的来源判据。
 *
 * ## `task-31` 的真机实测（隔离 bench、web profile 默认档、`0.2.1-alpha.2`）
 *
 * | 实测 | 读数 |
 * |---|---|
 * | 本插件这一层（根层兄弟行）`ctx.get('fs')` | **可达**，但 **apply 期拿不到**（`undefined`）→ **+1s** 才拿到 ⇒ **每次现取、不缓存** |
 * | 负对照 `ctx.fs` 直取属性 | **抛** `cannot get property "fs" without inject`（判据不恒真） |
 * | 实例 | `ctor = SandboxedFileSystem`、`sandboxMode = 'workspace-write'` |
 * | 写 `$DSH_HOME/<包名>/restart/…`（**不带** sandboxPolicy） | ❌ `FS_SANDBOX_DENIED`（workspace-write 的根是会话 cwd + 临时目录，`$DSH_HOME` 不在里面） |
 * | 同一个写（**显式** `{mode:'danger-full-access', workspaceRoot}`） | ✅ 成功（`operation: 'create'`），读回逐字相符 |
 * | 读一个不存在的文件 | 抛 `FsError`，`code = 'FS_NOT_FOUND'` |
 * | `stat` 一个不存在的目标 | 返回 `undefined` |
 * | 服务方法面 | `resolve` / `stat` / `lstat` / `readText` / `writeText` / `editText` / `listDir` / `contains` / `processPath` / `fileUrl` |
 * | 有没有删除 | **没有** —— `delete` / `remove` / `unlink` / `rm` / `rmdir` 一个都不是函数（`task-32` 据此把端口里的 `remove` 整个去掉了） |
 * | 缺父目录时写 | 后端自己 `mkdir -p`（`writeFileAtomic` 的文档原话：missing parent directories are created）⇒ **本层不需要、也没有 mkdir** |
 *
 * ## ⚠️ 一处**更正**（`task-32` 的第二支探针实测，推翻了 `task-31` 的推断）
 *
 * `task-31` 我报过「不带 `expected` 时 `writeText` 走 `createIfAbsent`，文件已存在会抛
 * `FS_NOT_OBSERVED`」——**那是错的**。真机连测四步（同一路径）：
 *
 * | 步骤 | 读数 |
 * |---|---|
 * | ① 不带 `expected`，文件**不存在** | ✅ `operation: 'create'` |
 * | ② 不带 `expected`，文件**已存在** | ✅ **`operation: 'update'`** —— 无条件覆盖，**不抛** |
 * | ③ 显式 `{kind:'createIfAbsent'}`，文件已存在 | ❌ `FS_NOT_OBSERVED`（后端**自己的** no-replace 守卫） |
 * | ④ 先读一次、再显式 `createIfAbsent` | ❌ **仍然** `FS_NOT_OBSERVED`（`createIfAbsent` 的语义就是「不许覆盖」，与观察无关） |
 *
 * 结论：**省略 `expected` 就是「无条件 create-or-overwrite」**（与 `dsh-fs` 的 `types.d.ts`
 * 原话一致：「Omitting the intent from `writeText` means unconditional create-or-overwrite」）。
 * `FS_NOT_OBSERVED` 只会由**显式传了 `createIfAbsent`** 的一方引来 —— 那个 intent 是
 * `dsh-tool-fs` 经 `fs/write-intent` waterfall 算出来的；**本插件直接调 `ctx.fs`，不走那条路**。
 * ⇒ marker 的改写（含「消费」那次）天然是幂等的，**不需要预先读一次**。
 *
 * 但本层仍然**防一手**（不是白防）：万一将来换成一个「要求先观察过」的后端，
 * {@link createRestartFsPort} 会在 `FS_NOT_OBSERVED` 上**读一次再重试同一次无条件写**；
 * 重试仍失败就**原样抛出**（绝不吞成「写成功」）。
 *
 * ⚠️ **沙箱策略由调用方给**：本层把 {@link RestartFsOptions.sandboxPolicy} **原样透传**给
 * `writeText` 的第五个参数。**默认不替调用方决定**（省略 = 用宿主自己 resolve 的档位），
 * 因为「用什么档位写」是一次**审批语义**的决策，属于 `task-30` 的壳，不属于这一层。
 *
 * ## 三值纪律（本层最要紧的一条）
 *
 * `absent`（文件不在）与 `unreadable`（读不到 / 服务不在 / 其它 IO 错）**绝不许合并**：
 * 前者是「没有待恢复的 marker」，后者是「不知道有没有」—— 合并就是「把取不到印成没有」，
 * 于是一次本该恢复的重启被静默跳过。所以本层**只认** `FS_NOT_FOUND` 是 `absent`，
 * **其余一切**（`FS_PERMISSION_DENIED` / `FS_SANDBOX_DENIED` / `FS_IO_ERROR` / 形状不认识……）
 * 一律 `unreadable`，且把原始 `code` 带进 `reason`。
 */
import type { RestartFsPort } from './restart.js';
/**
 * 宿主 `fs` 服务的**最小结构面**。
 *
 * 刻意**不** import `@deepseek-ai/dsh-fs`：那是宿主安装树里的包，从本仓的解析上下文
 * 拿不到（本仓活跃坑 19 的同族：profile 的 `node_modules` 里没有宿主内层包）。
 * 结构化访问 + 只声明本层真正用到的方法，宿主换版本时表现为降级而不是崩。
 */
export interface HostFsLike {
    /** 把路径解析成稳定目标；可能做 IO（所以是异步）。 */
    resolve(path: string): Promise<unknown>;
    /** 读整个文本文件；不存在时抛 `FS_NOT_FOUND`。 */
    readText(target: unknown, signal?: AbortSignal): Promise<string>;
    /** 原子写；`sandboxPolicy` 是**每次调用**的沙箱档位。 */
    writeText(target: unknown, content: string, expected?: unknown, signal?: AbortSignal, sandboxPolicy?: unknown): Promise<unknown>;
}
/** 本层需要的上下文面（`ctx.get` 在单测替身里可能不存在）。 */
export interface ContextLike {
    get?: (name: string) => unknown;
}
/** `createRestartFsPort` 的选项。 */
export interface RestartFsOptions {
    /**
     * 逐次透传给宿主 `writeText` 的沙箱策略。
     *
     * **省略 = 用宿主自己 resolve 的档位**（在 `workspace-write` 的 profile 下，
     * 写 `$DSH_HOME` 会被 `FS_SANDBOX_DENIED` 拒掉 —— 这是**实测**，不是推测）。
     * 「要不要提档、提档怎么征得用户同意」是审批语义，由 `task-30` 的壳决定。
     */
    sandboxPolicy?: unknown;
}
/**
 * 宿主 `fs` 服务**不可用**的原因；可用时返回 `undefined`。
 *
 * 给上层一个**早失败**的口子：`undefined` 之外的任何值都意味着「这次一定读不到 marker」，
 * 上层据此给结构化失败（`not-configured` 一类），而**不是**静默当成「没有 marker」。
 *
 * @param ctx 宿主上下文。
 */
export declare function hostFsUnavailableReason(ctx: ContextLike): string | undefined;
/**
 * 造一个走宿主 `ctx.fs` 的 {@link RestartFsPort}。
 *
 * **每次调用现取服务**（apply 期拿不到，实测见文件头）—— 不缓存、不闭包捕获实例。
 *
 * 路径**一律作为实参进来**：本层不构造任何路径，落点的唯一出处是
 * `src/lib/restart.ts` 的 `restartMarkerPath`（「一处一事实」）。
 *
 * @param ctx 宿主上下文。
 * @param options 选项（目前只有沙箱策略透传）。
 */
export declare function createRestartFsPort(ctx: ContextLike, options?: RestartFsOptions): RestartFsPort;
//# sourceMappingURL=restart-fs.d.ts.map