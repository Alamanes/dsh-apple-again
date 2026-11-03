/**
 * 热重载的**机制层** —— 按 [ARCHITECTURE.md](../../docs/ARCHITECTURE.md) §5 记的 8 步算法，顺序即判据（真机证据见 [HOST-CONTRACTS.md](../../docs/HOST-CONTRACTS.md) §1）。
 *
 * ## 为什么单独一层，且不 import Cordis
 *
 * 与 `lib/loader.ts` 同一个理由：算法要能**脱离宿主单测**。所以这里定义一组**端口**
 * （`ReloadHost` / `ReloadEntryPort` / `ClosurePort`），算法只调端口；真实实现在
 * `reloadHostFrom(ctx)` 里用**结构化访问**绑上宿主对象（不 import Cordis）。
 * 单测喂假端口，于是「import 期失败时一次都没 dispose」这种断言可以直接写。
 *
 * ## 顺序就是判据（§2.1 / §6.6）
 *
 * ```
 * 定位 entry → 提取本地闭包 → 备份缓存 → 只清那批 → 先 import →
 * 再 dispose 旧 fiber → 挂载新的 → 失败分支
 * ```
 *
 * **「先 import 后 dispose」不许调换**：真机实验A 里 import 期失败那条路径的步骤序列中
 * **根本没有 dispose-old**，这正是「旧 fiber 从未被碰过」的原因（§6.6 判据 1）。
 * 代码里因此把 import 单独放在 dispose **之前**的 try 块里，而不是包在一起。
 *
 * ## 三条已实测的实现陷阱（§6.6 T1–T4）
 *
 * - **T1**：`internal.loadCache` 的 ctor 是 `LoadCache`、**`instanceof Map === false`**
 *   （原型链 `[LoadCache, SafeMap]`，所在 realm 与插件不同）。所以这里**只调缓存对象自己的**
 *   `get` / `set` / `delete`，**不碰 `Map.prototype`** —— 参考实现那手
 *   `Map.prototype.delete.call` 在本机未必成立。
 * - **T2**：`internal.resolveSync` 对 **URL 形式**的 name 会失败（报 `Cannot find package 'undefined'`）
 *   → 先判 `file://`，再回落 `new URL(name, baseUrl)`。
 * - **T4**：entry 匹配要**两个字段都试 + URL 归一** —— `entry.id` 实际是 `include:<id>`，
 *   `entry.options.name` 是 `file://` URL。只比 id 会得到**假阴性**（看着像「树里没有这个 entry」）。
 *
 * ## 边界（§2.2，必须由输出说清）
 *
 * 插件在 cordis 之外拿的裸资源（`setInterval` / 裸 socket / `process.on` / 文件句柄 / worker）
 * **不归 effect 管，dispose 旧 fiber 不会释放 → 静默泄漏**。工具无法检测它们，
 * 所以只在**描述层的边界段**明说一次（SHAPE §2：恒定知识写一次，不进每次输出）。
 *
 * ## v1.1 契约迁移（SHAPE §4.1）
 *
 * 旧契约里每条失败带 `message` + `hint`（散文建议）。现在 `hint` 删了，它拆成两处：
 * - `message` **不变**：这次**操作**为什么没做成（操作视角），进 `error.message`；
 * - `verdict`（新）：**结论**（世界视角），进 `data.verdict`，就是模型读到的 L1。
 *
 * 所以本文件里每条失败都必须写一句实质 `verdict` —— 模型看不到 `error.message`
 * （渲染不打印它），失败的「所以呢」只能由 `verdict` 承载。
 */
import { type ToolResult } from './errors.js';
/** 定位 entry 的三种方式（§2.3；三者择一）。 */
export type ReloadTargetKind = 'entryId' | 'module' | 'serverName';
/** 已定出来的目标。 */
export interface ReloadTarget {
    kind: ReloadTargetKind;
    value: string;
}
/** 工具参数（`dryRun` 不参与定位）。 */
export interface ReloadArgs {
    entryId?: string;
    module?: string;
    serverName?: string;
    dryRun?: boolean;
}
/** 目标的**解析**结果：要么定出一个，要么是一条可直接返回的失败说明。 */
export interface TargetParse {
    target?: ReloadTarget;
    failure?: ReloadFailure;
}
/** 失败原因：**机制层自己的闭枚举**，与工具的 `ToolErrorKind` 解耦（工具负责映射）。 */
export type ReloadFailureReason = 'bad-target' | 'no-match' | 'ambiguous' | 'no-internal' | 'not-reloadable' | 'import-failed' | 'apply-failed' | 'cancelled' | 'timeout';
/**
 * 一条失败。
 *
 * 两个字段角色不同，**不是同一句的两个副本**（SHAPE §4.1 的字段角色表）：
 * - `message` = **这次操作**为什么没做成（操作视角）→ `error.message`；
 * - `verdict` = **结论**（世界视角）→ `data.verdict`，也就是模型读到的 L1。
 *
 * 两者都必须英文（B14 扫 `src/**`）。`verdict` 必须**实质**：只写 `failed` 等于
 * 让模型只看得到头行的 `failed (<kind>)`。
 */
export interface ReloadFailure {
    reason: ReloadFailureReason;
    message: string;
    verdict: string;
}
/**
 * 一个模块缓存端口。
 *
 * ## 为什么不是 `get/set/delete`（这是真机红的根因，已确证到行）
 *
 * Node 24 的 `LoadCache` 不是普通 Map —— 它的**每个方法都多一个 `type` 参数**，
 * 且第二个参数**必须是字符串**（实测 `internal/modules/esm/module_map` 的原函数体）：
 *
 * ```js
 * get(url, type = kImplicitTypeAttribute) { validateString(type, 'type'); return super.get(url)?.[type] }
 * set(url, type = kImplicitTypeAttribute, job) { validateString(type, 'type'); cachedJobsForUrl[type] = job; … }
 * delete(url, type = kImplicitTypeAttribute) { const cached = super.get(url); if (cached) cached[type] = undefined }
 * ```
 *
 * 所以 `set(url, slot)` 会把 **job 当成 type** 传进去 → `validateString` 抛
 * `The "type" argument must be of type string. Received an instance of ModuleJob`。
 * 这正是真机上 import 期失败被吞成 `internal` 的原因：回滚缓存那一步自己先炸了。
 *
 * → 端口因此**按语义**定义（读回 / 放回 / 清掉），把「type 是什么」留给适配层去发现与**验证**
 * （`write` 返回是否成功，是**真的回读校验过**，不是「我调过了」）。
 */
export interface ModuleCachePort {
    /**
     * 读一个 URL 上现存的全部 job（真机上是 `{ javascript: ModuleJob }` 那个槽里的值）。
     *
     * **绝不抛**：读不到就返回空数组。
     */
    read(url: string): unknown[];
    /**
     * 把一条 job 放回该 URL。
     *
     * **绝不抛**，且必须**回读验证**再返回 `true` —— 返回 `false` 表示这条没放回去，
     * 调用方据此把「回滚没走完」如实说出去，而不是假装成功。
     */
    write(url: string, job: unknown): boolean;
    /** 让该 URL 上的缓存失效。**绝不抛**。 */
    clear(url: string): void;
}
/** 闭包遍历还需要「这个 URL 的子模块是谁」。 */
export interface ClosurePort extends ModuleCachePort {
    children(url: string): Promise<string[]>;
}
/**
 * 目标 entry 的句柄 —— 算法只通过这些原语碰树。
 *
 * 把 dispose / mount / rollback 拆成独立方法（而不是一个 `swap()`）是**有意的**：
 * 只有拆开，「import 期失败时没有调用过 dispose」才是一条可断言的判据。
 */
export interface ReloadEntryPort {
    readonly entryId: string;
    /** `entry.options.name`（真机上通常是 `file://` URL）。 */
    readonly moduleName: string;
    /** `entry.options.config.serverName`（MCP 行才有）。 */
    readonly serverName?: string;
    /** `entry.fiber !== undefined`。为假 = import 期就没起来。 */
    readonly hasFiber: boolean;
    /** 旧 runtime 的 fiber 个数（`hasFiber` 为假时是 0）。 */
    readonly oldFiberCount: number;
    /** 当前相位（观测用，取不到就是 undefined）。 */
    readonly fiberState?: number;
    /** 模块名能不能热重载：空、或 `cordis:` 前缀不行。 */
    readonly reloadable: boolean;
    /** 第 6 步：dispose 旧 fiber。 */
    disposeOld(): Promise<void>;
    /** 第 7 步：用新插件值挂载。apply 期抛错要冒到这里。 */
    mountFresh(plugin: unknown): Promise<void>;
    /** 回滚：摘掉刚挂上的新 fiber。 */
    removeFresh(): Promise<void>;
    /** 回滚：把**旧插件值**重新实例化。 */
    remountOld(): Promise<void>;
    /** `entry.fiber === undefined` 那条路径：清完缓存后重新 init。 */
    refresh(): Promise<void>;
}
/** 宿主侧全部能力（真实实现在 `reloadHostFrom`）。 */
export interface ReloadHost {
    /** T1：`loader.internal` 是否可用。 */
    internalAvailable(): boolean;
    /** 模块缓存端口；`internal` 缺失时返回 `undefined`。 */
    cache(): ClosurePort | undefined;
    /** 按 URL 解析 entry 的模块（T2）。 */
    resolveEntryUrl(entry: ReloadEntryPort): Promise<string>;
    /** 第 5 步：`loader.import` + `unwrapExports`。 */
    importFresh(url: string): Promise<unknown>;
    /** 树里**全部**候选 entry（匹配含 T4 的两个字段 + URL 归一）。 */
    candidates(): ReloadEntryPort[];
}
/** 闭包里最多列几个 URL（输出会进模型上下文，长列表是纯噪音）。 */
export declare const MAX_LISTED_MODULES = 40;
/** 子串兜底匹配的最小长度：太短会匹配到一屏东西。 */
export declare const MIN_SUBSTRING_MATCH = 3;
/**
 * 把工具参数解析成**恰好一个**目标。
 *
 * 不给、或给多于一者都**不猜** —— 返回一条结构化失败。猜的代价是重载错的插件，
 * 那是写侧工具最不能接受的一种失败（树被改坏且模型以为成功）。
 *
 * @param args 工具参数。
 */
export declare function parseReloadTarget(args: ReloadArgs): TargetParse;
/**
 * 归一化一个匹配键：小写，并把 `-` / `_` / `.` 视为同一分隔符。
 *
 * @param value 原始键。
 */
export declare function normalizeKey(value: string): string;
/**
 * 去掉 loader 的分组前缀（`include:` / `cordis:` …）。
 *
 * @param id 原始 entry id。
 */
export declare function bareId(id: string): string;
/**
 * 从一个模块名里抽出「用户嘴里的那个包名」。
 *
 * `entry.options.name` 在真机上是 `file://` URL，所以要能从中回推：
 * URL 末段（去扩展名）、以及 `node_modules/` 边界后的包名（scoped 名要连上 scope）。
 *
 * @param moduleName `entry.options.name`。
 */
export declare function moduleKeys(moduleName: string): string[];
/**
 * 一个 entry 的全部候选匹配键（T4）。
 *
 * `entryId` 走 {@link bareId}，模块名走 {@link moduleKeys} —— 两个字段都进集合，
 * 所以「按 id 查」「按包名查」「按 name 查」都能命中同一个 entry。
 *
 * @param entry 目标 entry。
 */
export declare function candidateKeys(entry: ReloadEntryPort): string[];
/** 匹配结果：命中列表（0 / 1 / 多个都要能让调用方分辨）。 */
export interface MatchOutcome {
    /** 精确命中的 entry。 */
    exact: ReloadEntryPort[];
    /** 没有精确命中时的子串命中。 */
    loose: ReloadEntryPort[];
}
/**
 * 在候选里找目标。
 *
 * 两轮：先**精确**（归一化后相等），再**子串**（≥3 字符）。分开是为了让
 * 「精确唯一命中」不受子串噪音影响 —— 否则一个短包名会把无关 entry 拖进来。
 *
 * **归一放在这里**（而不是只放在 `parseReloadTarget`）：机制层可能被直接调用
 * （测试、将来别的入口），而「`include:<id>` 匹配不上」是个**假阴性** ——
 * 看着像「树里没有这个 entry」。两边都归一，从哪个入口进来都一样。
 *
 * @param entries 全部候选。
 * @param target 目标。
 */
export declare function matchEntries(entries: readonly ReloadEntryPort[], target: ReloadTarget): MatchOutcome;
/** 一行候选描述（用于「没命中 / 多个命中」的 message）。 */
export declare function describeCandidate(entry: ReloadEntryPort): string;
/**
 * 收集要一起重新求值的**本地**模块闭包（§2.1 第 2 步）。
 *
 * 只收 entry 自己那一份：有 `node_modules/<pkg>` 边界时只留该包下的，
 * 否则丢掉任何 `node_modules` 子树 —— 依赖不会因为插件自己的代码改动而变，
 * 但清掉它们会把无关插件一起拖进来（§2.1 第 4 步的「不清整棵树」）。
 *
 * `node:` 内置模块永远跳过。
 *
 * @param cache 模块缓存端口。
 * @param entryUrl entry 的模块 URL。
 */
export declare function collectClosure(cache: ClosurePort, entryUrl: string): Promise<string[]>;
/**
 * 一条 URL 所属包的根目录（`node_modules/<name>` 边界，含 scoped 名）。
 *
 * @param url 模块 URL。
 */
export declare function packageRootOf(url: string): string | undefined;
/** 缓存备份：**回滚的唯一依据**（§2.1 第 3 步）。 */
export interface CacheBackup {
    /** 每个 URL + 它在缓存里现存的 job（真机上一个 URL 通常只有一条）。 */
    entries: Array<{
        url: string;
        jobs: unknown[];
    }>;
}
/**
 * 备份并清除这批 URL 的缓存项（§2.1 第 3–4 步，合并成一次遍历）。
 *
 * 只碰传入的这批 —— 「清多了会把无关插件一起拖进来」。
 *
 * @param cache 模块缓存端口。
 * @param urls 闭包里的 URL。
 */
export declare function backupAndClear(cache: ModuleCachePort, urls: readonly string[]): CacheBackup;
/**
 * 把备份放回缓存（import 期失败 / apply 期回滚都走它）。
 *
 * **绝不抛**，并如实返回「是不是全部放回去了」：
 * 这条路径本身跑在失败处理里，它再抛就会把**真正的原因**盖掉
 * （真机上就是这么把一个 import 语法错变成了 `internal` + Node 内部文案）。
 *
 * @param cache 模块缓存端口。
 * @param backup 备份。
 * @returns 是否**每一条都**成功放回。
 */
export declare function restoreCache(cache: ModuleCachePort, backup: CacheBackup): boolean;
/**
 * 重载成功后落进工具 `data` 的**机制报告**。
 *
 * 它是 `key` / `audit` 两种投影的共同原料（工具层负责切），所以这里字段齐全。
 * **没有 `why`**：旧契约里那句话是「这次会怎么走」的解释，而新契约把它拆成两处 ——
 * 恒定知识（cordis 外资源会泄漏）进描述层边界段写一次，本次特有的动作进 `nextStep.why`。
 * 留一个没有消费者的字段就是「一处两事实」。
 */
export interface ReloadData {
    target: ReloadTarget;
    entry: {
        entryId: string;
        moduleName: string;
        serverName?: string;
    };
    dryRun: boolean;
    moduleUrl: string;
    /** 闭包里的模块数。 */
    moduleCount: number;
    /** 实际被清出缓存的条数（备份里有多少条）。 */
    modulesCleared: number;
    /** 闭包 URL（**只列前 {@link MAX_LISTED_MODULES} 条**）。 */
    modules: string[];
    modulesTruncated: boolean;
    /** 旧 fiber 有没有被碰过 —— import 期失败分支的核心判据。 */
    oldFiberTouched: boolean;
    oldFiberCount: number;
    oldFiberState: number | null;
    newFiberState: number | null;
    rolledBack: boolean;
    /** 结论（L1）。 */
    verdict: string;
}
/**
 * `data.key` 的投影（L2）：**下一个决定可能要用到的**原料。
 *
 * 判据是 SHAPE §5 那句「模型看不到它，会不会做出不同的下一步？」——
 * 对写侧工具就是这三件：换的是哪个 entry、清了几格缓存、**要不要收拾**
 * （`oldFiberTouched` / `rolledBack`）。
 *
 * 字段**可缺省**是有意的：失败可能在「还没定出 entry」时就发生（`no-match` / 多目标），
 * 那时 key 是 `{}` —— 不许拿默认值（`rolledBack: false` 之类）去冒充「事实是安全的」。
 */
export interface ReloadKey {
    entry?: {
        entryId: string;
        moduleName: string;
        serverName?: string;
    };
    dryRun?: boolean;
    moduleUrl?: string;
    moduleCount?: number;
    modulesCleared?: number;
    oldFiberTouched?: boolean;
    oldFiberCount?: number;
    oldFiberState?: number | null;
    newFiberState?: number | null;
    rolledBack?: boolean;
}
/** 机制层的返回：要么报告，要么一条失败（失败也可带部分报告，供排查）。 */
export type ReloadOutcome = {
    ok: true;
    data: ReloadData;
} | {
    ok: false;
    failure: ReloadFailure;
    data?: Partial<ReloadData>;
};
/** 一次调用的外部约束。 */
export interface ReloadRunOptions {
    dryRun: boolean;
    signal?: AbortSignal | undefined;
    /** 截止判据（沿用 `lib/timeouts.ts` 的 `createDeadline`）。 */
    expired: () => boolean;
}
/**
 * 跑完 8 步算法。
 *
 * **绝不抛**：任何异常都在这里收敛成 `ok: false`。写侧工具抛异常最糟 ——
 * 树可能已经被改了一半，而调用方只看到一条栈。
 *
 * @param host 宿主侧能力。
 * @param target 目标。
 * @param options 外部约束。
 */
export declare function hotReload(host: ReloadHost, target: ReloadTarget, options: ReloadRunOptions): Promise<ReloadOutcome>;
/**
 * 信号是否已取消。
 *
 * @param signal 调用方信号。
 */
/**

/**
 * 把机制的失败原因映射成工具的闭枚举 `kind`。
 *
 * 映射集中一处，是为了让「机制层不知道工具的 kind 集合」这条分层成立，
 * 同时 `kind` 的选择仍然只有一个落点可审。
 *
 * @param reason 机制层原因。
 */
export declare function kindForReason(reason: ReloadFailureReason): 'not-found' | 'not-configured' | 'cancelled' | 'timeout' | 'reload-failed';
/**
 * 把机制层结果转成工具结果（含 `nextStep`）。
 *
 * `data` 顶层恰好三键，**成功与失败同形**（B21）：
 * - `verdict` ← `failure.verdict`（失败）或 `outcome.data.verdict`（成功）；
 * - `key`     ← 要模型决策的原料（`ReloadKey`）；
 * - `audit`   ← 其余（给人复核，不进模型文本）。
 *
 * @param outcome 机制层结果。
 */
export declare function outcomeToToolResult(outcome: ReloadOutcome): ToolResult<ReloadKey>;
/**
 * 把任意异常收敛成工具失败（兜底分支用，保证 `execute` 绝不抛）。
 *
 * 这条兜底是**唯一**允许产出 `internal` 的路径（B24 用它证明「异常不会漏出去」）。
 * 它必须给出实质 `verdict`：模型看不到 `error.message`，只看到这一行 ——
 * 而这里的诚实答案恰恰是「我不知道走到哪一步了」（本模块的算法正常路径绝不抛，
 * 所以一旦抛出来，说明是本插件自己的 bug，树有多少被改动**无法从这个错误推断**）。
 *
 * `key` 是 `{}`：**没有任何可靠的可供决策的观测** —— 不拿 `rolledBack: false`
 * 之类的默认值冒充「树是安全的」。
 *
 * @param error 捕获到的异常。
 */
export declare function reloadInternalFailure(error: unknown): ToolResult<ReloadKey>;
/**
 * 把活的宿主 `ctx` 绑成一个 {@link ReloadHost}。
 *
 * 与 `loaderFrom` 同一个范式：**只做结构化访问、不 import Cordis**，
 * 于是本文件可以脱离宿主单测，而真实实现只在这里绑一次。
 *
 * @param ctx 宿主上下文。
 */
export declare function reloadHostFrom(ctx: unknown): ReloadHost;
//# sourceMappingURL=hot-reload.d.ts.map