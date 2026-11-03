/** 一条外部命令的结果。超时与取消**不抛异常**，而是把标志位带回给调用方。 */
export interface CommandResult {
    /** 退出码；进程未正常退出（被信号杀死 / spawn 失败）时为 `null`。 */
    code: number | null;
    /** 标准输出（utf8）。 */
    stdout: string;
    /** 标准错误（utf8）。 */
    stderr: string;
    /** 是否因**传输层预算耗尽**被杀。 */
    timedOut: boolean;
    /** 是否因**调用方取消**（`exec.signal`）被杀。 */
    aborted: boolean;
    /** spawn 本身失败时的原因（例如可执行文件不存在）；正常退出为 `undefined`。 */
    spawnError?: string;
}
/** 一条命令的完整调用参数。 */
export interface RunCommandOptions {
    readonly command: string;
    readonly args: readonly string[];
    /** 本条命令的传输预算（毫秒）；调用方负责让它小于工具预算。 */
    readonly timeoutMs: number;
    readonly signal?: AbortSignal | undefined;
    readonly cwd?: string | undefined;
    readonly env?: NodeJS.ProcessEnv | undefined;
}
/** 可注入的 spawn：测试喂假实现，生产用 {@link defaultSpawnImpl}。 */
export type SpawnImpl = (options: RunCommandOptions) => Promise<CommandResult>;
/**
 * 生产实现：`spawn` + 手写超时与取消。
 *
 * 不用 `spawn` 自带的 `signal` 选项，是为了同时拿到「超时」与「取消」两个**不同的**
 * 标志：两者的正确反应不同（超时 → 可重试；取消 → 不可重试），混成一个看不出来。
 *
 * @param options 命令与预算。
 */
export declare const defaultSpawnImpl: SpawnImpl;
/**
 * 跑一条命令。
 *
 * @param options 命令与预算。
 * @param spawnImpl 可注入的实现；默认生产实现。
 */
export declare function runCommand(options: RunCommandOptions, spawnImpl?: SpawnImpl): Promise<CommandResult>;
//# sourceMappingURL=exec.d.ts.map