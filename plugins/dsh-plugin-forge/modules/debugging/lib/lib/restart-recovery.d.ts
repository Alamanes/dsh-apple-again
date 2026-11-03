import { type ContextLike } from './restart-fs.js';
import { type MarkerState, type RecoveryDecision, type RestartFsPort, type RestartMarker } from './restart.js';
/**
 * 投递来源的 `kind`（逐字等于 `package.json` 的 `name`）。
 *
 * 客户端按 `kind` 归因，所以它必须与本包名一致；`test/tools/restart-recovery.test.ts`
 * 有一条自证盯着这个字面量（与 `restartMarkerPath` 的命名空间自证同族）。
 */
export declare const NOTICE_SOURCE_KIND = "dsh-plugin-debugging";
/**
 * `summary` 的长度上限（宿主 `CONTEXT_SUMMARY_MAX_CHARS` = 120）。
 *
 * 我们**不** import 宿主那个常量：`@deepseek-ai/dsh-llm` 是宿主安装树里的包，从本仓的
 * 解析上下文拿不到（活跃坑 19 同族）。所以这里按 `[已核]` 的值再放一份，并配一条
 * 「超长输入被截到 ≤120」的判据 —— 值漂了那条判据会红。
 */
export declare const NOTICE_SUMMARY_MAX_CHARS = 120;
/**
 * 「要看现在怎么样」该调的那个工具。
 *
 * ⚠️ 它**不再**与重启壳的 `nextStep` 同源：壳的演练支现在说的是「再调一次 `dsh_restart`、
 * 去掉 `dryRun`」（原来那个指针指向本工具、还硬编码了 `change: 'config'`，已按 B1 改掉），
 * 闸门拒绝支里只有闸③指 `dsh_dump_config`。这里的指针是**恢复半自己**的判断：
 * 重启的常见理由就是「改了宿主端代码」，起来之后该问的正是「现在生效了吗」。
 */
export declare const STATE_TOOL = "dsh_check_effect_mode";
/**
 * 启动期恢复的延迟（毫秒）—— 从本层 apply 起算的**第一段**等待。
 *
 * ⚠️ **它不是「服务可用窗口」，只是「第一次尝试的时刻」**（真机那一轮的成因，见文件头 ①②）：
 * 取 1 秒是 C26（`sessionController` 在 apply 后 138–157 ms 才有）的约 6 倍。
 * 真正的兜底**不是**把它调大，而是**轮询**：读走 {@link RECOVERY_READ_ATTEMPTS} ×
 * {@link RECOVERY_POLL_INTERVAL_MS}，唤醒走 {@link RECOVERY_WAKE_ATTEMPTS} ×
 * {@link RECOVERY_WAKE_RETRY_MS}，两段的**末次尝试**都必须越过 C32 实测的服务可用上界
 * —— 那条不等式由 `test/tools/restart-recovery.test.ts` 钉住（数值不是抄在注释里的承诺）。
 */
export declare const RECOVERY_STARTUP_DELAY_MS = 1000;
/**
 * 「等宿主服务」的**总预算**（毫秒，从恢复开始起算，即 apply 后 `1_000 + 本值`）。
 *
 * 取 4 秒的理由是 C32 的**实测上界**（同一套组合里 `fs` 2.2–2.5 s、`sessionController`
 * 2.4–2.8 s）：整条链最后一个动作落在 apply 后 5 秒，比 2.8 秒留出约 2.2 秒余量。
 * ⚠️ C26 记的是 138–157 ms、**基准不同**，两个数不能混着用（C32 成因本身标 `[无法判定]`）——
 * 本值取的是**较大那个**的保守侧。
 */
export declare const RECOVERY_SERVICE_WINDOW_MS = 4000;
/** 读 marker 那条路两次尝试之间的等待（毫秒）。 */
export declare const RECOVERY_POLL_INTERVAL_MS = 250;
/**
 * 读 marker 的尝试次数上限（**由窗口与间隔推导，不另抄一份**）。
 *
 * 为什么读也要重试（文件头 ①）：`ctx.get('fs')` 在 apply 期取不到（`restart-fs.ts` 的 `read`
 * 因此给 `unreadable`），而**单次**读到 `unreadable` 就 `refused` 收工，等于把「服务还没起来」
 * 印成「读不到」—— 真机那一轮就是这样一条 notice 都没投出来的。
 *
 * 为什么**按次数**而不是按时钟：这个 `sleep` / `now` 都是注入点，判据里 `sleep` 立即返回、
 * `now` 是常数 ⇒ 任何按挂钟收敛的循环在判据里**不会终止**。次数上限既可注入、也能被断言。
 */
export declare const RECOVERY_READ_ATTEMPTS: number;
/**
 * 每个会话的唤醒尝试次数上限。
 *
 * 「等不到」是**正常分支**（C10）：它只意味着这次恢复做不成，**不**意味着要把 marker
 * 清掉。重试是为了吃掉「服务还没起来」，不是为了保证成功。
 *
 * 15 次的依据：2026-10-17 真机回执（`last-attempt.json`）实测 `sessionController`
 * 在宿主启动后 **>5.8 秒** 仍未就绪（历史记录 2.8 秒被打破），`6 × 800ms` 的窗口
 * 全灭（6 次全部报「service not available yet」）。新窗口取 **约 3 倍余量**：
 * 末次尝试落在 apply 后 `1_000 + (15-1) × 1_000 = 15_000 ms`。
 */
export declare const RECOVERY_WAKE_ATTEMPTS = 15;
/**
 * 两次唤醒尝试之间的等待（毫秒）。
 *
 * ⚠️ **与次数一起看才有意义**：末次尝试落在 apply 后 `1_000 + (15-1) × 1_000 = 15_000 ms`。
 * 历史形态：`6 × 800` 末次 5_000 ms，越过当时的 C32 实测 2.8 秒上界 —— 但 2026-10-17
 * 真机实测上界被打破（>5.8 秒），窗口整段落在可用窗口之内、六次全灭 ⇒ 放宽到 15 秒。
 */
export declare const RECOVERY_WAKE_RETRY_MS = 1000;
/**
 * 写 marker 时显式传给宿主 `fs.writeText` 的**文件沙箱**档位。
 *
 * **必须显式给**：默认档 `workspace-write` 下 `$DSH_HOME` 不在 writableRoots 里 ⇒ 必被
 * `FS_SANDBOX_DENIED` 拒掉（`task-31` 真机实测，见 `src/lib/restart-fs.ts` 文件头）。
 * 它只影响文件沙箱，与审批档无关 —— 两道门互不替代。
 *
 * ## 为什么这个字面量住在这里（两半都 import 它）
 *
 * 重启的**两个半边**（工具壳 `src/tools/dsh_restart.ts` 与恢复半）都要显式传它，
 * 所以它只能有**一处**字面量（一处一事实：抄两份就会出现「改了一处、另一处还按旧档」）。
 * 落点选本文件而不是 `restart-fs.ts` / `restart.ts`：那两份当时的改动范围之外，
 * 而本文件是**两个半边都 import 得到**、且**恢复半不 import 工具半**（反向依赖会成环）
 * 的那一格。
 */
export declare const RESTART_SANDBOX_MODE = "danger-full-access";
/** 一条 notice 的两半：正文与折叠行上的一句话。 */
export interface RecoveryNotice {
    /** 正文（英文；进 `UserMessage` 的 content，模型与人都会看到）。 */
    text: string;
    /** `form:'notice'` 的 `summary`：**非空、单行、≤120 字符**（C22）。 */
    summary: string;
}
/**
 * 投递给宿主 `agent.followup` 的那条消息（**结构面**）。
 *
 * 刻意**不** import 宿主的 `createUserMessage` / `UserMessage`：那是宿主安装树里的包，
 * 从本仓的解析上下文拿不到（活跃坑 19）。形状取自 `task-34` 的实测探针（它就是这样
 * 手搓、并被宿主接受、落成持久的 user-role 消息 —— C21），以及宿主自己的
 * `modelSwitchNotice`（`dsh-agent` 的 `lib/index.js`，`createUserMessage({content, source})`）。
 */
export interface NoticeMessage {
    readonly id: string;
    readonly role: 'user';
    readonly content: readonly {
        readonly type: 'text';
        readonly text: string;
    }[];
    readonly source: {
        readonly kind: string;
        readonly form: 'notice';
        readonly summary: string;
    };
}
/**
 * 造那条 `UserMessage`（**纯函数**，`id` 注入以便判据可复现）。
 *
 * @param notice notice 的两半。
 * @param id 消息 id（宿主 `createUserMessage` 也会自己造一个）。
 */
export declare function noticeMessageOf(notice: RecoveryNotice, id: string): NoticeMessage;
/**
 * 把 `summary` 截到 {@link NOTICE_SUMMARY_MAX_CHARS} 以内。
 *
 * 用 ASCII 的 `...` 而不是省略号：本仓的 `src/` 字符串一律保持 ASCII
 * （B14 只禁 CJK，但「别在模型可见字符串里引入非 ASCII」是更省事的同一条纪律）。
 *
 * @param summary 原始一句话。
 */
export declare function boundNoticeSummary(summary: string): string;
/**
 * 造这条 notice —— **只放事实 + 指针**（决策笔记 §决定那张表的第 2 行）。
 *
 * 四件事实：什么时候重启的、停机多久、为什么、marker 的下场；一个指针：要看现状调哪个工具。
 * ⚠️ **不塞状态快照**（那是「当前状态」的第二个 home，而且只是开机瞬间的值）；
 * ⚠️ **不写「请继续」**（决策笔记「替代方案与被否的理由」第 3 条明确否决：重启后该不该
 * 接着干是语义判断，工具没有足够上下文，把它留给 Agent）。
 *
 * `at` 解析不出来时**不编**停机时长，而是把「推不出来」本身写成一句事实 ——
 * 三值纪律在渲染层同样成立。
 *
 * ## `reason` **只发给发起者**（维护者 2026-10-15 拍板）
 *
 * `reason` 是**用户给自己留的便条**，不是公告：广播给「被顺手打断」的其它会话就是**串话**。
 * ⇒ 本函数**必须**知道收件人是谁，于是 `recipient` 是**必填**第三参 ——
 * 类型上堵死「造一条 notice 群发」这种写法（原来正是那样：一条 notice 循环投给所有人）。
 *
 * 三分支（三值纪律，不许压成两值）：
 * - `marker.initiator === recipient` ⇒ 逐字给出 `reason`；
 * - `initiator` 有值但**不是**收件人 ⇒ **不给** `reason`，并说明「是别人发起的」；
 * - `initiator` **缺席**（本字段之前写的 marker）⇒ **不给** `reason`，并说明「这份 marker
 *   没记是谁发起的」 —— **不许**退化成「那就发给所有人」：那正是要消除的串话。
 *
 * ⚠️ **收件人不匹配时也要给出一句事实，不能留个静默的空洞**：notice 是给模型看的，
 * 一个莫名其妙的中断如果不说「这不是你发起的」，模型会自己编一个理由。
 *
 * ## marker 的下场只能写成**条件句**（C31 实测钉住的）
 *
 * 这条 notice 是在**消费之前**投出去的（顺序是判据：全部唤醒成功才标已消费），所以
 * 「marker 会不会被消费」在这一刻**还不知道**。C31 真机实测：marker 留在 `armed` 的同时，
 * 投出去的 notice 的 `summary` 仍写着 `- marker consumed` —— **通知与盘上状态不符**。
 * ⇒ 正文写成条件句（全部唤醒成功才消费，否则留盘、下次再试），而 `summary` **不许**
 * 断言消费：它是客户端折叠行上唯一能被人看见的那一句。
 *
 * @param marker 要恢复的那份 marker。
 * @param now 现在（毫秒纪元）。
 * @param recipient 这条 notice 的收件会话（`session-<uuid>`）。决定 `reason` 给不给（见上）。
 */
export declare function buildRecoveryNotice(marker: RestartMarker, now: number, recipient: string): RecoveryNotice;
/** 一次唤醒尝试的结果。**失败要带原因**（原因进日志与结构化报告）。 */
export type WakeOutcome = {
    ok: true;
} | {
    ok: false;
    reason: string;
};
/**
 * 唤醒面（**唯一的宿主注入点**）。
 *
 * 一个方法而不是两个（`resolve` + `followup`）：它俩必须**紧挨着**做（C20：resolve 返回的
 * `{agent}` 可以立刻 followup，不需要等就绪窗口），拆成两步只会让调用方有机会在中间插
 * 一个 await 并把那个窗口破坏掉。
 */
export interface RecoveryChannel {
    /**
     * 唤醒一个会话并投一条 notice。
     *
     * **不抛**：`resolveAgent` 的失败按 `{error}` 分支判（C4 / C16，别靠 try/catch）、
     * `followup` 抛异常也收敛成 `{ok:false}`。
     *
     * @param sessionId 运行期键（`session-<uuid>`）。
     * @param notice 要投的那条 notice。
     */
    wakeAndNotify(sessionId: string, notice: RecoveryNotice): Promise<WakeOutcome>;
}
/** 本层的 IO 端口 —— 与 `planRestart` 的 `RestartPorts` 同一种设计（纯逻辑可单测）。 */
export interface RecoveryPorts {
    /** marker 的读写端口（真实实现走宿主 `ctx.fs`）。 */
    fs: RestartFsPort;
    /** 唤醒 + 投递。 */
    channel: RecoveryChannel;
    /**
     * 留痕（英文短句）。
     *
     * 它是 `refuse` 分支**唯一**的可查痕迹（marker 留在盘上、结构化报告只回到调用方），
     * 所以实现方**不许**把它做成静默的空操作。
     */
    log(line: string): void;
    /** 现在（毫秒纪元）；只为测试注入。 */
    now(): number;
    /** 等待；只为测试注入（判据里立即返回，不真等）。 */
    sleep(ms: number): Promise<void>;
}
/** 一次唤醒失败的记录。 */
export interface WakeFailure {
    sessionId: string;
    /** **最后一次**尝试的原因。 */
    reason: string;
    /** 实际尝试了几次。 */
    attempts: number;
}
/** 恢复判定里 `refuse` 那一支的码 —— 从 `restart.ts` 的类型里取，不另抄一份闭集。 */
export type RecoveryRefusalCode = Extract<RecoveryDecision, {
    action: 'refuse';
}>['code'];
/** 启动期恢复的请求面。 */
export interface RecoveryRequest {
    /** `$DSH_HOME`（marker 落点的第一段）。 */
    dshHome: string;
}
/**
 * 启动期恢复的结论。
 *
 * **`idle` 的两个 `reason` 必须分得开**：它们渲染/取值不同，且 `consumed` 带着那份
 * 审计记录（「上次重启是什么时候」）。合并它们就是本卡要防的那一种静默。
 */
export type RecoveryOutcome = 
/** 没有待办。`absent` = 根本没有 marker；`consumed` = 有，但处理过了。 */
{
    kind: 'idle';
    reason: 'absent';
    verdict: string;
} | {
    kind: 'idle';
    reason: 'consumed';
    marker: RestartMarker;
    verdict: string;
}
/** 全部会话都唤醒并投递成功，marker 已标已消费。 */
 | {
    kind: 'recovered';
    marker: RestartMarker;
    /** 盘上那份（已带 `state: 'consumed'`）。 */
    consumed: RestartMarker;
    woken: readonly string[];
    /**
     * 实际投出去的 notice —— **每个会话一条**，不是一条群发。
     *
     * ⚠️ 这里原来是单数 `notice: RecoveryNotice`。`reason` 改成「只发给发起者」之后，
     * 那个形状就**说谎了**：它只能描述其中一个收件人。留一个单数槽 = 让审计记录
     * 看起来「只投了一条」，而实际每人的正文不同。
     */
    notices: readonly {
        readonly sessionId: string;
        readonly notice: RecoveryNotice;
    }[];
    /** **根因事实**：marker 真的标成已消费了吗（判据断言这一格，不断言「没报错」）。 */
    markerConsumed: true;
    verdict: string;
}
/** 有会话唤醒失败 ⇒ marker **保留**，下次启动再试。 */
 | {
    kind: 'pending';
    marker: RestartMarker;
    woken: readonly string[];
    failures: readonly WakeFailure[];
    markerConsumed: false;
    verdict: string;
}
/** 读到了但没懂 ⇒ **绝不静默**：留痕 + 结构化报告，marker 原地不动。 */
 | {
    kind: 'refused';
    code: RecoveryRefusalCode;
    verdict: string;
    remedy: string;
    evidence: readonly string[];
}
/** 本层自己的意外（**不是**上面任何一种判定）。 */
 | {
    kind: 'failed';
    verdict: string;
    detail: string;
};
/**
 * 一次恢复尝试的**盘上回执**（receipt）——「这次启动到底有没有恢复」的可观测面。
 *
 * ## 为什么需要它（文件头 ③ 的实测依据）
 *
 * `RecoveryOutcome` 只回到调用方，而调用方（`src/index.ts`）用 `void …` 把它丢掉了；
 * 之前唯一的留痕是 `ctx.logger(name).info`，而宿主启动期只把 `warn` / `error` 收进
 * `startup-*.log`、且那个文件**只在启动失败时**才落盘 ⇒ 真机那条 `schtasks → cmd /c`
 * 的路上，**一条 INFO 在任何地方都不留档**。于是真机事后看到的三样东西
 * （marker 仍 `armed` / notice 0 条 / 插件 active）**同时兼容**「没跑」「跑了读不到 fs」
 * 「读了唤醒失败」三条 —— 分不开本身就是缺陷。
 *
 * ## 它答的是哪三个问题
 *
 * 读这一个文件就能分：
 * ① **有没有跑** —— 文件带本次启动的时刻戳；只有上一次的旧时间戳 ⇒ 这一轮**真的没跑**；
 * ② **跑到哪一步** —— `markerReadAttempts` 与 `markerStateAtRead` 说清读了几次、读到的是什么；
 * ③ **结果是什么** —— `outcome` / `detail` / `failures` 三件对应 `recovered` / `pending` /
 * `refused` / `failed`，**与 marker 的 `state` 互相独立**（marker 只在成功时被改，
 * 它因此答不了「失败在哪一步」）。
 *
 * ## 什么时候**不**写（刻意：正常启动不许有噪音）
 *
 * `idle` 两个分支都不写：`absent` 是「没有待办」，`consumed` 是「已经处理过了」——
 * 后者的审计价值本来就在 marker 自己身上（`consumed at …` 留痕）。
 * ⇒ **只有「动了」或「说不清」的终局才落盘**。
 */
export interface RecoveryReceipt {
    /** 回执自身的格式版本（与 marker 的 `version` 是两件事：那份被消费时改，这份被覆盖）。 */
    version: number;
    /** 这一次恢复**开始**的时刻（ISO 8601）。 */
    startedAt: string;
    /** 这一次恢复**结束**的时刻（ISO 8601）。 */
    finishedAt: string;
    /** 终局。**不含 `idle`**（那一格刻意不落盘，见上）。 */
    outcome: 'recovered' | 'pending' | 'refused' | 'failed';
    /** 读了几次才拿到**确定答案**（含第一次）。1 = 服务一上来就在。 */
    markerReadAttempts: number;
    /** 读到时 marker 的状态；读都没成功时缺席。 */
    markerStateAtRead?: MarkerState;
    /** **根因事实**：这次结束时 marker 真的被标成已消费了吗。 */
    markerConsumed: boolean;
    /** 唤醒失败逐条（只有 `pending` 非空）。 */
    failures?: readonly WakeFailure[];
    /** 一句话结论（英文；与 `RecoveryOutcome.verdict` 同源）。 */
    detail: string;
}
/** 回执的格式版本。与 `MARKER_VERSION` 是两件事，**不共用**（marker 那份被消费时会被改写）。 */
export declare const RECOVERY_RECEIPT_VERSION = 1;
/**
 * 回执的绝对路径：`$DSH_HOME/<包名>/restart/last-attempt.json`。
 *
 * ⚠️ **与 marker 同目录、不同文件名**，理由有两条，都不是「顺手」：
 * ① **B10 的白名单只认「紧跟 home 的首段逐字等于包名」**，所以这一段必须是**字面量**，
 *    不能写成 `join(dshHome, OWN_NAMESPACE, …)`（那会被保守判红，与 `restart.ts` 的
 *    `restartMarkerPath` 同一条纪律）；
 * ② **绝不能复用 marker 那个文件**：marker 是恢复的**输入**，往它身上追加字段会改变
 *    「读到了但没懂 / 幂等」那两条已实测语义（C28–C32 一格都不许回退）。
 *
 * @param dshHome 宿主数据目录（`$DSH_HOME`）。
 */
export declare function recoveryReceiptPath(dshHome: string): string;
/**
 * 启动期恢复的**唯一入口**。
 *
 * 顺序：读 marker → 判定 → （`recover` 时）逐个唤醒 + 投 notice → **全部成功才**消费。
 * **绝不抛**（启动期逻辑把宿主带崩是这套东西里最不可接受的一种失败）。
 *
 * 名单会**去重**：`parseMarker` 只过滤非字符串、不去重，而手改过的 marker 里重复的 id
 * 会让同一个会话被唤醒两次（重复一条 notice 是小事，但没理由照做）。
 *
 * @param request 请求面。
 * @param ports IO 端口。
 */
export declare function recoverRestart(request: RecoveryRequest, ports: RecoveryPorts): Promise<RecoveryOutcome>;
/**
 * 造唤醒通道的**宿主适配器**（结构面访问，不 import 宿主包）。
 *
 * 一次调用 = 一次尝试：取服务 → `resolveAgent` → 按 `{error}` 分支判失败（C4 / C16）
 * → 取 `agent` → `followup(message)`。**重试在 {@link recoverRestart} 那一层**，
 * 这样「试了几次」是可观测的、测试里也不必真等。
 *
 * @param ctx 宿主上下文。
 */
export declare function createRecoveryChannel(ctx: ContextLike): RecoveryChannel;
/**
 * 取留痕口：优先宿主 logger（`ctx.logger('<包名>')`），取不到退回 `console.warn`。
 *
 * **退回 console 而不是静默**：这条痕迹是 `refuse` 分支唯一能被人看见的地方
 * （marker 原地不动、结构化报告只回到调用方），做成空操作就等于「静默地没恢复」。
 *
 * ## 为什么是 `warn` 而不是 `info`（真机实测出来的，不是偏好）
 *
 * 宿主启动期那个 exporter **只收 `warn` / `error`**（`dsh-app-boot/lib/index.js` 的 `boot()`：
 * `levels: { default: 2 }` 且只 push `warn` / `error`），并且 `startup-*.log`
 * **只在启动失败时**才落盘（只有 `StartupError` 分支把 `messages` 带出去）。
 * ⇒ 走 `info` 的话，这条留痕在**任何一次正常启动里都不留档** —— 真机那条
 * `schtasks → cmd /c` 的路上更是连 stderr 都没人接。改用 `warn` 之后，它至少能进
 * 「本次启动有 warn/error」的那份 `startup-*.log`。
 * ⚠️ **这一格仍不够**：正常启动不会写那份文件，所以「留痕在盘上」那条只能靠
 * {@link RecoveryReceipt}，本函数只负责「启动失败时看得见」。
 *
 * @param ctx 宿主上下文（可以是单测替身）。
 */
export declare function recoveryLogOf(ctx: unknown): (line: string) => void;
/**
 * 装配本层的 IO 端口。
 *
 * ⚠️ **不在这里取 `ctx.get('fs')` / `ctx.get('sessionController')`**：`restart-fs` 的端口
 * 每次读写时现取，通道每次唤醒时现取 —— 装配本身只绑 ctx。
 *
 * @param ctx 宿主上下文。
 */
export declare function createRecoveryPorts(ctx: ContextLike): RecoveryPorts;
/**
 * 启动期恢复的**装配 + 执行**（`src/index.ts` 的 `apply` 只负责调度它）。
 *
 * **绝不 reject**：它挂在 `setTimeout` 上，一个未处理的 rejection 会变成宿主启动期的
 * 幽灵错误。所以端口装配也包在里面（装配失败就退回 `console` 留痕）。
 *
 * @param ctx 宿主上下文。
 * @param dshHome 宿主数据目录。
 * @param portsOverride **只给判据用的注入口**（生产路径不传）：真实端口的
 *   `sleep` 是 `setTimeout`，而读路径现在会**按 {@link RECOVERY_READ_ATTEMPTS} 轮询**
 *   ⇒ 不注入的话，测「服务全程不可用」那一条要真等整个窗口。
 *   ⚠️ 只替换 `sleep` / `now` 是不够的：`createRecoveryPorts(ctx)` 返回的 `fs` 与 `channel`
 *   都现取服务，**保留**它们才是在测真实适配器（替身只该把「等」这件事变成零）。
 */
export declare function runStartupRecovery(ctx: ContextLike, dshHome: string, portsOverride?: Partial<RecoveryPorts>): Promise<RecoveryOutcome>;
//# sourceMappingURL=restart-recovery.d.ts.map