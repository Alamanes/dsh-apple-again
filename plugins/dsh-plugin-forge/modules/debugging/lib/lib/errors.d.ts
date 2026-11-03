/**
 * 工具结果的错误契约（`src/tools/**` 与 `test/tools/**` 共享，不含 IO）。
 *
 * 形状（SHAPE §4.1 冻结，改它要同时改 `docs/SHAPE.md` 与五个工具）：
 * - 成功：`{ ok: true, data: { verdict, key, audit }, nextStep? }`
 * - 预期内失败：`{ ok: false, error: { kind, message }, data: { verdict, key, audit }, nextStep? }`
 *
 * 与旧契约的三处差别（2026-10-13 拍板，一次改干净、不留兼容层）：
 * 1. **`error.hint` 删了**：它的内容只有两种归宿，两种都已经有家 ——
 *    恒定知识 → 描述层边界段（写一次）；具体动作 → `nextStep`。留着就是给模型两个权威去分辨。
 * 2. **`error.evidence` 并进 `data`**：失败分支的 `data` 就是原来的 evidence
 *    —— 「这次看到了什么」只该有一个槽，两分支同形。
 * 3. **`nextStep` 必须带动作**：`{ tool, args?, why }` 或 `{ manual: true, why }`。
 *    「裸结论伪装成下一步」（旧形状 `nextStep: — <why>`）从此在类型上写不出来。
 *
 * 为什么 `kind` 必须是**闭枚举**：它是模型唯一可靠的判据 ——
 * 「重试同一个调用」对 `timeout` 成立、对 `not-running` 是白费、对 `cancelled` 是错的。
 * `message` 给人看，会随版本变；`kind` 给机器判，必须是稳定集合。
 */
/** 闭枚举：每个 kind 对应一种「模型该采取不同动作」的失败。 */
export declare const TOOL_ERROR_KINDS: readonly ["not-running", "auth", "not-found", "not-configured", "timeout", "command-failed", "cancelled", "reload-failed", "internal"];
/** 闭枚举的成员类型。 */
export type ToolErrorKind = (typeof TOOL_ERROR_KINDS)[number];
/** 可无损落 JSON 的值（工具返回值必须在这个集合内）。 */
export type JsonValue = null | boolean | number | string | JsonValue[] | {
    [key: string]: JsonValue;
};
/**
 * 下一步建议（决策 T19：不靠模型背历史）。
 *
 * **必须带动作**，两支恰有其一（B18a 就是断言这条）。为什么要有 `manual` 支：
 * 「必须带动作」只有在动作**可分派**时才可机械断言，而「重建客户端后刷新页面」这类
 * 没有工具可调 —— 它需要一个显式出口。代价是多一个字段，收益是「裸结论伪装成下一步」
 * 在类型上写不出来。
 */
export type NextStep = {
    /** 建议调用的工具名（本插件的或宿主自己的都行）。非空字符串。 */
    tool: string;
    /** 建议传入的参数。 */
    args?: JsonValue;
    /** 为什么建议这一步 —— 模型真正读的是这句。 */
    why: string;
} | {
    /** 这一步没有工具可调，要用户自己做一个工具做不到的动作。 */
    manual: true;
    /** 为什么建议这一步 —— 模型真正读的是这句。 */
    why: string;
};
/**
 * 结构化错误：机器码决定要不要重试；`message` 只写**事实一句话**（不写建议）。
 *
 * ## `message` 与 `data.verdict` 的分工（不是同一句的两个副本，也不许互抄）
 *
 * - `message` = **这次操作**为什么没做成（操作视角），由守卫或 {@link toToolError} 产生；
 * - `data.verdict` = **结论**（世界视角），就是模型读到的 L1。
 *
 * 冻结的渲染格式（SHAPE §3.1）里**没有** `message:` 行，这是有意的：模型要的是结论，
 * 操作层面的失败措辞留在结构化值里（会话日志）给人复核。**所以留着它不是漏渲染。**
 */
export interface ToolError {
    kind: ToolErrorKind;
    message: string;
}
/**
 * 工具 `data` 的外层形状（**三层输出的唯一记录**，所有工具共享）。
 *
 * - `verdict`：一句话结论（L1），**必填非空**。成功失败都有 —— 失败分支因此也有判定行。
 * - `key`：下一个决定可能要用到的投影（L2）。判据见 SHAPE §5：
 *   **模型看不到它，会不会做出不同的下一步？**
 * - `audit`：给人复核的部分（不进模型文本）。**可以为 `{}`**。
 *
 * 顶层**恰好这三个键**（B21 断言这条；`ensureToolResult` 与它同意同一套规则）。
 * 工具特有的字段一律塞进 `key` 或 `audit`，不许加第四个顶层键。
 */
export interface ToolData<T> {
    verdict: string;
    key: T;
    audit: JsonValue;
}
/** 成功结果。 */
export interface ToolOk<T> {
    ok: true;
    data: ToolData<T>;
    nextStep?: NextStep;
}
/**
 * 失败结果（**预期内**失败；意外由兜底分支转成 `internal`）。
 *
 * `data` 与成功分支**同形且必填**：它装的就是「失败时观测到的事实」（旧契约的 `evidence`）。
 * 代价是连「还没开工就失败」也要给一句 `verdict`；收益是失败分支从此也有 L1。
 *
 * 什么时候用它有一条规则：**`ok` 只描述「工具这次操作有没有完成」，不描述系统健不健康**。
 * 「诊断成功、只是结论是坏消息」应当走 `ok: true` + `data`（`verdict` 承载结论）；
 * 只有「操作没完成、但看到了值得留下的事实」才走 `ok: false`。
 */
export interface ToolFail<T = unknown> {
    ok: false;
    error: ToolError;
    data: ToolData<T>;
    nextStep?: NextStep;
}
/** 工具的统一返回形状。 */
export type ToolResult<T> = ToolOk<T> | ToolFail<T>;
/**
 * 校验一个候选返回值是否符合 §4.1 的形状表。
 *
 * 返回 `undefined` = 合规；返回一句话 = 违规原因（用于合成 `internal` 失败的 `verdict`）。
 *
 * 为什么要单独一个函数：**渲染层与守卫层必须同意同一套规则**（SHAPE §4.1 的
 * 「红线的一致性要求」）。一处放宽、另一处收紧就会出现「红线绿但模型收到坏形状」。
 * 形状判据因此只写在这里一份：`ensureToolResult` 用它决定要不要换掉返回值，
 * `render` 用它决定要不要退化成一行原始 JSON。
 *
 * 判据是**两段**：§4.1 的形状表，**加上**「可无损落 JSON」（`jsonValueProblem`）。
 * 后者是宿主边界的一条硬要求，而形状表照不到它 —— `data.key` 里挂一个 `undefined`
 * 在形状上完全合法，放行的代价却是宿主侧的一次硬失败（模型拿不到 `verdict` / `key` / `audit`）。
 *
 * @param value 工具的候选返回值。
 */
export declare function toolResultProblem(value: unknown): string | undefined;
/**
 * 「这个工具结果**可无损落 JSON**吗」—— 第一条违规（宿主 `walkJsonValue` 的四条判据）。
 *
 * ## 判据逐字来自宿主（`@deepseek-ai/dsh-util-values` 的 `walkJsonValue`）
 *
 * 1. `undefined` / 函数 / symbol / bigint —— `typeof current !== 'object'` 且不是合法标量；
 * 2. 非有限数：`!Number.isFinite(v)` **或** `Object.is(v, -0)` —— 宿主的判据原话是
 *    「lossless finite JSON number, excluding negative zero」（**负零也不行**）；
 * 3. 循环引用（`ancestors.has(current)`）；
 * 4. symbol 键或不可枚举自有属性 —— 活的类实例（`Error` / `AbortSignal` / `Map` 等）也中招。
 *
 * ## 为什么这道闸住在**我们这一侧**（2026-10-13）
 *
 * 宿主把返回值丢给 `dsh-tools` 的 `snapshotToolValue` 校验，失败即抛
 * `ToolOutputError(toolName, ['value is not lossless JSON'])`。**那是一次硬失败**：
 * 模型拿到的是宿主的一句报错，拿不到 `verdict` / `key` / `audit` ——
 * 契约 §4「绝不抛、绝不交出非法值」的承载条件在宿主边界上就失效了。
 * 也就是说：`ensureToolResult` 只校验形状（`toolResultProblem`）时，任何一个
 * `data.key` / `data.audit` 里的 `undefined` 都能一路穿到宿主被拒。
 * 所以形状之外还必须要求**可无损落 JSON** —— 不满足就走**既有的** `malformedResult`
 * 响亮失败，而不是原样放行把异常交给宿主。
 *
 * ## 绝不抛
 *
 * 宿主那份 `walkJsonValue` 是会抛的；本函数不抛 —— `errors.ts` 的整个文件头承诺
 * 「绝不抛」（`ensureToolResult` 的返回路径不许炸，而它正是靠本函数做决定）。
 * 两层兜底：整体一个 `try/catch`（`Proxy` 的 `ownKeys` / `getOwnPropertyDescriptor`
 * 陷阱真的会抛），加上一个递归深度上限（超限**响亮**判红，绝不当成「合法」放行）。
 *
 * @param value 待查的值。
 * @param path  违规要报出来的路径（供人复核用，**面向模型所以用英文**）。
 */
export declare function jsonValueProblem(value: unknown, path?: string): string | undefined;
/**
 * 把任意值收敛成合法的工具结果，**绝不抛**。
 *
 * 为什么需要它：输出 schema 用的是 `{ type: 'json' }`（无损 JSON，不做结构强制），
 * 因为宿主的 `defineTool` 需要输出 schema 是**字面量**才能推断类型，而把
 * 「成功/失败」两分支写成 `oneOf` 会让推断出的 `data` 类型与工具自己的返回类型对不上
 * （`Promise<never>`）。于是结构强制从**声明期**挪到**返回前**在这里做 ——
 * 「形状不合法的对象永远不会交给模型」这条保证仍然成立，只是位置换了。
 *
 * @param value 工具的候选返回值。
 */
export declare function ensureToolResult(value: unknown): ToolResult<unknown>;
/**
 * 是不是闭枚举里的 kind。
 *
 * @param value 候选字符串。
 */
export declare function isToolErrorKind(value: string): value is ToolErrorKind;
/**
 * 造一个成功结果。
 *
 * @param data 三层记录（`verdict` / `key` / `audit`）。
 * @param nextStep 可选的下一步建议；没有动作就**不传**。
 */
export declare function ok<T>(data: ToolData<T>, nextStep?: NextStep): ToolOk<T>;
/**
 * 造一个失败结果。
 *
 * 参数顺序与 `ok(data, nextStep?)` **同构**：必填在前、可选在最后。
 * 于是常见形状就是 `fail(error, data)`，需要下一步时 `fail(error, data, nextStep)` ——
 * 不给没有下一步的调用留 `undefined` 占位符（那是 31 个调用点上白写的噪声）。
 *
 * @param error 结构化错误（`kind` + 一句事实）。
 * @param data 这次观测到的记录（**必填**：失败分支也有 L1，见 SHAPE §4.1 约定 1）。
 * @param nextStep 可选的下一步建议；没有动作就**不传**。
 */
export declare function fail<T = unknown>(error: ToolError, data: ToolData<T>, nextStep?: NextStep): ToolFail<T>;
/**
 * 判断一个异常是不是「调用方取消」。
 *
 * `AbortSignal` 的取消在两条路径上形状不同：`fetch` 抛 `AbortError`，
 * 子进程通常只是被 kill（看退出码）。这里只负责前者。
 *
 * @param error 捕获到的异常。
 */
export declare function isAbortError(error: unknown): boolean;
/**
 * 把任意异常收敛成结构化错误（兜底分支用）。
 *
 * 有 `code` 的异常（Node 的 `SystemError`）单独识别两种最常见的网络失败：
 * 连接被拒 = 没启动；`ENOTFOUND` = 主机名写错。把它们映射到 `not-running`，
 * 是为了让模型不必去读 message 猜。
 *
 * `message` 只写**事实一句话**（建议的去处是描述层边界段或 `nextStep`，不是这里）。
 *
 * @param error 捕获到的异常。
 * @param context 出错的动作，用于拼 message（例如 `读取 profile manifest`）。
 */
export declare function toToolError(error: unknown, context: string): ToolError;
/**
 * 把文本里的家目录替换成 `~`（诊断输出会进会话日志，家目录名不必留在那里）。
 *
 * @param text 原始文本。
 * @param home 家目录绝对路径；空串表示不做替换。
 */
export declare function redactHome(text: string, home: string): string;
/**
 * 取异常的 `code` 字段（Node 的 `SystemError` 有，普通 `Error` 没有）。
 *
 * `cause` 也要看：`fetch` 把底层 `ECONNREFUSED` 包在 `TypeError` 的 `cause` 上，
 * 只读顶层会把它当成普通错误，于是「没启动」被误报成 `internal`。
 *
 * @param error 任意异常。
 */
export declare function systemErrorCode(error: unknown): string | undefined;
/**
 * 取异常的 `message`（非 Error 就转字符串）。`messageOf` 的唯一实现。
 *
 * 此前 `restart.ts` 一份函数 + `list_instances` / `check_effect_mode` 各一处内联同式 ——
 * 改一处必漏另一处（2026-10-16 审计 A1）。
 *
 * @param error 任意异常。
 */
export declare function messageOf(error: unknown): string;
/**
 * 取一个值的「记录」视图（非普通对象返回 `undefined`）。`asRecord` 的唯一实现。
 *
 * 此前 `profile.ts`（导出）+ `hot-reload.ts` / `loader.ts`（各一份逐字私有）三处
 * —— 2026-10-16 审计 A3 收敛于此，三个文件都改从这里 import。
 *
 * @param value 任意值。
 */
export declare function asRecord(value: unknown): Record<string, unknown> | undefined;
/**
 * 取一个值的函数视图（非函数返回 `undefined`）。`asFunction` 的唯一实现。
 *
 * @param value 任意值。
 */
export declare function asFunction(value: unknown): ((...args: unknown[]) => unknown) | undefined;
/**
 * 取一个值的字符串视图（非字符串返回 `undefined`）。`asString` 的唯一实现。
 *
 * @param value 任意值。
 */
export declare function asString(value: unknown): string | undefined;
/**
 * 是不是字符串（类型守卫）。`isString` 的唯一实现。
 *
 * @param value 任意值。
 */
export declare function isString(value: unknown): value is string;
/**
 * 调用方信号是不是已取消（`undefined` 视为未取消）。`isAborted` 的唯一实现。
 *
 * 此前 `http.ts` 与 `hot-reload.ts` 各一份逐字私有 —— 2026-10-16 审计 A4 收敛于此。
 *
 * @param signal 调用方信号。
 */
export declare function isAborted(signal: AbortSignal | undefined): boolean;
//# sourceMappingURL=errors.d.ts.map