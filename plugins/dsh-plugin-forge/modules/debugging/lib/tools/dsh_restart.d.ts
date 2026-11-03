/**
 * `dsh_restart` —— 本仓唯一**不可逆**的工具：它杀掉正在被排障的那个宿主。
 *
 * ## 它只做前半条链
 *
 * 四道确定性闸门 → 审批门 → 写 marker → 拉起新进程 → 本进程退出。
 * 「新进程起来之后」那半条（读 marker → 唤醒会话 → 投 notice → 把 marker 标为已消费）
 * 是**启动期**逻辑，不在这条调用路径上（由另一张卡承担）。所以本工具的 `verdict`
 * 只说「这次重启已经交出去了」，**不报新 pid** —— 那个进程不是本层起的。
 *
 * ## 顺序本身就是判据（SHAPE §6.1）
 *
 * 0. **两条「纯取值」的先决条件也在动手之前判**：`ctx.get('appExit')` 的**可达性**与
 *    拉起的**命令行长度**都不落盘、不拉起，所以它们与四道闸同属「动手前先拒」。
 *    ⚠️ 反面教材（2026-10-14 独立复核抓到的真缺陷，已修）：先 `schtasks /run`、后取
 *    `appExit`，取不到时返回的 `verdict` 却说「the restart was not started」——
 *    而拉起**已经发生**（延迟只写在命令行的 `ping` 里），盘上留着 marker、老宿主又不退出
 *    ⇒ **双宿主**（新宿主多半 `EADDRINUSE` boot 失败，C11）。**verdict 说假话比拒绝坏得多。**
 * 1. **先过四道确定性闸门，再走审批门** —— 反了就是「先弹窗让用户同意、再告诉他闸③不过」。
 *    但 `planRestart` 把「四道闸」与「写 marker」收在**同一个入口**里，所以实现是**两段式**：
 *    先 `dryRun: true` 探一遍（**不落盘**），过了才走审批，再 `dryRun: false` 真正落盘。
 * 2. **marker 必须在拉起之前 `await` 完成**：`planRestart` 返回时 `markerWritten === true`
 *    才允许拉起。`dryRun` 那次 `markerWritten === false`，那时既不许拉起、也不许退出。
 * 3. **先 `await` 完写、再调 `appExit`** —— `AppExit` 的语义是「等树 dispose 完再退」。
 *
 * ## 两道互相独立的门（描述与输出都要说清）
 *
 * - **审批档**（`ask` / `never`）：`ask` ⇒ 调官方审批门，**只有 `allowed-once` 算允许**
 *   （`rejected` / `cancelled` / `unavailable` 一律当拒绝）；`never` ⇒ **不问、直接执行** ——
 *   它的含义是「提示已关闭」，在那一档主动去问**必然被拒**（宿主 `decide()` 里
 *   `policy === 'never'` 直接返回 `rejected`）；档位读不出来 ⇒ fail-closed。
 * - **文件沙箱档**：写 `$DSH_HOME` 不在默认 `workspace-write` 的 writableRoots 里，
 *   所以本工具**显式**给 `danger-full-access`（实测见 `src/lib/restart-fs.ts` 文件头）。
 *   两道门互不替代：审批放行不等于写文件不会被沙箱拒。
 *
 * ⚠️ 这一档的**字面量只有一处**：`src/lib/restart-recovery.ts` 的
 * {@link RESTART_SANDBOX_MODE} —— 恢复半也要显式传它，两份字面量迟早会分叉。
 *
 * ## 为什么没有 `process.exit`
 *
 * 退出走 `ctx.get('appExit')`（`AppExit = (code: number) => void`）—— 宿主源码点名
 * `process.exit` 那条路 bypassing `ctx.appExit`。取不到 ⇒ **结构化失败**，不猜（B24）。
 *
 * ## 拉起走计划任务 —— 而「能不能回来」是**另一维**
 *
 * `{detached: true}` 实测**不能**逃出宿主的 job（宿主退出时被 `KILL_ON_JOB_CLOSE` 一起收掉），
 * 而计划任务（`schtasks`）实测无需提权、父进程是 `svchost.exe`、被起进程 `inHostJob=0`
 * （见 `docs/HOST-CONTRACTS.md` §2.2.2 的 [A] 行）。⇒ 本层在 Windows 上走它。
 *
 * ⚠️ **但「拼得出一条命令」不等于「有人能把它拉回来」**（2026-10-15 真机缺陷）：
 * 桌面宿主上命令拼得出来（拼的还是另一个 profile），闸④ 于是放行、宿主退出、**没人回来**。
 * 所以闸④ 的**第一问是载体**（`lib/carrier.ts` 的路线表）：
 * - 桌面宿主 ⇒ `no-relaunch-route`（插件侧没有通道，只有 Electron 壳能 `app.relaunch()`）；
 * - 非 win32 的命令行 ⇒ `no-relaunch-route`（没有已实测路线）；
 * - 认不出来 ⇒ `no-relaunch-route`（不猜）；
 * - 只有 `cli × win32` 才轮到第二问「命令定得出来吗」⇒ 定不出来是 `no-launch-command`。
 *
 * 两种拒绝都在**动任何东西之前**（零写 marker、零拉起、零退出）。
 */
import { type ToolDefinition } from '@deepseek-ai/dsh-tools';
import { type CarrierKind, type CarrierObservation } from '../lib/carrier.js';
import type { SpawnImpl } from '../lib/exec.js';
import { type BusySource, type GateId, type LaunchCommand, type Observed, type RefusalCode, type RestartFsPort, type RestartPorts } from '../lib/restart.js';
import type { ResolvedConfig } from '../contracts.js';
import { type ToolDescription } from './describe.js';
import { type EffectiveConfigBlock, type ToolDeps } from './shared.js';
/** 工具名。 */
export declare const RESTART_TOOL = "dsh_restart";
/**
 * 总闸那个配置字段名（**逐字**取自 `src/config.ts` 的那个 `Config` 字段）。
 *
 * 它的字面量**只有这一处** —— 它要逐字进模型可见文本，而抄第二遍就意味着
 * 「改了字段名、模型还在教用户改一个不存在的东西」（本仓「一处一事实」那一族）。
 */
export declare const RESTART_CONFIG_FIELD = "enableRestart";
/**
 * `schtasks /tr` 取值的长度上限（**文档值，未在本机复现**）。
 *
 * **出处**：Microsoft Learn 的 `schtasks create` 页面对 `/TR` 的说明 —— 任务运行命令的
 * 字符数上限为 **261**。⚠️ 本机**没有**真建过一条超长任务去撞这条线（那要写计划任务，
 * 属真机动作），所以它是**文档值**、不是实测值；方向仍然是安全的：撞上它时 `schtasks`
 * 只给一句参数错，比我们提前拒绝难诊断得多。
 *
 * **为什么本仓真的会撞上**：本机按真实形状生成的那条命令行（`set "DSH_HOME=…"` +
 * `cd /d …` + `ping -n …` + 完整 argv）**复核实测已达 269 字符** —— 已经在这条线之上。
 */
export declare const SCHTASKS_TR_MAX_CHARS = 261;
/** 走到哪一步了（机器码，进 `key`）。 */
export type RestartStage = 'gates' | 'approval' | 'dry-run' | 'marker' | 'relaunch' | 'exit';
/** 审批档位（宿主 `ApprovalPolicy` 的闭集，本层不猜第三值）。 */
export type RestartApprovalPolicy = 'ask' | 'never';
/** 审批结论（宿主 `ApprovalOutcome` 的闭集）。 */
export type RestartApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable';
/**
 * 审批门的注入面。
 *
 * `policyOf` 是**同步**的：宿主 `effectivePolicy(session)` 就是同步读一次会话日志的折叠值。
 * 它返回 `undefined` 表示**读不出来**（服务缺席 / 形状不认识 / 没有 agent）——
 * 那是 fail-closed 的那一格，**不是**「没有档位 = 随便做」。
 */
export interface RestartApprovalPort {
    /** 读这次调用所在会话的审批档位；读不出来 ⇒ `undefined`（fail-closed）。 */
    policyOf(agent: unknown): RestartApprovalPolicy | undefined;
    /** 走官方审批门。**不抛**：任何异常收敛成 `'unavailable'`。 */
    request(agent: unknown, reason: string, signal?: AbortSignal | undefined): Promise<RestartApprovalOutcome>;
}
/** 一次拉起请求（命令、延迟、预算、取消信号）。 */
export interface RelaunchRequest {
    /** 可执行文件。 */
    readonly command: string;
    readonly args: readonly string[];
    readonly cwd: string;
    /**
     * **模型可复核的完整命令行**（逐字进 `key.relaunch`）。
     *
     * 它比 `command` / `args` 更能说明「到底会跑什么」—— 计划任务那条路上还要先设
     * `DSH_HOME`、先睡 `delayMs`，那些都在这一行里。
     */
    readonly commandLine: string;
    /** 回执窗口（毫秒）：新进程延后这么久才起来。 */
    readonly delayMs: number;
    /** 本次传输预算（毫秒），由调用方经 `budgetFor` 取。 */
    readonly budgetMs: number;
    readonly signal?: AbortSignal | undefined;
}
/** 拉起的结果（**不抛**，失败收敛成 `ok: false`）。 */
export type RelaunchResult = {
    ok: true;
    detail: string;
} | {
    ok: false;
    reason: string;
};
/** 拉起端口。 */
export interface RelaunchPort {
    /** 真拉起新进程；**不抛**。 */
    relaunch(request: RelaunchRequest): Promise<RelaunchResult>;
}
/** 退出端口。 */
export interface RestartExitPort {
    /** 取宿主退出通道；取不到 ⇒ `undefined`（结构化失败，**不**退回 `process.exit`）。 */
    exit(): ((code: number) => void) | undefined;
}
/** 本工具要的宿主面（在 `src/tools/index.ts` 一处装配）。 */
export interface RestartHost {
    /** 四道闸 + marker 的取数面（`restart.ts` 的注入形状）。 */
    readonly ports: RestartPorts;
    readonly approval: RestartApprovalPort;
    readonly launch: RelaunchPort;
    readonly exit: RestartExitPort;
    /**
     * 探一个路径存不存在（用来判 `wscript.exe` 在不在）。
     *
     * **为什么是注入面而不是直接 `existsSync`**：这是**平台相关判据** —— CI 是 ubuntu、
     * 本机是 Windows，直接判真机平台会让两条分支里总有一条在某个环境上永远跑不到
     * （本仓纪律：平台相关判据要能显式钉住分支，见 `test/AGENTS.md`）。注入之后，
     * 「隐藏启动器在」与「回退到 cmd」两条分支在**任意**平台上都能被真跑到。
     */
    readonly pathExists: (path: string) => boolean;
}
/**
 * 本工具的运行期依赖。
 *
 * 与 `dsh_hot_reload` 同一个范式：写侧/行动类工具**在自己的文件里**扩 `ToolDeps`，
 * 而不是往 `shared.ts` 那份冻结形状里塞 —— 只读工具们的依赖面因此一点没变。
 */
export interface RestartToolDeps extends ToolDeps {
    readonly restart: RestartHost;
}
/**
 * 本工具的描述（SHAPE §2.1 四段骨架，段序不许换）。
 *
 * 逐段理由：
 * - `what`：动词 + 对象，并点明它**跨不到另一个实例**（那是它与「文件型工具」的分界，
 *   也是唯一会让人事后吃亏的地方：重启只作用于本进程所在的宿主）。措辞从
 *   `cannot reach another instance` 压成 `not another instance`（2026-10-16）—— 事实没变，
 *   只是为了给边界段的第四件事实腾字符（B20a 的 240 字符上限）。
 * - `useWhen`：路由信号 —— 「某个改动需要重启」。协作纪律（先问 `dsh_check_effect_mode`）
 *   写在 SKILL 正文里，描述层不复述。
 * - `boundary`：**四件执行前必须知道、且调用结果里学不到的事**：① `ask` 档会弹窗、
 *   `never` 档不问（读档位再决定问不问）；② **只有 Windows 上有已实测的拉起路线** ——
 *   非 win32 上 `launchCommandFrom` 与 `relaunchViaTaskScheduler` 两处都会拒绝；③ **桌面宿主
 *   一律被拒**（2026-10-15 真机缺陷之后新增的那一档）—— 这里写的**不是**「暂时不支持」，
 *   而是结构事实：插件侧没有重启通道，只有 Electron 壳自己 `app.relaunch()`，而且
 *   `dsh --profile desktop` 被命令行**无条件拒绝**。所以模型该在**调用之前**就知道这条路
 *   走不通（真机那次事故正是「先拼出一条命令、宿主退出、没人回来」）；
 *   ④ 写状态还要过**文件沙箱档**（与审批档互相独立）。四条都是事实，不是承诺。
 * - `cost`：行动类的三件事 —— **不可逆**、有 `dryRun` 可预览、`force` 只覆盖闸②。
 */
export declare const RESTART_DESCRIPTION: ToolDescription;
/**
 * `key`：下一个决定可能要用到的原料（SHAPE §5 的判据 —— 模型看不到它，会不会换下一步）。
 *
 * 全部字段**可选**，缺省就不印：`key` 是「这次知道了什么」，不是一张填满的表。
 * 失败分支也一样 —— 没走到那一步就不许拿默认值冒充（`markerWritten: false` 与
 * 「压根没到写 marker 那一步」是两件事）。
 */
export interface RestartKey {
    /** 走到哪一步了。 */
    stage: RestartStage;
    /** 被哪道闸拒（只有拒绝时出现）。 */
    gate?: GateId;
    /** 拒绝码（闭集，与闸一一对应）。 */
    code?: RefusalCode;
    /** 拒绝之前已经过了的闸（「走到了哪一步」比「四道闸」更准）。 */
    gatesPassed?: readonly GateId[];
    /** 审批档与结论（例如 `not-required (policy=never)`）。 */
    approval?: string;
    /** 会跑的那条**目标**命令行（模型可复核：新宿主以什么参数起来）。 */
    relaunch?: string;
    /**
     * 隐藏启动器脚本的落点（只有走 `wscript` 形态时出现）。
     *
     * 印出来是为了**可拦**：脚本写坏就静默不启动，所以「它到底跑了没有」得有个可查的文件。
     * 回退形态（`wscript.exe` 不在）下没有这一格 —— 那种形态会创建一个可见控制台。
     */
    launcher?: string;
    /** 启动器自己的日志落点（与 `launcher` 同进同出）：失败与「还没到点」靠它分开。 */
    launcherLog?: string;
    /**
     * 拉起形态：**只在回退形态下出现**。
     *
     * 缺省 = 走 `wscript` 隐藏 shim（零窗口活动）。出现 `console-fallback` = 这台机器上
     * `wscript.exe` 不在（VBScript 是 Windows 11 24H2 起可按需移除的功能），于是计划任务
     * 直接跑 `node`，会**闪一个可见控制台**。这一格存在的唯一理由是让模型/人知道这次会闪。
     */
    launcherMode?: 'console-fallback';
    /**
     * 可见停止窗口脚本的落点（只有走 `wscript` 形态时出现）。
     *
     * 这个窗口是新宿主的**停止入口**：新宿主没有控制台（隐藏启动器把控制台省掉了），
     * 而控制台原本就是用户唯一能停掉它的地方。窗口按端口绑宿主，关掉窗口或按 Ctrl+C
     * 都由 Windows Job Object 的 `KILL_ON_JOB_CLOSE` 终结宿主 —— 见 docs/SHAPE.md。
     */
    stopWindow?: string;
    /** 停止窗口自己的日志（与 `stopWindow` 同进同出）：绑不上 / 建不出 job 时唯一留痕。 */
    stopWindowLog?: string;
    /**
     * 这一次**没有**停止窗口，以及为什么。
     *
     * 只在「端口定不出来」时出现。它存在的意义是不把「新宿主既无控制台、又无可见停止入口」
     * 伪装成一次正常重启 —— 那正是 issue #63 记录的状态。
     */
    stopWindowSkipped?: string;
    /**
     * 交给 `schtasks /tr` 的那条调用 —— **只在它超限被拒时出现**。
     *
     * 为什么不是常驻字段：平时它对模型没有信息量（模型要复核的是**目标命令**，走 `relaunch`），
     * 而超限时它是唯一能据以判断「该缩短哪个路径」的东西。
     */
    launcherCommand?: string;
    /** marker 的落点。 */
    marker?: string;
    /** marker 真的落盘了吗（只有走到那一步才印）。 */
    markerWritten?: boolean;
    /** 这次是演练。 */
    dryRun?: true;
    /**
     * 这次调用是在什么载体上跑的（`cli` / `desktop-host` / `unknown`）。
     *
     * **L2 里只在不是 `cli` 时印**（照 `restartEnabled` 只在为假时印的先例）：
     * `cli` 是默认路径、没有信息量，而 `desktop-host` / `unknown` 正是「为什么被拒」那一格
     * —— 模型要对上闸④的 `no-relaunch-route` 就得看得见它。
     */
    carrier?: CarrierKind;
    /** 这次覆盖了闸②（留痕）。 */
    forced?: true;
    /** 写 marker 用的文件沙箱档位。 */
    sandbox?: string;
    /**
     * 这次调用看到的总闸档位（**只在被拒的那一格出现**）。
     *
     * 为什么必须单列而不是并进 `stage`：被配置禁用与被四道闸拒**都**是
     * `stage: 'gates'`，而两者的下一步完全不同（一个要改配置、一个等冷却）。
     * 只报 `stage` 就是让模型从「不知道」里猜 —— 而 L2 是它唯一能读的那一层。
     */
    restartEnabled?: boolean;
    /** 这次调用实际用的是哪份配置。 */
    resolved?: EffectiveConfigBlock;
}
/**
 * 造工具。
 *
 * @param deps 运行期依赖。
 */
export declare function createRestartTool(deps: RestartToolDeps): ToolDefinition;
/**
 * 把宿主上下文接成 {@link RestartHost}（**唯一的装配点**，`src/tools/index.ts` 调它）。
 *
 * 三条纪律：
 * 1. **`ctx.get('fs')` 每次现取**：`createRestartFsPort` 的 `read` / `write` 内部各自
 *    调一次 `ctx.get`（apply 期拿不到它，+1s 才有 —— `task-31` 实测），本层**不缓存实例**。
 * 2. **`process.platform` 在调用时读**（不在模块顶层读）：平台相关的分支因此可以被
 *    判据用 `withPlatform` 显式钉住（活跃坑 25）。
 * 3. **忙闲三个来源一个都不许漏**：会话回合（`agents.list()` 的 `status`）、
 *    后台作业与定时提醒（`workspace/session-activity` 的 `job` / `schedule` 家族）、
 *    以及无属主的作业（`jobs.list()`）。契约原话见 `docs/HOST-CONTRACTS.md` §2.3：
 *    **后台任务与定时提醒照旧全算（含调用方自己的）**。
 *    ⚠️ **`subagent` 族不单独枚举**：它已被 `agents.list()` 覆盖（证伪过程与依据写在
 *    {@link busySourcesFrom} 的文件注释里）。
 *
 * @param ctx 宿主上下文（结构面，本层不 import cordis）。
 * @param config 生效配置。
 * @param carrier 载体观测（**显式传入**：闸④的结论全靠它，见 `src/tools/index.ts` 的装配注释）。
 * @param spawn 子进程实现（跑 `schtasks` 用）。
 * @param pathExists 探路径存不存在的谓词（**平台相关**：判隐藏启动器在不在）。
 */
export declare function restartHostFrom(ctx: unknown, config: ResolvedConfig, carrier: CarrierObservation, spawn: SpawnImpl, pathExists: (path: string) => boolean): RestartHost;
/**
 * 闸①的历史：**marker 就是重启历史**（它记着上次重启发生在什么时候）。
 *
 * ## 两个 `action: 'none'` 必须分开（`task-32` 的 M1 变异正是这条）
 *
 * `decideRecovery` 有两个 `none` 分支：`reason: 'absent'`（根本没有 marker）与
 * `reason: 'consumed'`（有、但已经处理过了）。**合并它们就是静默丢掉一次冷却**：
 * 一份已消费的 marker 仍然带着 `at`，那是一条真实的重启记录；把它读成「没有重启过」
 * 会让 60 秒冷却窗口形同虚设 —— 也就是熔断闸①对**唯一它要防的那种循环**失效。
 *
 * ## 三值纪律
 *
 * `unsupported-version` / `malformed` / `unreadable` ⇒ `{known: false}`（**不是**空历史）：
 * 读不出历史时判「从没重启过」是**危险的那一边**（本仓三值纪律：取不到 ≠ 没有问题）。
 *
 * ## `at` 解析不出来也走 `{known: false}`（复核抓到的静默绕过）
 *
 * `parseMarker` 只要求 `at` 是**字符串**，不要求它是 ISO 时间。于是
 * `[Date.parse(...)].filter(Number.isFinite)` 会把一份 `at` 坏掉的 marker 压成 `[]` ——
 * 那正好是「读过、没有重启过」，**闸①的 60 秒冷却被静默绕过**（而 marker 明明在盘上）。
 * 现在：读不出时间 ⇒ 历史不可信 ⇒ 闸① fail-closed（拒绝的代价只是等）。
 *
 * @param fs marker 的 IO 端口。
 * @param dshHome 宿主数据目录。
 */
export declare function restartHistoryFrom(fs: RestartFsPort, dshHome: string): Promise<Observed<readonly number[]>>;
/**
 * 闸②的忙闲来源（会话回合 / 后台作业 / 定时提醒）。
 *
 * **取不到任何一格 ⇒ `{known: false}`**（fail-closed）：判成「不忙」会去打断别人的回合，
 * 而那不可逆。所以三个服务面（`agents` / `waterfall` / `jobs`）缺一个就拒绝 ——
 * 拒绝的代价只是等，而少算一个阻塞者的代价是打断一件没人知道在跑的事。
 *
 * ## 第三源是三值的（复核抓到的第二个缺口）
 *
 * `workspace/session-activity` 的兜底 `async () => []` 让「**没组合那个提供方**」与
 * 「**确实没有活动**」不可分 —— 于是「三源缺一即 known:false」这条纪律对第三源事实上
 * 不成立。现在先看**监听者表**（{@link waterfallOf} 的 `listeners`），分三格：
 * 没有监听者 / 监听者表读不出来 ⇒ `{known: false}`；有监听者 ⇒ 答空也算答了。
 *
 * ## subagent 族**不单独枚举**（复核那条「对闸②不可见」已证伪，`[已核]`）
 *
 * 复核当时是**推断**。按宿主源码读下来它**不成立**：subagent 后代本身就是 `agents`
 * 注册表里的 live agent，而下面那圈 `agents.list()` 已经把它们逐个读到了 ——
 * - `dsh-agent` 的注册表服务名就是 `agents`（`super(ctx, "agents")`），`list()` 返回
 *   **全部** `store.values()`（不按 owner 过滤，也没有作用域副本）；
 * - `dsh-subagent` 建后代走的正是 `ctx.agents.create({ parentAgent })`，所以后代在
 *   **同一个** store 里；
 * - 后代的 `status` 在回合内就是 `'running'`（`dsh-agent-loop` 的 `get status()`：
 *   phase 不是 idle/maintenance 即 running）—— 与 `dsh-subagent` 自己算
 *   `runningDescendants` 用的是**同一个判据**（`child.status === 'running'`）。
 * ⇒ 正在跑的 subagent 后代**已经被计成 `turn` 阻塞者**；再单独枚举一遍 `subagent` 族
 * 只是重复计数（对闸保守无害，但会让人以为多了一层覆盖，而且 evidence 里会出现同一个
 * 会话的两个标签）。这条结论留在这里，免得下一个人照着复核那句话再推一遍。
 *
 * 同理，waterfall 的 `turn` 族（类型原话：它**没有** per-item identity）说的是「被问的
 * 那个会话在跑回合」，与 `status === 'running'` 是同一件事的两次读 —— 两者都留着是
 * **刻意的**（互为独立来源；标签相同，`Set` 去重后阻塞者集合不因此变大）。
 *
 * @param ctx 宿主上下文。
 */
export declare function busySourcesFrom(ctx: unknown): Promise<Observed<readonly BusySource[]>>;
/**
 * 闸③：profile 的 bundle 表。
 *
 * 读不到清单（文件不在 / 不是 JSON）⇒ `{known: false}`：一个载入不了组合的宿主比现在这个更糟。
 *
 * @param config 生效配置。
 */
export declare function bundlesFrom(config: ResolvedConfig): Promise<Observed<readonly string[]>>;
/**
 * 闸④的**取值面**：启动命令 —— **不猜**。
 *
 * 三条分支，顺序是判据：
 * 1. **桌面宿主** ⇒ `{known: false}`，理由逐字用 `relaunchRefusalFor` 的那一句
 *    （**纵深防御**：判据层已经先拒过一次，这里再拒一次 —— 「命令拼得出来 ⇒ 放行」
 *    正是 2026-10-15 真机缺陷的成因，所以两层都必须不成立）；
 * 2. **非 win32** ⇒ `{known: false}`（别的平台没有已实测的路线）；
 * 3. win32 ⇒ 按 `argv` 拼命令。
 *
 * `process.platform` **在这里读**（调用时，不在模块顶层）：平台分支因此可被判据钉住。
 *
 * @param config 生效配置。
 * @param carrier 载体观测（只为第 1 条分支；判定表在 `lib/carrier.ts` 一处）。
 */
export declare function launchCommandFrom(config: ResolvedConfig, carrier: CarrierObservation): Observed<LaunchCommand>;
/**
 * 真拉起：Windows 计划任务（`schtasks`）。
 *
 * 顺序是 `/create`（`/f` 覆盖同名任务）→ `/run`（立刻跑，延迟由命令行里的等待表达）。
 * **不 `/delete`**：删除会连带掐掉正在跑的实例；同名任务用 `/f` 覆盖即可，代价是
 * 机器上留一条任务定义（写进 `audit`，让用户知道有它、也知道怎么删）。
 *
 * 失败一律收敛成 `{ok: false, reason}`（**不抛**）：拉起失败要**可诊断**，
 * 而「哪一步、退出码多少、stderr 是什么」就是诊断要的全部。
 *
 * @param spawn 子进程实现。
 * @param request 拉起请求。
 */
export declare function relaunchViaTaskScheduler(spawn: SpawnImpl, request: RelaunchRequest): Promise<RelaunchResult>;
/**
 * 取宿主退出通道（`ctx.get('appExit')`）。
 *
 * **不猜、不退回 `process.exit`**：宿主源码点名那条路 bypassing `ctx.appExit`。
 * 取不到就返回 `undefined`，由调用方转成结构化失败（B24）。
 *
 * @param ctx 宿主上下文。
 */
export declare function appExitOf(ctx: unknown): ((code: number) => void) | undefined;
/**
 * 读这次调用所在会话的审批档位。
 *
 * `effectivePolicy(session)` 在宿主 `d.ts` 里标着 `private`，但运行时是个普通方法
 * （`overrideOf(session) ?? config.policy ?? 'ask'`）—— 所以这里按**结构**取，
 * 拿不到就返回 `undefined`（fail-closed），而不是猜一个 `ask`。
 *
 * @param ctx 宿主上下文。
 * @param agent 这次调用所属的 agent。
 */
export declare function approvalPolicyOf(ctx: unknown, agent: unknown): RestartApprovalPolicy | undefined;
/**
 * 走官方审批门（`approval.request`）。
 *
 * **不抛**：`request()` 在没有打开的回合上会抛，那同样是「没拿到许可」⇒ 收敛成
 * `'unavailable'`（闭枚举里的一格，fail-closed）。返回非闭集值时也归一成 `'unavailable'`。
 *
 * @param ctx 宿主上下文。
 * @param agent 这次调用所属的 agent。
 * @param reason 给弹窗看的那句话。
 * @param signal 调用方取消信号。
 */
export declare function approvalRequestOf(ctx: unknown, agent: unknown, reason: string, signal?: AbortSignal | undefined): Promise<RestartApprovalOutcome>;
/**
 * `key` → L2 的逐行文本。
 *
 * 顺序即输出顺序：**先「走到哪一步」，再「拒绝/审批的机器码」，最后是落点与命令**。
 * 三条纪律与 `dsh_hot_reload` 的同名函数一致：
 * - **不给默认值**：字段缺省就整项不印；
 * - **只在为真时印**（`dryRun` / `forced` / `markerWritten`）；
 * - **标识符必须出现**：`relaunch` 是模型复核「到底会跑什么」的唯一一行。
 *
 * ⚠️ 必须能喂 `{}`（B25：守卫合成的兜底 `key` 就是空对象）—— 全程可选链 + 类型守卫。
 *
 * @param key 本次的 `key`。
 */
export declare function keyText(key: RestartKey): string[];
//# sourceMappingURL=dsh_restart.d.ts.map