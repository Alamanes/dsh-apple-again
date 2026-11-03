/**
 * `dsh --dump-config` / `--dump-config-schema` 的调用与解析。
 *
 * 三条实测结论决定了本文件的结构（0.2.1-alpha.2，本机 pid 34216，2026-10-12 实测）：
 *
 * 1. **`--dump-config` 退出码恒 0** —— 它不做 schema 校验，所以**不能当门禁**。
 *    但它仍然把组合期错写到 **stderr**（实测：`patch: name mismatch … skipping`）。
 *    → 结论「配置有没有坏」不能看退出码，要看 stderr + schema 的 diagnostics。
 * 2. **`--dump-config-schema` 退出码 1 = 有 error**；`diagnostics` 数组在它的 **stdout** 里
 *    （JSON 的 `diagnostics` 字段），每项形如 `{ level, path?, message }`。
 * 3. **`path` 是组合树里的位置，形如 `/181`** —— 它指的是组合结果里**第 N 个顶层条目**
 *    （1 起）。实测 `/181`→`agent-preset-registry`、`/182..184`→`preset-standard|ptc|minimal`，
 *    正是 SKILL §3.8 说的已知误报（`unrecognized Loader tree carrier` 落在 preset 行上）。
 *    所以「这个 error 是不是误报」**必须先把 path 解析成 entry id** 才能判。
 */
import type { SpawnImpl } from './exec.js';
/** `--dump-config` 的组合树里一个顶层条目。 */
export interface ComposedEntry {
    /** 1 起的序号 —— 与 diagnostics 的 `path`（`/N`）同一套编号。 */
    index: number;
    id: string;
    name?: string;
    disabled?: string;
    lineNumber: number;
}
/** schema dump 里的一条诊断。 */
export interface DumpDiagnostic {
    level: string;
    path?: string;
    message: string;
}
/** 诊断的分类：决定它值不值得模型动手。 */
export type DiagnosticClass = 
/** 真 error：指向的不是 preset 那种已知误报。 */
'error'
/** 已知误报：`unrecognized Loader tree carrier` 落在 preset 行上（SKILL §3.8）。 */
 | 'known-false-positive'
/** 组合期错：某个 patch 行被 `skipping` 整条丢弃 —— 这条**永远是真的**。 */
 | 'composition-error'
/** schema 投影期的 warning：不影响这次运行。 */
 | 'projection-warning';
/** 带分类的诊断。 */
export interface ClassifiedDiagnostic extends DumpDiagnostic {
    classification: DiagnosticClass;
    /** `path` 解析出的 entry id（解析得到时）。 */
    entryId?: string;
}
/** 一次 dump 调用的结果。 */
export interface DumpInvocation {
    flag: '--dump-config' | '--dump-config-schema';
    exitCode: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    aborted: boolean;
    spawnError?: string;
}
/** 怎么启动 dsh。 */
export interface DshLaunch {
    command: string;
    /** 放在用户参数之前的固定参数（例如 `bin.js` 的路径）。 */
    prefix: readonly string[];
}
/**
 * 推断「怎么再起一个 dsh 进程」。
 *
 * 优先复用**当前正在跑的宿主**的入口：本插件活在 dsh 进程里，`process.argv[1]`
 * 就是那个 `lib/bin.js`。用 `process.execPath` + 它，等于「用同一个 node 跑同一个 CLI」，
 * 不必依赖 PATH 上的 `dsh` 是 `.cmd` 还是 `.ps1`（Windows 上 `spawn` 不解析 `.cmd`，
 * 这条差异会让工具在别人机器上静默失效）。
 *
 * 退路是 PATH 上的 `dsh`。
 *
 * @param argv 进程参数，默认 `process.argv`。
 * @param execPath node 可执行文件路径，默认 `process.execPath`。
 */
export declare function resolveDshLaunch(argv?: readonly string[], execPath?: string): DshLaunch;
/**
 * 跑一次 dump。
 *
 * **不抛**：失败收敛成结果字段。
 *
 * @param launch 怎么启动 dsh。
 * @param profile profile 名。
 * @param flag 要跑哪个 dump。
 * @param deps 可注入的 spawn 与预算。
 */
export declare function runDump(launch: DshLaunch, profile: string, flag: DumpInvocation['flag'], deps: {
    spawn: SpawnImpl;
    timeoutMs: number;
    signal?: AbortSignal | undefined;
}): Promise<DumpInvocation>;
/**
 * 解析组合树里的顶层条目。
 *
 * **只数顶格（`- id:` 在行首）的行** —— 实测 diagnostics 的 `/N` 编号正是这一套
 * （`/181` ↔ 第 181 个顶格条目）。缩进的 `- id:` 属于嵌套 group，不计入。
 *
 * @param configText `--dump-config` 的 stdout。
 */
export declare function parseComposedEntries(configText: string): ComposedEntry[];
/**
 * 把 diagnostics 的 `path`（`/N`）解析成 entry id。
 *
 * @param path 形如 `/181`；`undefined` 或形状不符时返回 `undefined`。
 * @param entries 组合树条目。
 */
export declare function entryIdForPath(path: string | undefined, entries: readonly ComposedEntry[]): string | undefined;
/**
 * 从 schema dump 的 stdout 里取 `diagnostics` 数组。
 *
 * 该数组嵌在 schema JSON 的深处，所以按名字递归找。JSON 解析失败时返回空数组
 * （调用方会用 stderr 的文本行兜底，两条路都断了才算「没有诊断」）。
 *
 * @param schemaText `--dump-config-schema` 的 stdout。
 */
export declare function parseDiagnosticsFromSchemaText(schemaText: string): DumpDiagnostic[];
/**
 * 从 stderr 的文本行里取诊断。
 *
 * **两种形状都要认**（都是本机 0.2.1-alpha.2 实测出来的）：
 * - 带严重级：`dsh: error: [/181] unrecognized Loader tree carrier…`、
 *   `dsh: warning: patch: name mismatch …`（`--dump-config-schema` 的 stderr）；
 * - **不带严重级、只带来源**：`dsh: [C:\…\cordis.patch.yml] patch: name mismatch …, skipping`
 *   （`--dump-config` 的 stderr）。
 *
 * 第二种是本条兜底存在的**唯一**理由：SKILL §3.8 说 `--dump-config` 不做 schema 校验、
 * 退出码恒 0，所以「配置坏没坏」在那条命令上**只有 stderr 能回答**。只认第一种形状
 * 会把组合期错整条漏掉 —— 而它恰恰是「插件装了却没启用」的第一类原因。
 *
 * @param stderr 进程的 stderr。
 */
export declare function parseDiagnosticsFromStderr(stderr: string): DumpDiagnostic[];
/**
 * 给一条诊断分类，并把 `path` 解析成 entry id。
 *
 * 判定顺序是有意的：**组合期错优先**（它永远是真的，且会让一整行消失），
 * 然后才是 preset 的已知误报。
 *
 * @param diagnostic 一条诊断。
 * @param entries 组合树条目（用于解析 path）。
 */
export declare function classifyDiagnostic(diagnostic: DumpDiagnostic, entries: readonly ComposedEntry[]): ClassifiedDiagnostic;
//# sourceMappingURL=dump.d.ts.map