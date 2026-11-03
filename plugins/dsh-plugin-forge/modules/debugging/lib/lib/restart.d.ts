import type { CarrierObservation } from './carrier.js';
/** marker 的格式版本（写出去的那一个）。**只许加字段，不许改语义** —— 改语义等于把版本门推倒。 */
export declare const MARKER_VERSION = 1;
/**
 * 认得的 marker 格式版本。
 *
 * 新读旧**可以响亮拒绝**、旧读新只能静默降级 —— 这个不对称本身就是设计（决策笔记 §五）。
 * 所以「不在这个集合里」必须是一条**结构化失败**，不许被压成「没有 marker」。
 */
export declare const SUPPORTED_MARKER_VERSIONS: readonly number[];
/**
 * 闸①的冷却窗口（毫秒）。
 *
 * 60_000 不是拍的：SHAPE §6.1 的待实测表第 7 条记着**两个独立参考实现都落在 60 秒**
 * （`dsh-desktop-auto-restart` 硬编码 60 秒并发冷却：`dsh-restart` 的 `watchdogCooldownMs`
 * 默认 60000）。⇒ 本仓取 60 秒**有据可依**，不必先验后定。
 *
 * ⚠️ **它是一个导出常量，没有任何「按调用覆盖」的入口**：{@link judgeRestartLoop} 的签名里
 * 既没有 `force`、也没有超时/窗口参数 —— 想改冷却就得改这个常量（维护者 2026-10-14 确认）。
 * 这条是**有意**的：闸①判的是「这件事根本做不成」，不是「用户知情后的选择」。
 */
export declare const RESTART_COOLDOWN_MS = 60000;
/**
 * 「`dshHome` 为空」这条失败 `detail` 的唯一措辞 —— plan 与 recovery 两道守卫共用。
 *
 * 两处此前各写一份逐字字面量（2026-10-16 审计 B7）：同一守卫同一句话，
 * 改一处必漏另一处。判据：红线 B30 的 FORMAT 闭集钉住这句只许住在这里。
 */
export declare const DSH_HOME_EMPTY_DETAIL = "dshHome is empty";
/**
 * marker 的**消费状态**。
 *
 * `armed` = 这次重启还没被消费掉（新进程起来后该去恢复、投 notice，然后转成 `consumed`）；
 * `consumed` = 已经处理过了，剩下的只是一条**审计记录**。
 *
 * ## 为什么是「状态迁移」而不是「删除」
 *
 * 宿主 `fs` 的缝上**没有删除**（`task-31` 真机探针 + 源码双向确认：`delete` / `remove` /
 * `unlink` / `rm` / `rmdir` 一个都不是函数）。维护者 2026-10-14 裁决：**改用状态迁移** ——
 * 它只需要 `writeText`（已实测可用）、**不新增依赖面**、可幂等重放，而且**留痕**
 * （「上次重启什么时候、消费过没有」本身就是审计价值）。
 * 被否决的两条：用 `ctx.shell` 跑 `rm`（更脆、新依赖面）；`editText` 清空当墓碑
 * （marker 会变 `malformed` ⇒ 恢复判 `refuse` ⇒ **把恢复卡死**）。
 */
export type MarkerState = 'armed' | 'consumed';
/**
 * marker 的内容（SHAPE §6.1 / 决策笔记 §三）。
 *
 * `force` 用**可选**而不是 `force: boolean`：`{force: false}` 与「压根没这个键」是两件事
 * （前者是「这次不是覆盖」，后者是「这份 marker 没有覆盖这一栏」）。
 * 三值纪律同样管这里 —— 所以本仓写 marker 时**只在真覆盖过时才放这个键**。
 */
export interface RestartMarker {
    /** 格式版本；不在 {@link SUPPORTED_MARKER_VERSIONS} 里 ⇒ 结构化失败。 */
    version: number;
    /** 为什么重启（工具参数 `reason` 逐字）。 */
    reason: string;
    /** 写 marker 的时刻（ISO 8601 / UTC）。 */
    at: string;
    /**
     * 重启后要**等回来**的会话名单（运行期键形如 `session-<uuid>`）。
     *
     * 它是「等哪些会话」，**不是**「怎么把它们拉起来」：Web profile 没有 `--resume`，
     * resume 的真触发者是客户端重开会话（HOST-CONTRACTS §2.4 的 C9 / C10）。
     */
    sessions: string[];
    /**
     * **发起**这次重启的那个会话（`sessions` 里的某一个）。
     *
     * 为什么必须单独存一个字段，而不是「`sessions[0]`」：{@link buildRestartMarker} 会把
     * `sessions` **排序**（`.sort()`），发起者与其他会话的先后关系在那里就被抹掉了 ——
     * 排序本身是有意的（定序不许随遍历顺序漂，坑 22），所以「谁是发起者」只能显式记。
     *
     * **`reason` 只回发给发起者**（维护者 2026-10-15 拍板）：`reason` 是**用户给自己留的便条**，
     * 不是公告 —— 广播给被顺手打断的其它会话就是**串话**。恢复半据此决定投哪一版 notice。
     *
     * **可选**（与 {@link RestartMarker.state} / `force` 同一套兼容理由）：本字段之前的 marker
     * 没有它。⚠️ **缺席的语义是「不知道谁发起的」，而不是「谁都可以」** —— 恢复半对缺席的 marker
     * **不给任何人**发 `reason`（见 `restart-recovery.ts` 的三值分支）。方向是保守的：这个字段
     * 守的是「不串话」，所以取不到时宁可少说，不可多说。
     */
    initiator?: string;
    /**
     * 消费状态；**缺席 = `armed`**（见 {@link markerState}）。
     *
     * 「缺席」为什么等价于 `armed` 而不是「未知」：`state` 是 `task-32` 新增的字段，
     * 而**它之前的 marker 只可能是在写完全没消费过的那一次**（`task-28` 里根本没有消费这一步）
     * —— 所以缺席只有一种历史含义。而且这个默认方向是**保守**的：把老 marker 当 `armed`
     * 最多多做一次恢复；反过来（当 `consumed`）会**静默丢掉一次恢复**。
     */
    state?: MarkerState;
    /** **只在闸②被真覆盖过时**存在。 */
    force?: true;
    /** 事件轨迹（英文短句）；覆盖与消费都必须在这里留痕。 */
    trace: string[];
}
/**
 * 取 marker 的消费状态（**缺席 = `armed`**，理由见 {@link RestartMarker.state}）。
 *
 * @param marker marker。
 */
export declare function markerState(marker: RestartMarker): MarkerState;
/** 一次文本读取的结果：**「文件不在」与「读失败」是两件事**。 */
export type TextRead = {
    status: 'text';
    text: string;
} | {
    status: 'absent';
} | {
    status: 'unreadable';
    reason: string;
};
/**
 * marker 的 IO 端口（**唯一的 IO 注入点**）。
 *
 * ## 抛不抛（`task-31` 报的措辞不一致，这里改成与实现一致）
 *
 * **`read` 不抛**：读不到就落在 {@link TextRead} 的三值里（`absent` / `unreadable`）——
 * 它对「文件不在」与「读失败」必须分开，而且调用方就是靠这个分界决定「要不要恢复」。
 * **`write` 失败要抛**：本层不吞异常，由入口 {@link planRestart} 收敛成结构化失败
 * （写不出去却报「已就绪」是最坏的一种静默坏）。
 *
 * ## 为什么只有两个方法（没有 `remove`）
 *
 * 宿主 `fs` 的缝上没有删除能力（`task-31` 实测），**端口不该假装能做**。
 * 「消费掉 marker」因此是**状态迁移**：把 `state` 从 `armed` 改成 `consumed` 再写回去
 * （{@link consumeRestartMarker}），走的就是 `write`。
 */
export interface RestartFsPort {
    read(path: string): Promise<TextRead>;
    /** 写不抛的实现是错的：失败必须冒到 {@link planRestart} 的兜底里。 */
    write(path: string, text: string): Promise<void>;
}
/**
 * marker 的绝对路径：`$DSH_HOME/<包名>/restart/marker.json`。
 *
 * ⚠️ **紧跟 `dshHome` 的那一段必须是字符串字面量**：B10 的白名单只认字面量，
 * 写成 `join(dshHome, OWN_NAMESPACE, …)` 会被保守判红（正典表第 43 条）。
 * 改包名要同批改这一行 —— `test/tools/restart.test.ts` 有一条自证盯着「字面量 == `name`」。
 *
 * @param dshHome 宿主数据目录（`$DSH_HOME`）。
 */
export declare function restartMarkerPath(dshHome: string): string;
/**
 * 拉起启动器的绝对路径：`$DSH_HOME/<包名>/restart/relaunch.vbs`。
 *
 * ⚠️ 与 {@link restartMarkerPath} 同一条纪律：紧跟 `dshHome` 的第一段**必须是字符串字面量**
 * （B10 的白名单只认字面量）。
 *
 * **为什么把「真正跑什么」从 `/tr` 挪进这个文件**：`/tr` 的值要先被 `schtasks` 存进任务
 * 定义、再由 Task Scheduler 重放一遍，那两跳里的**引号保真度从未实测过**（原已知限度③）；
 * 文件内容不过那两跳。顺带 `/tr` 从 199 字符掉到 105 字符量级（实测值）。
 *
 * @param dshHome 宿主数据目录（`$DSH_HOME`）。
 */
export declare function restartLauncherPath(dshHome: string): string;
/**
 * 启动器自己的日志落点：`$DSH_HOME/<包名>/restart/relaunch.log`。
 *
 * **为什么必须有**：一条「没跑起来」的拉起此前在任何地方都不留痕 —— 没有窗口、没有 stdout、
 * `startup-*.log` 又只在启动失败时才落盘 ⇒ **失败与「还没到点」长得一模一样**。
 * 这个文件是那条路的唯一留痕，它的路径要进工具的 `key`，否则等于没写。
 *
 * @param dshHome 宿主数据目录（`$DSH_HOME`）。
 */
export declare function restartLauncherLogPath(dshHome: string): string;
/**
 * 可见停止窗口脚本的落点：`$DSH_HOME/<包名>/restart/stop-window-<port>.ps1`。
 *
 * **为什么带端口**：窗口是「一个宿主实例」的影子，不是「一台机器」的影子。两个实例
 * （3080 / 3081）各有自己的脚本、pidfile 与日志，关闭其中一个的窗口只终结它自己那个。
 *
 * ⚠️ 与 {@link restartMarkerPath} 同一条纪律：紧跟 `dshHome` 的第一段**必须是字符串字面量**
 * （B10 的白名单只认字面量）。
 *
 * @param dshHome 宿主数据目录（`$DSH_HOME`）。
 * @param port 这个实例监听的端口（窗口按端口认宿主）。
 */
export declare function restartStopWindowPath(dshHome: string, port: number): string;
/**
 * 停止窗口自己的 pidfile：`$DSH_HOME/<包名>/restart/stop-window-<port>.pid`。
 *
 * 它存在的唯一理由是**单例判据**：启动器在拉起一个新窗口之前先读它、再用 WMI 验活，
 * 活着就什么都不做。没有它，每次重启都会多开一个窗口（实测过：连跑两次启动器 ⇒ 两个窗口）。
 *
 * @param dshHome 宿主数据目录（`$DSH_HOME`）。
 * @param port 实例端口。
 */
export declare function restartStopWindowPidPath(dshHome: string, port: number): string;
/**
 * 停止窗口自己的日志：`$DSH_HOME/<包名>/restart/stop-window-<port>.log`。
 *
 * 与 `relaunch.log` 同一个道理 —— 这个窗口是**可见但不会说话**的：它自己出错（绑不上、
 * Job Object 建不出来）时，唯一留痕就是这份日志。路径要进工具的 `key`，否则等于没写。
 *
 * @param dshHome 宿主数据目录（`$DSH_HOME`）。
 * @param port 实例端口。
 */
export declare function restartStopWindowLogPath(dshHome: string, port: number): string;
/**
 * 停止窗口读的「已发布地址」：`$DSH_HOME/<包名>/restart/url-<port>.txt`。
 *
 * **为什么不把这个落点写进作业文件**：窗口已经拿到 pidfile 的路径
 * （`stop-window-<port>.pid`），而本文件与它同目录、同端口后缀 ⇒ 窗口自己就能推出路径。
 * 少一格动态值意味着 job 序列化、`show-window.vbs`、`launcher.js` 三处都不用改 ——
 * 「同一件事只在一个地方知道」。
 *
 * 内容与语义（含 pid 门控与 token 落盘的代价）见 `src/lib/stop-url.ts`。
 *
 * @param dshHome 宿主数据目录（`$DSH_HOME`）。
 * @param port 这个实例监听的端口。
 */
export declare function restartStopWindowUrlPath(dshHome: string, port: number): string;
/**
 * 拉起作业文件（`job` 文件）的落点：`$DSH_HOME/<包名>/restart/launch-<port>.job`。
 *
 * 端口**定不出来**时退化成 `launch.job`（不带端口后缀）：作业文件本身不需要端口，
 * 只有停止窗口需要。这一格**不抛**，因为重启本身在没有端口时仍然成立。
 *
 * 它只有一项职责：把**动态值**（新宿主的命令、旧进程号、等待上限、各种落点）从 TS
 * 交给仓里的静态资产。格式见 {@link serializeLauncherJob}。
 *
 * **为什么是文件而不是命令行参数**：`/tr` 的取值上限是 261 字符（见
 * {@link ../tools/dsh_restart.ts} 的 `SCHTASKS_TR_MAX_CHARS`），而一个真实的目标命令行
 * 实测已达 269 字符 —— 塞不进 `/tr`。文件内容不过 `schtasks` 存储→重放那两跳。
 *
 * ⚠️ 与 {@link restartMarkerPath} 同一条纪律：紧跟 `dshHome` 的第一段**必须是字符串字面量**
 * （B10 的白名单只认字面量）。
 *
 * @param dshHome 宿主数据目录（`$DSH_HOME`）。
 * @param port 这个实例监听的端口（两个实例各写各的）；`undefined` = 定不出来。
 */
export declare function restartLauncherJobPath(dshHome: string, port: number | undefined): string;
/**
 * 包根下的静态资产路径。
 *
 * ## 为什么用 `import.meta.url` 而不是 `__dirname`
 *
 * 本文件在源码树里是 `src/lib/restart.ts`、编译后是 `lib/lib/restart.js`，**两者都距包根
 * 两级**。于是同一个 `'../../assets'` 在源码与产物里解析到同一个目录 —— 测试（跑源码）与
 * 运行时（跑产物）拿到的是同一份资产，不需要两套写法。
 *
 * 本层**不 import `node:fs`**（`test/tools/restart-fs.test.ts` 钉着这一条）：这里只算路径，
 * 存在性由装配处注入的谓词去探。
 *
 * @param name 资产文件名。
 */
export declare function restartAssetPath(name: string): string;
/**
 * 隐藏启动器 shim（静态 `launcher.vbs`）的绝对路径。
 *
 * 它只做一件事：用 `wscript.exe`（GUI 子系统，无控制台）把 `launcher.js` 隐藏着跑起来。
 * 2026-10-17 实测：`node.exe` 是控制台程序，被计划任务直接跑起来**一定**会开一个可见窗口，
 * 而 `schtasks` 没有隐藏开关 ⇒ 这一跳删不掉，但它不含任何逻辑。
 */
export declare function launcherShimPath(): string;
/**
 * 启动器逻辑（静态 `launcher.js`）的绝对路径。
 *
 * 全部决策都在这里，所以它能单测：等旧 pid 退出、起新宿主（`windowsHide`）、确保停止窗口。
 */
export declare function launcherScriptPath(): string;
/**
 * 可见停止窗口脚本（静态 `stop-window.ps1`）的绝对路径。
 *
 * 它持有一个 `KILL_ON_JOB_CLOSE` 的 Job Object 句柄 ⇒ 关窗口 / Ctrl+C / 强杀都会让内核
 * 终结宿主。这是「新宿主没有控制台」之后唯一可见的停止入口。
 */
export declare function stopWindowScriptPath(): string;
/**
 * `powershell.exe` 的绝对路径（**Windows 系统目录**，不走 PATH）。
 *
 * 与 {@link wscriptPath} 同一个理由：`launcher.js` 由计划任务起，`PATH` 不是交互终端的
 * `PATH`，裸名解析失败时的症状是「窗口没出现」。
 */
export declare function powershellPath(): string;
/**
 * 一个拉起作业的全部动态值。
 *
 * 字段与 `assets/launcher.js` 读的键**一一对应**；这里不做校验（序列化只负责格式），
 * 值的合法性由调用方（`relaunchPlanOf`）保证。
 */
export interface LauncherJob {
    /** `node.exe` 的绝对路径（shim 用它起 `launcher.js`）。 */
    node: string;
    /** `launcher.js` 的绝对路径。 */
    launcher: string;
    /** 启动器日志；窗口与启动器共用它以外的两份，日志在这里。 */
    log: string;
    /** 等旧进程退出的上限（毫秒）。 */
    capMs: number;
    /** 旧进程号：启动器等的就是它消失。 */
    oldPid: number;
    /** 新宿主的可执行文件（绝对路径）。 */
    command: string;
    /** 新宿主的参数（逐项，不走 shell ⇒ 没有引号规则）。 */
    args: readonly string[];
    /** 新宿主的工作目录。 */
    cwd: string;
    /** 新宿主的 `DSH_HOME`（以环境变量传递，不拼进命令行）。 */
    dshHome: string;
    /** `powershell.exe` 的绝对路径。 */
    powershell: string;
    /** `wscript.exe` 的绝对路径（两个 shim 都要用它）。 */
    wscript: string;
    /** 让窗口可见的那一跳（`show-window.vbs`）。 */
    showWindow: string;
    /** 作业文件自己的绝对路径（两个 shim 都只收路径，不收命令行）。 */
    job: string;
    /**
     * 停止窗口的完整命令行，写进作业文件、由 `show-window.vbs` 原样交给 `Shell.Run`。
     *
     * ⚠️ 它**不能**当 argv 传给 VBS：Node 会把参数里的双引号转义成反斜杠加引号，而
     * `wscript` 的参数解析器不还原 ⇒ 命令串带反斜杠进去、`Shell.Run` 静默失败，
     * 症状只是「没有窗口」。2026-10-17 实测：同一个串由 PowerShell 直传能起，由
     * `node` 的 `spawn` 传就起不来。
     */
    stopWindowCommand?: string;
    /**
     * 停止窗口脚本。
     *
     * 下面五格**一起缺席**表示「这一次不创建停止窗口」（端口定不出来）。这不是省略号式的
     * 偷懒：`launcher.js` 靠「`stopWindowPort` 是不是正数」来决定拉不拉窗口，
     * 而半套字段（有脚本没端口）只会让它去绑一个不存在的端口。
     */
    stopWindow?: string;
    /** 停止窗口的 pidfile（单例判据）。 */
    stopWindowPid?: string;
    /** 停止窗口的日志。 */
    stopWindowLog?: string;
    /** 停止窗口盯的端口。 */
    stopWindowPort?: number;
    /** marker 落点：停止窗口用它区分「重启途中」与「被人停了」。 */
    markerPath: string;
}
/**
 * 把 {@link LauncherJob} 序列化成 `key=value` 的行文本。
 *
 * 三条有意的选择：
 * - **一行一个键**：`launcher.vbs` 要用 VBScript 读它，而 VBScript 没有 JSON 解析器。
 *   shim 只读前两个键（`node` / `launcher`），其余原样交给 `launcher.js`。
 * - **`args` 用 JSON 数组**：参数里可能有空格、引号、`&`、`=`。`key=value` 的切分只按
 *   **第一个** `=` 切，值里再有 `=` 也不影响；而 JSON 数组是唯一能无损承载「带空格的
 *   参数列表」又不必让 VBScript 去解析的形态。
 * - **值是单行的**：换行会把一个键拆成两行，让 `launcher.js` 读到半截值。
 *   参数里真有换行是极端的，此时行为是「读到一个坏键」，方向是**不启动**而不是乱启动。
 *
 * @param job 动态值。
 */
export declare function serializeLauncherJob(job: LauncherJob): string;
/**
 * `wscript.exe` 的绝对路径（**Windows 系统目录**，不走 PATH）。
 *
 * 用绝对路径而不是裸名：`/tr` 的值由 Task Scheduler 重放，那里的 `PATH` 不是本进程的
 * `PATH`，裸名会解析失败 —— 而失败形态是「任务跑了但什么都没起」。
 */
export declare function wscriptPath(): string;
/**
 * 这台机器上有没有可用的隐藏启动器（`wscript.exe`）。
 *
 * ⚠️ **它决定「这次拉起会不会弹窗」，不是「这次拉起能不能成」**：没有它时回退到
 * `cmd /c` 形态（能起、但会创建一个可见控制台）。VBScript 已被微软标记弃用
 * （Windows 11 24H2 起是可按需移除的功能），所以这一格必须有回退而不是假定存在。
 *
 * **本层不做这个判断**（本文件不 import `node:fs` —— 那会踩 B10，见 `restart-fs.test.ts`
 * 那条「两个模块都不 import node:fs」）：探存在性是 IO，由调用方（工具层）用
 * {@link wscriptPath} 自己判。
 *
 * @param exists 探路径是否存在的函数（工具层注入，测试可替身）。
 */
export declare function hiddenLauncherAvailable(exists: (path: string) => boolean): boolean;
/**
 * 把 marker 序列化成落盘文本。
 *
 * 三个细节都是有意的：
 * ① **键序固定、`version` 在最前** —— 读的人第一眼就能判格式版本；
 * ② **可选键缺席就不写**（`state` / `force`）—— `缺席 ≠ 显式 false`，且往返要无损；
 * ③ 末尾补一个换行 —— 文件是给人看的，`diff` / `cat` 都受益。
 *
 * @param marker marker。
 */
export declare function serializeMarker(marker: RestartMarker): string;
/** 解析一份 marker 文本的结果（三值：认识 / 版本不认识 / 格式坏）。 */
export type MarkerParse = {
    status: 'ok';
    marker: RestartMarker;
} | {
    status: 'unsupported-version';
    version: unknown;
} | {
    status: 'malformed';
    reason: string;
};
/**
 * 解析一份 marker 文本。
 *
 * **绝不抛**。三条分支的边界要划准：
 * - **有 `version` 但不是数字** ⇒ `malformed`（这份东西根本不是我们写的格式）；
 * - **是数字但不在支持集** ⇒ `unsupported-version`（我们写的，但来自另一个格式版本）；
 * - 其余字段缺 / 类型不对 ⇒ `malformed`。
 *
 * @param text marker 文件的全文。
 */
export declare function parseMarker(text: string): MarkerParse;
/** 读 marker 的结果：**五值**（缺席 / 认识 / 版本不支持 / 格式坏 / 读失败）。 */
export type MarkerRead = {
    status: 'absent';
} | {
    status: 'ok';
    marker: RestartMarker;
} | {
    status: 'unsupported-version';
    version: unknown;
} | {
    status: 'malformed';
    reason: string;
} | {
    status: 'unreadable';
    reason: string;
};
/**
 * 读 marker。**绝不抛**。
 *
 * @param fs marker 的 IO 端口。
 * @param dshHome 宿主数据目录。
 */
export declare function readRestartMarker(fs: RestartFsPort, dshHome: string): Promise<MarkerRead>;
/**
 * 写 marker（**必须在拉起新进程之前完成** —— 顺序是判据，见 SHAPE §6.1 的流程图）。
 *
 * 失败会抛：调用方 {@link planRestart} 把它收敛成结构化失败，并且**不拉起任何东西**。
 *
 * @param fs marker 的 IO 端口。
 * @param dshHome 宿主数据目录。
 * @param marker marker。
 * @returns 实际写到的路径（进 `key` / `audit` 用）。
 */
export declare function writeRestartMarker(fs: RestartFsPort, dshHome: string, marker: RestartMarker): Promise<string>;
/**
 * **消费** marker —— 「校验通过之后」调（读到就消费会把半处理的 marker 提前标掉，
 * 那之后再也认不出它还没恢复完；决策笔记 §六）。
 *
 * 实现是**状态迁移**而不是删除（宿主 `fs` 没有删除，见 {@link MarkerState}）：
 * 把 `state` 改成 `consumed`、往 `trace` 追加一条留痕，然后写回同一个路径。
 * 它是**幂等**的：对一份已经 `consumed` 的 marker 再调一次，写回去的还是 `consumed`。
 *
 * 失败**抛**（由调用方收敛）—— 写不回去却报「已消费」会让下一次启动重复恢复。
 *
 * @param fs marker 的 IO 端口。
 * @param dshHome 宿主数据目录。
 * @param marker 要消费的那份 marker（通常是刚读回来并校验过的那一份）。
 * @param now 现在（毫秒纪元）；只为留痕与测试注入。
 * @returns 实际写回去的那份 marker（已带 `state: 'consumed'`）。
 */
export declare function consumeRestartMarker(fs: RestartFsPort, dshHome: string, marker: RestartMarker, now: number): Promise<RestartMarker>;
/**
 * 造一份「已消费」的 marker（**纯函数**，不碰 IO）。
 *
 * 三件事：`state` 置成 `consumed`、`at` **原样保留**（那是「这次重启发生在什么时候」，
 * 是审计事实，不是「这份文件最后一次被改的时间」）、`trace` 追加一条带时刻的留痕。
 *
 * @param marker 原 marker。
 * @param now 现在（毫秒纪元）。
 */
export declare function markerAfterConsumption(marker: RestartMarker, now: number): RestartMarker;
/** 四道闸的标识（顺序即判定顺序）。 */
export type GateId = 'restart-loop' | 'busy-session' | 'composition' | 'launch-command';
/** 拒绝码 —— **闭集**，与 SHAPE §6.1 的表一一对应。 */
export type RefusalCode = 'restart-loop' | 'busy' | 'bad-composition' | 'no-launch-command'
/**
 * 闸④的第二档：**这个载体根本没有已实测的回归路线**。
 *
 * 与 `no-launch-command` 分开是判据上的硬要求（2026-10-15 真机缺陷）：
 * 「命令拼不出来」是**取值**问题（再试、改配置都可能变），而「载体带不回来」是
 * **现实**问题（桌面宿主上插件压根没有通道，重试一万次也一样）。压成一码，
 * 模型会去反复重试一个结构上做不到的动作。
 */
 | 'no-relaunch-route';
/**
 * 一个观测的三值形状。
 *
 * 这不是「可有可无的包装」：它是 `取不到` 与 `取到了、值是空」这两件事在类型上的分界。
 * 压成一个 `T | undefined` 就等于把三值压成两值，而压出来的那一格会静默地判成「没问题」。
 */
export type Observed<T> = {
    known: true;
    value: T;
} | {
    known: false;
    reason: string;
};
/** 一道闸放行。 */
export interface GatePass {
    gate: GateId;
    passed: true;
    /** 一句英文事实（进 L2 / `audit`）。 */
    detail: string;
    /**
     * **只有闸②**可能带：这次是显式覆盖过的（真要写进 marker 的留痕）。
     *
     * 它同时是「有没有发生覆盖」的开关 —— 没有它就没有 `force: true`、也没有 `blockedSessions`。
     */
    overrideTrace?: string;
    /** 被覆盖打断的**会话**（marker 的等待名单来源；数据，不是从 `overrideTrace` 里回读字符串）。 */
    blockedSessions?: readonly string[];
}
/** 一道闸拒绝：**哪个闸 + 为什么 + 怎么解**三件都要有。 */
export interface GateRefusal {
    gate: GateId;
    passed: false;
    code: RefusalCode;
    /** 为什么（英文，会逐字进 `data.verdict`）。 */
    verdict: string;
    /** 怎么解（英文，进 `nextStep.why`）。 */
    remedy: string;
    /** 这条拒绝涉及的对象（阻塞者 / 解析失败的来源），进 L2 与 `audit`。 */
    evidence: readonly string[];
    /** 建议下一步要调的工具（闸③指路 `dsh_dump_config`）。 */
    suggestedTool?: string;
    /** 没有工具可调、要用户自己做点什么（闸④）。 */
    manual?: true;
}
/** 一道闸的判定。 */
export type GateDecision = GatePass | GateRefusal;
/**
 * 归一化会话 id。
 *
 * 运行期键是 `session-<uuid>`，而调用方常传裸 uuid（HOST-CONTRACTS §2.3）——
 * 不补前缀就会把「调用方自己」当成「别人」，于是每一次重启都被自己的会话拒掉。
 * 形状不合法时返回空串，由调用方**据此判失败**（不猜）。
 *
 * @param raw 原始 id。
 */
export declare function normalizeSessionId(raw: string): string;
/** 闸①的输入。 */
export interface RestartLoopInput {
    /** 已知的历史重启时刻（毫秒纪元）。空数组 = 读过、没有。 */
    history: Observed<readonly number[]>;
    /** 现在（毫秒纪元）。**只读一次**，免得同一棵树两次读给出不同结论。 */
    now: number;
}
/**
 * 闸①：重启循环熔断。
 *
 * 签名里没有 `force` —— 这是**结构性**的「不可绕过」。
 *
 * @param input 历史与当前时刻。
 */
export declare function judgeRestartLoop(input: RestartLoopInput): GateDecision;
/**
 * 一个「忙」的来源。
 *
 * ## 为什么不是「一串会话 id」
 *
 * 契约（HOST-CONTRACTS §2.3 的忙判定语义）只把**调用方自己那个会话的回合**排除，
 * **后台作业与定时提醒照旧全算 —— 包括调用方自己的那些**。
 * 一串裸 id 表达不了这件事：那样一个属于调用方的作业会被当成「自己」而被排除，
 * 而方向恰好是危险的那一边（少算一个阻塞者 = 打断一件没人知道在跑的事）。
 */
export type BusySource = 
/** 某个会话正在跑一个回合。 */
{
    kind: 'turn';
    sessionId: string;
}
/** 一个在跑的作业（后台任务）；`ownerSession` 是它的属主（可缺）。 */
 | {
    kind: 'job';
    jobId: string;
    ownerSession?: string;
}
/** 一个已武装的定时提醒；`ownerSession` 是它的属主（可缺）。 */
 | {
    kind: 'schedule';
    scheduleId: string;
    ownerSession?: string;
};
/** 闸②的输入。 */
export interface BusySessionInput {
    /** 当前忙的来源（**含调用方自己**；判据只排除「调用方自己的回合」）。 */
    busy: Observed<readonly BusySource[]>;
    /** 发起本次调用的会话（裸 uuid 或 `session-<uuid>` 都行）。 */
    callingSession: string;
    /** 显式覆盖 —— **只对这一道闸有效**。 */
    force: boolean;
}
/**
 * 闸②：别的会话在飞。
 *
 * 四条边界，每条都有它自己的理由：
 * 1. **取不到忙闲状态 ⇒ 拒绝**（fail-closed）。不是洁癖：判成「不忙」会去打断别人的回合，
 *    而那是**不可逆**的；
 * 2. **只排除「调用方自己的那个回合」** —— 调用方主动重启，它自己那一次不算受害者；
 *    但**属于它的作业 / 定时提醒照旧算忙**（契约 §2.3：后台任务与定时提醒全算，含调用方自己的）；
 * 3. **`force` 不能覆盖「取不到」** —— 覆盖的前提是「用户知道自己要打断谁」，
 *    连谁在飞都不知道时，`force` 不是一个知情的选择；
 * 4. **认不出来的东西当阻塞者**（安全优先）：归一化不了的会话 id 不丢，留下。
 *
 * @param input 忙闲观测、调用方会话、是否覆盖。
 */
export declare function judgeBusySession(input: BusySessionInput): GateDecision;
/** 闸③的输入。 */
export interface CompositionInput {
    /** profile 的 bundle 表解析结果。`known: false` = 解析不了。 */
    bundles: Observed<readonly string[]>;
}
/**
 * 闸③：bundle 表解析不了。
 *
 * 解析不了就不许重启 —— 一个载入不了组合的宿主比现在这个更糟，而 `dsh_dump_config`
 * 正是「看清组合到底解析成什么」的那个工具（指路而不是让模型自己猜）。
 *
 * @param input bundle 表观测。
 */
export declare function judgeComposition(input: CompositionInput): GateDecision;
/** 一条启动命令。 */
export interface LaunchCommand {
    /** 可执行文件（绝对路径或 PATH 上的名字）。 */
    command: string;
    args: readonly string[];
    /** 工作目录。 */
    cwd: string;
}
/** 闸④的输入。 */
export interface LaunchCommandInput {
    /** 启动命令的解析结果。`known: false` = 定不出来。 */
    launch: Observed<LaunchCommand>;
    /**
     * 这个宿主是被谁拉起来的（`lib/carrier.ts` 的观测）。
     *
     * **它不是「又一份关于命令的输入」**：它回答的是另一维问题 —— 「就算命令拼得出来，
     * 有没有人能把它拉回来」。2026-10-15 的真机缺陷正是因为这一维从没被建模：
     * 桌面宿主上命令**拼得出来**（而且拼错了 profile），于是闸④放行、宿主退出、没人回来。
     */
    carrier: CarrierObservation;
}
/**
 * 闸④：能不能把宿主拉回来。
 *
 * **先问路线，再问命令** —— 顺序是判据，不是风格：反过来就会出现「命令拼得好好的、
 * 于是放行」那条真机路径（桌面宿主上 `argv` 齐全，拼出来的却是另一个 profile）。
 *
 * 两档拒绝的理由各写各的：
 * - **路线为 `none`** ⇒ `no-relaunch-route`：这个载体**结构上**没有通道
 *   （桌面端只有 Electron 壳能 `app.relaunch()`；非 win32 没有已实测路线；认不出来不猜）。
 *   `verdict` / `remedy` 逐字来自 `relaunchRefusalFor`（三档措辞只写在那里一处）。
 * - **路线为 `task-scheduler`、但拿不到命令** ⇒ `no-launch-command`：**不猜**。
 *   猜错的代价是进程没了、也没人把它拉回来 —— 那是这套东西里唯一不可逆的失败。
 *
 * @param input 启动命令观测 + 载体观测。
 */
export declare function judgeLaunchCommand(input: LaunchCommandInput): GateDecision;
/** `planRestart` 的请求面（工具参数 → 这里的映射由工具半边做）。 */
export interface RestartRequest {
    /** `$DSH_HOME`（marker 落点的第一段）。 */
    dshHome: string;
    /** 为什么重启（逐字进 marker）。 */
    reason: string;
    /** 发起本次调用的会话。 */
    callingSession: string;
    /** 显式覆盖闸②。 */
    force: boolean;
    /** 只演练、不落盘。 */
    dryRun: boolean;
    /**
     * 这个宿主是被谁拉起来的（闸④的第一问）。
     *
     * **必填**：可选会让「没传」与「传了 `unknown`」在类型上不可分，而前者是接线漏了
     * （本插件的 bug）、后者是一条真结论。两者对判据的意义完全不同 —— 与
     * `ToolDeps.carrier` 同一条纪律。
     */
    carrier: CarrierObservation;
}
/**
 * `planRestart` 的 IO 端口 —— **本层唯一的取数面**。
 *
 * 真实实现由工具半边接到宿主服务上（`agents.list` 的 `status` / `jobs.list` /
 * `workspace/session-activity` / profile 的 `package.json` / `process.argv`）。
 * 每个方法都**不该抛**；抛了由 {@link planRestart} 收敛成结构化失败。
 */
export interface RestartPorts {
    /** marker 的读写端口。 */
    fs: RestartFsPort;
    /** 闸①：历史重启时刻（毫秒纪元）。 */
    restartHistory(): Promise<Observed<readonly number[]>>;
    /** 闸②：当前忙的来源（会话回合 / 后台作业 / 定时提醒，**含调用方自己的**）。 */
    busySessions(): Promise<Observed<readonly BusySource[]>>;
    /** 闸③：profile 的 bundle 表。 */
    bundles(): Promise<Observed<readonly string[]>>;
    /** 闸④：启动命令。 */
    launchCommand(): Promise<Observed<LaunchCommand>>;
    /** 现在（毫秒纪元）；只为测试注入。 */
    now(): number;
}
/** 四道闸全过、marker 已按 `dryRun` 处理。 */
export interface RestartPlanReady {
    kind: 'ready';
    /** 这次是演练（没有落盘）。 */
    dryRun: boolean;
    /**
     * marker 真的落盘了吗。
     *
     * **工具半边的顺序判据**：只有它为 `true` 才允许拉起新进程；为 `false`（演练）时
     * 不许拉起、也不许让本进程退出。这就是 SHAPE §6.1 那句「写 marker 必须在拉起之前」
     * 在接口上的落点 —— 不是一句注释。
     */
    markerWritten: boolean;
    marker: RestartMarker;
    markerPath: string;
    /** 拉起新进程要用的命令（本层不执行）。 */
    launch: LaunchCommand;
    /** 模型读到的 L1。 */
    verdict: string;
}
/** 被某一道闸拒绝。 */
export interface RestartPlanRefused {
    kind: 'refused';
    /** 是哪一道闸。 */
    gate: GateId;
    code: RefusalCode;
    verdict: string;
    remedy: string;
    evidence: readonly string[];
    /** 它之前已经过了的闸（拒绝时「走到了哪一步」比「四道闸」更准）。 */
    gatesPassed: readonly GateId[];
    suggestedTool?: string;
    manual?: true;
}
/** 本层自己的意外（**不是**闸门拒绝）。 */
export interface RestartPlanFailed {
    kind: 'failed';
    verdict: string;
    detail: string;
}
/** `planRestart` 的结果。 */
export type RestartPlan = RestartPlanReady | RestartPlanRefused | RestartPlanFailed;
/**
 * 四道闸 + marker 落盘的**唯一入口**。
 *
 * 判据函数被测**不等于**接进了入口（本仓坑 42 的接线断言就是治这个的），所以
 * 测试里凡涉及「拒绝」与「放行」的用例都从这里进。
 *
 * 顺序：闸① → 闸② → 闸③ → 闸④ → 建 marker →（`dryRun` 则止步）→ 写 marker。
 * **任一闸不过即拒绝，且一次都不许写** —— 留下半份 marker 会让下一次启动去恢复一个
 * 从未发生的重启。
 *
 * **绝不抛**（B24 的承载条件）：端口抛异常也收敛成 {@link RestartPlanFailed}。
 *
 * @param request 请求面。
 * @param ports IO 端口。
 */
export declare function planRestart(request: RestartRequest, ports: RestartPorts): Promise<RestartPlan>;
/**
 * 建一份 marker。
 *
 * `overrideTrace` **没有真覆盖就不许传** —— 有它才有 `force: true`，两者同进同出，
 * 于是「`force` 命中必须留痕」是结构性的：不可能出现「记了覆盖却没留痕」的 marker。
 *
 * @param input 内容。
 */
export declare function buildRestartMarker(input: {
    reason: string;
    now: number;
    sessions: readonly string[];
    /**
     * 发起这次重启的会话（已 `normalizeSessionId`）。**必填**：类型上强制每个建 marker 的地方
     * 都说清「是谁要重启」，否则 `reason` 回发给谁就成了猜的。
     *
     * 传空串 = 发起者未知 ⇒ **该键不写出**（`initiator` 缺席的语义正是「不知道是谁」，
     * 见 {@link RestartMarker.initiator}）—— 于是恢复半不会把 `reason` 发给任何人。
     */
    initiator: string;
    /** 四道闸的轨迹。 */
    gates: readonly string[];
    /** 闸②被真覆盖时的留痕（只在真覆盖时传）。 */
    overrideTrace?: string;
}): RestartMarker;
/** 恢复判定的结果。 */
export type RecoveryDecision = 
/**
 * 无事可做。**两种原因必须分得开**（防空转：它们的渲染/取值不同）：
 * `absent` = 根本没有 marker；`consumed` = 有，但已经处理过了（还带着那份审计记录）。
 */
{
    action: 'none';
    reason: 'absent';
} | {
    action: 'none';
    reason: 'consumed';
    marker: RestartMarker;
    verdict: string;
} | {
    action: 'recover';
    marker: RestartMarker;
    /** 要等回来的会话名单。 */
    sessions: readonly string[];
    /** 这次是覆盖过的（下一次启动仍应把这件事说出去）。 */
    overridden: boolean;
    verdict: string;
} | {
    action: 'refuse';
    code: 'unsupported-version' | 'malformed' | 'unreadable';
    verdict: string;
    remedy: string;
    evidence: readonly string[];
};
/**
 * 恢复判定：**启动时**拿着一次 marker 读取的结果，决定接下来做什么。
 *
 * ⚠️ 这里只有判定，**没有落地执行**（真正「等会话 → 投 notice → 消费 marker」在工具半边）。
 * 判定的核心是一条三值纪律：**「读到了但没懂」不是「没有」**——
 * 压成 `none` 就等于静默放弃恢复，而人看到的只是一次「正常」启动。
 *
 * 三个「`none` 邻居」的边界要划准（`task-32`）：
 * - **`absent`** ⇒ `none`（没有待办）；
 * - **`consumed`** ⇒ `none`，但**带上那份 marker 与一句话**（「已经处理过了」是审计事实，
 *   与「什么都没有」不是一回事）；
 * - **`unsupported-version` / `malformed` / `unreadable`** ⇒ **`refuse`**，绝不是 `none`。
 *
 * @param read 一次 marker 读取。
 */
export declare function decideRecovery(read: MarkerRead): RecoveryDecision;
/**
 * 让窗口**可见**的那一跳（静态 `show-window.vbs`）的绝对路径。
 *
 * ## 为什么需要它（实测，不是推断）
 *
 * Node 无法向 Windows 请求 `CREATE_NEW_CONSOLE`：
 * - `spawn(..., { detached: true })` 在 Windows 上映射成 `DETACHED_PROCESS` ⇒ **完全没有**
 *   控制台（这正是拉起宿主时想要的）；
 * - 不 detached 的子进程则**继承父进程的控制台** —— 而父进程是个无控制台的宿主 ⇒
 *   子进程也没有控制台。
 *
 * 于是「从一个无控制台的进程里开出一个**可见**窗口」只能靠这一跳：`wscript.exe` 是
 * GUI 子系统程序，`Shell.Run` 用窗口样式 **1**（normal）会要一个新可见控制台。
 *
 * 它与 {@link launcherShimPath} 是同一对原语的两半：那边要样式 **0**（隐藏），这边要 1。
 * 两个文件都不含逻辑。
 */
export declare function showWindowShimPath(): string;
//# sourceMappingURL=restart.d.ts.map