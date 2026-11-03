/**
 * 进程识别 —— **按端口**查，不用命令行子串。
 *
 * 为什么这是硬规矩（SKILL §3.5）：用 `*bin.js*` 之类的命令行子串过滤会**误匹配派生 shell**
 * （宿主为每个终端派生一个字进程，它的命令行里带着父进程的脚本路径），
 * 于是「找到多个宿主进程」这种假象会让你去杀错东西。按端口查监听者没有这个问题。
 *
 * ## 三个平台、三张 socket 表
 *
 * | 平台 | 命令 | 行形状 |
 * |---|---|---|
 * | win32 | `powershell.exe` + `Get-NetTCPConnection` | 自造 `pid\|name\|startedAt` |
 * | linux | `ss -ltnp`，兜底 `ss -ltn` | `State … Local Address:Port … users:(("node",pid=N,fd=M))` |
 * | darwin | `lsof -nP -iTCP:<port> -sTCP:LISTEN`，兜底 `netstat -an` | `COMMAND PID … TCP addr:port (LISTEN)` / `tcp4 0 0 127.0.0.1.3080 *.* LISTEN` |
 *
 * **一条纪律贯穿三条分支：不按列号取值，按「值」取值。**
 * `ss` 的列会随版本加（`-e` 会多出几列）、`lsof` 的最后一列本身含空格
 * （`TCP 127.0.0.1:3080 (LISTEN)`），所以两个解析器都**先认出这一行属于哪个端口的行**，
 * 再从整行里正则取 pid —— 写死 `fields[3]` 那种写法在版本一变就静默读错列。
 */
import type { SpawnImpl } from './exec.js';
/** 一个监听者。 */
export interface PortListener {
    pid: number;
    processName: string;
    /** 进程启动时间（ISO 8601）；读不到（权限不足等）时为 `undefined`。 */
    startedAt?: string;
}
/** 按端口查询的结果。 */
export interface PortLookupResult {
    port: number;
    /** 端口上是否有监听者。 */
    listening: boolean;
    listeners: PortListener[];
    /**
     * 探测本身是否**跑成功**。
     *
     * `false` 表示「没查到」不是「没有」—— 命令没装、形状认不出、缺 PowerShell 时是这种。
     * 这个区分很重要：把「查不了」当成「没启动」会让工具给出反向结论。
     */
    probed: boolean;
    /**
     * 一句可读说明。
     *
     * **`probed: false` 时一律以平台标识开头**（`win32:` / `linux:` / `darwin:`）。
     * 那是这份说明里**唯一稳定不变**的部分 —— 判据认它，不认后面那句文案
     * （文案会随实现改，认文案就等于让判据跟着实现漂）。
     */
    detail: string;
}
/** 查监听端口用的 shell。**仅 Windows 分支用**；别的平台见 {@link portLookupPlan}。 */
export declare const PORT_LOOKUP_SHELL = "powershell.exe";
/** Linux 分支的主命令。 */
export declare const LINUX_LOOKUP_COMMAND = "ss";
/** darwin 分支的主命令。 */
export declare const DARWIN_LOOKUP_COMMAND = "lsof";
/** darwin 分支的兜底命令（不带进程信息）。 */
export declare const DARWIN_FALLBACK_COMMAND = "netstat";
/**
 * win32 分支的兜底命令（`netstat -ano`）。
 *
 * 与 {@link DARWIN_FALLBACK_COMMAND} 是**同一个可执行文件**、不同参数与不同输出形状：
 * Windows 上 `Get-NetTCPConnection` 依赖 `NetTCPIP` 这个 PowerShell 模块，精简系统 /
 * Server Core / 某些容器镜像上它压根不在 —— 而 `netstat.exe` 一直都在。
 */
export declare const WINDOWS_FALLBACK_COMMAND = "netstat";
/**
 * 造查询脚本（**仅 Windows 分支**）。
 *
 * 输出每行 `pid|processName|startedAt`，让一次进程调用拿全所需字段 ——
 * 分多次调用既慢，又会在两次调用之间让「进程表变了」成为可能。
 *
 * @param port 目标端口。
 */
export declare function portLookupScript(port: number): string;
/**
 * 解析脚本输出（**仅 Windows 分支**）。
 *
 * @param stdout 脚本的标准输出。
 */
export declare function parsePortLookup(stdout: string): PortListener[];
/** 一张 socket 表的解析结果。 */
export interface ParsedSocketTable {
    /** 解析出 pid 与进程名的监听者（按首次出现的顺序，同 pid 只留一条）。 */
    listeners: PortListener[];
    /**
     * 端口上**确有监听、但输出里读不到 pid** 的行数。
     *
     * 这一栏是「读不到」与「没有」的**分界**：`ss -ltn`（无 `-p`）、非 root 跑 `ss -ltnp`、
     * `netstat -an` 全都落在这里。把它们压成「没人听」就是**反向结论** ——
     * 那正是本仓反复记的「把『查不了』当成『没启动』」那一族。
     */
    unidentified: number;
    /**
     * **认得的**行数（**表头 + 数据行**，不限端口）。
     *
     * 判据全靠它区分两种「没查到」：输出是**一张我认得的表**（真没人听）还是
     * **根本不是这张表**（命令跑起来了但输出的形状不对，例如被喂了一段 `pid|name|start`）。
     * 没有这一栏，后者会被当成前者 —— 那是一条静默的反向结论。
     *
     * **表头也算**：`ss -ltnp` 在目标端口没人听时照样打印表头，
     * 那张 stdout 非空的空表是「读懂了、确实没人听」的**正面证据**，
     * 不算进去就会把最常见的情形误判成「输出形状不对」。
     */
    rows: number;
}
/** 一个平台上的一次查询尝试（一条命令 + 它的输出解析器）。 */
export interface PortLookupAttempt {
    /** 可执行文件名。 */
    command: string;
    /** 参数。 */
    args: readonly string[];
    /**
     * 输出解析器（**纯函数**）。
     *
     * 纯函数是刻意的：三条分支的解析逻辑都能单独单测，变异测试也才有着力点
     * （对着 spawn 替身做变异只能证明「命令被调了」，证明不了「列读对了」）。
     *
     * @param stdout 命令的标准输出。
     */
    parse: (stdout: string) => ParsedSocketTable;
}
/** 一个平台的查询方案：按顺序试，**第一次「可信」的结果就用它**。 */
export interface PortLookupPlan {
    /** 平台标识（进 `detail`）。 */
    platform: string;
    attempts: readonly PortLookupAttempt[];
}
/**
 * 解析 `ss -ltnp` / `ss -ltn` 的输出。
 *
 * ## 输出形状假设（全部有对应断言）
 *
 * 1. 一行一表项，空白分隔；
 * 2. 首列是状态，监听态逐字为 `LISTEN`（`-l` 保证）；首列为 `State` 的是表头
 *    （**表头计入 `rows`**：空表也是「读懂了」的正面证据）；
 * 3. **端口取本地地址那一列**，且那一列的下标由 `Recv-Q`/`Send-Q` 必须是数字来**自校验**
 *    （理由见 {@link SS_LOCAL_ADDRESS_INDEX}）；
 * 4. 进程信息形如 `users:(("node",pid=1234,fd=20))`，可出现多组（SO_REUSEPORT 的多个进程）。
 *    `pid=` 的个数与进程名不一定相等（名字被 `ss` 省略时），所以名字按下标配、
 *    配不上就退回**最后一个已知名字**，再没有才是 `(unknown)`；
 * 5. **没有 `users:` 那一段时（`ss -ltn`、或非 root 跑 `-p`）不能当成「没人听」** ——
 *    记成 `unidentified`（端口上有东西，只是读不到 pid）。
 *
 * ## 两段式（这是 `rows` 的意义所在）
 *
 * 先**认行**（这一行是不是我认识的数据行）再**匹配端口**（这一行是不是目标端口）。
 * 顺序反了会把「这张表我读懂了，只是没有目标端口的行」误判成「这张表我读不懂」——
 * 而 `ss -ltnp` 在目标端口没人听时**照样打印表头**（stdout 非空），
 * 于是那正是「Linux 上端口没被占用」这个最常见的情形会报成 `probed: false`。
 *
 * @param stdout `ss` 的标准输出。
 * @param port 目标端口。
 */
export declare function parseSsOutput(stdout: string, port: number): ParsedSocketTable;
/**
 * 解析 `lsof -nP -iTCP:<port> -sTCP:LISTEN` 的输出。
 *
 * ## 输出形状假设（全部有对应断言）
 *
 * 1. 首行是表头（首列 `COMMAND`），跳过；
 * 2. **前两列**是进程名与 pid —— 这两列是 `lsof` 唯一稳定的左对齐列，
 *    后面几列的宽度会随内容变，所以**不按列号取别的**；
 * 3. 末列含空格（`TCP 127.0.0.1:3080 (LISTEN)`），所以判定「监听态且端口对得上」
 *    走**整行的尾部形状**，不是按空格切；
 * 4. 端口过滤由 `-iTCP:<port>` 承担，但**这里仍按值复核一遍**：
 *    万一命令被换掉、被 shell 吃掉了一个参数，宁可少报也不要**认错别人的监听者**。
 *
 * 与 {@link parseSsOutput} 同样是两段式（先认行、再匹配端口），理由见那里。
 *
 * @param stdout `lsof` 的标准输出。
 * @param port 目标端口。
 */
export declare function parseLsofOutput(stdout: string, port: number): ParsedSocketTable;
/**
 * 解析 `netstat -an` 的输出（**darwin 的最后一档兜底**）。
 *
 * ## 输出形状假设（全部有对应断言）
 *
 * 1. 表头首列是 `Proto`（**计入 `rows`**）；unix 域那一段的行首不是 `tcp`，也跳过；
 * 2. 监听态在**最后一列**逐字为 `LISTEN`；
 * 3. 本地地址是**倒数第二列那一类** token（`127.0.0.1.3080` / `*.3080` / `::1.3080`），
 *    对端是 `*.*` —— 端口按值匹配（`.` 后取数字，`*` 匹配不上）；
 * 4. **`netstat` 不给 pid**，所以命中的行**一律**进 `unidentified`：
 *    「知道有人在听、不知道是谁」是如实的结论，不是失败。
 *
 * 与 {@link parseSsOutput} 同样是两段式（先认行、再匹配端口），理由见那里。
 *
 * @param stdout `netstat` 的标准输出。
 * @param port 目标端口。
 */
export declare function parseNetstatOutput(stdout: string, port: number): ParsedSocketTable;
/**
 * 取某个平台的查询方案。
 *
 * **返回 `undefined` 就是「这个平台没有命令」**（`aix` / `freebsd` / `sunos` …），
 * 调用方据此给 `probed: false` —— 那不是「端口上没人」，是「查不了」。
 *
 * 兜底的用意不是「主命令一定失败」，而是主命令**本身不可用**：
 * Linux 上 `ss -ltnp` 与 `ss -ltn` 是同一个二进制，所以真正救场的是
 * 「`-p` 不被支持 / 权限不足导致非零退出」那种构建；darwin 上则是
 * `lsof` 缺失（精简安装里常见）时由 `netstat -an` 顶上；
 * **win32 上是 `Get-NetTCPConnection` 缺 `NetTCPIP` 模块**（精简系统 / Server Core /
 * 某些容器镜像上压根没有）时由 `netstat -ano` 顶上 —— `netstat.exe` 一直都在。
 * ⚠️ 这不是「win32 特有的锦上添花」：`Get-NetTCPConnection` 缺模块**同时打断两条路**
 * （列全部由 {@link listenerScanAttempts} 兜、查单端口在这里兜），
 * 只补其中一条会让 `dsh_list_instances` 好了、`dsh_check_auth` / `dsh_dump_config`
 * 在同一台机器上照样瞎 —— **修一个落点 ≠ 扫一族**。
 *
 * 端口是**参数**而不是模块里的常量：它同时出现在参数表（`-iTCP:<port>`、PowerShell 脚本）
 * 与解析器里，两处必须是同一个值 —— 写死一处就会出现「问的是 3080、过滤的是 0」
 * 那种静默失配，而它**不会报错**，只会安静地报告「没人听」。
 *
 * @param platform `process.platform`（**调用时**读，不在模块加载时缓存）。
 * @param port 目标端口。
 */
export declare function portLookupPlan(platform: string, port: number): PortLookupPlan | undefined;
/**
 * 查一个端口上的监听者。
 *
 * **不抛**：探测失败收敛成 `probed: false`。
 *
 * ## 「不抛」的边界（在 B24 那条红线之下钉住）
 *
 * 收敛的是「命令跑完了、结果不好」（spawnError / 超时 / 取消 / 形状认不出）。
 * **注入的 spawn 实现自己抛异常不在此列** —— 那个由**工具层**的顶层 `try/catch` 接住
 * （`execute` 全路径不抛是契约的承重条件）。本层再加一层只会把两种失败抹平成一种，
 * 所以那条边界在 `test/tools/ports-crossplatform.test.ts` 里被钉住。
 *
 * @param port 目标端口。
 * @param deps 可注入的 spawn 与预算。
 */
export declare function lookupPort(port: number, deps: {
    spawn: SpawnImpl;
    timeoutMs: number;
    signal?: AbortSignal | undefined;
}): Promise<PortLookupResult>;
/** 一个候选监听端口（端口必有；进程信息可能读不到）。 */
export interface ListenerCandidate {
    port: number;
    pid?: number;
    processName?: string;
    startedAt?: string;
}
/** 「列出全部监听者」的结果。 */
export interface ListenerScanResult {
    platform: string;
    /** `false` = **查不了**（命令缺失 / 形状认不出 / 超时 / 取消），不是「没人听」。 */
    probed: boolean;
    candidates: ListenerCandidate[];
    /**
     * **有监听、但读不到 pid** 的条数。
     *
     * 与 {@link ParsedSocketTable} 的 `unidentified` 同一个纪律：把它压成「没人听」
     * 就是反向结论 —— 而那正是本仓反复记的那一族静默坏。
     */
    unidentified: number;
    detail: string;
}
/** 一张「全部监听者」表的解析结果。 */
export interface ParsedListenerTable {
    candidates: ListenerCandidate[];
    unidentified: number;
    /** **认得的**行数（含表头）—— 理由与 `ParsedSocketTable.rows` 逐字相同。 */
    rows: number;
}
/**
 * 造「列出全部监听者」的脚本（**仅 Windows 分支**）。
 *
 * 与 {@link portLookupScript} 的两处差别，都是必需的：
 * 1. 去掉 `-LocalPort <n>` —— 这正是「列全部」；
 * 2. 输出**多带一个 `port` 字段**：单端口那次查询的调用方已经知道端口，列全部时
 *    不知道，而 `LocalPort` 必须由脚本给出（否则解析器只能瞎猜）。
 *
 * 字段顺序固定为 `port|pid|name|startedAt`：加字段是**破坏性**改动，
 * 解析器 {@link parseListenerScan} 与它成对，别只改一边。
 */
export declare function listenerScanScript(): string;
/**
 * 解析「列出全部监听者」的脚本输出（`port|pid|name|startedAt`）。
 *
 * 形状不对的行**跳过**（不猜）：pid 读不出来时仍然保留端口 —— 那是「有人听、
 * 不知道是谁」，属于 `unidentified`，不是「没有」。
 *
 * @param stdout 脚本的标准输出。
 */
export declare function parseListenerScan(stdout: string): ParsedListenerTable;
/**
 * 解析 `ss -ltnp` / `ss -ltn` 的**全部**监听行。
 *
 * 复用的是 {@link parseSsOutput} 那套「先认行、再取值」的形状判据
 * （`ssRowHasKnownShape` + 结构内下标），只是**不过滤端口**。
 *
 * @param stdout `ss` 的标准输出。
 */
export declare function parseSsListeners(stdout: string): ParsedListenerTable;
/**
 * 解析 `lsof -nP -iTCP -sTCP:LISTEN` 的**全部**监听行。
 *
 * 与 {@link parseLsofOutput} 同形，只是不吃端口参数（`lsof` 那一行里已经带着端口）。
 *
 * @param stdout `lsof` 的标准输出。
 */
export declare function parseLsofListeners(stdout: string): ParsedListenerTable;
/**
 * 解析 `netstat` 的**全部** tcp 监听行（darwin 的 `-an` 与 win32 的 `-ano` 两种形状）。
 *
 * ## 两种形状，判据逐条列出
 *
 * 1. 表头首列是 `Proto`（两平台相同，**计入 `rows`**）；`Active Connections` 那行、
 *    `UDP` 行与 unix 域那一段都不认；
 * 2. **darwin**（`netstat -an`）：监听态在**末列**逐字为 `LISTEN`，本地地址是第 4 列
 *    （`127.0.0.1.3080` / `*.3080`），**不给 pid** ⇒ 命中的行**一律**进 `unidentified`；
 * 3. **win32**（`netstat -ano`）：监听态在**状态列**逐字为 `LISTENING`，本地地址是第 2 列
 *    （`0.0.0.0:3080` / `[::]:3080`），**pid 在末列** ⇒ 带 pid 的候选（见下）；
 * 4. **不扫全行找端口**：两个平台的对端地址都带端口，扫全行会报出别人的端口。
 *
 * ## 三值语义（这一档尤其容易塌）
 *
 * `-o` 这一档**读得到 pid**，所以带 pid 的行**不计入** `unidentified`
 * —— 该栏的定义是「读不到 **pid** 的条数」，而 pid 就在那一列；
 * 但它**读不到进程名与启动时间**，所以候选只带 `port` + `pid`（不留空串占位）。
 * 两种形态都仍然是「**端口上有人在听**」：
 * 「没人听」只由「这张表被读懂了、而它没有这一行」来表达。
 *
 * @param stdout `netstat` 的标准输出。
 */
export declare function parseNetstatListeners(stdout: string): ParsedListenerTable;
/** 「列出全部监听者」的一次尝试（命令 + 解析器）。 */
export interface ListenerScanAttempt {
    command: string;
    args: readonly string[];
    parse: (stdout: string) => ParsedListenerTable;
}
/**
 * 取某个平台的「列出全部监听者」方案。
 *
 * 与 {@link portLookupPlan} 分开而不是参数化：两条路的**命令形态不同**
 * （`-LocalPort` / `-iTCP:<port>` 都得去掉），把它们塞进一个函数只会让
 * 「传不传端口」变成一个运行期分支 —— 而那个分支写错的形状正是**静默少列**。
 *
 * 兜底的用意与那条注释逐字同一个：**主命令本身不可用**（`Get-NetTCPConnection` 缺模块、
 * `lsof` 没装、`-p` 不被支持），不是「主命令慢」。所以顺序即优先级，
 * 第一条**可信**就返回 —— 兜底只在前面每一条都被判成不可信时才会被跑到。
 *
 * @param platform `process.platform`（**调用时**读）。
 */
export declare function listenerScanAttempts(platform: string): ListenerScanAttempt[];
/**
 * 列出本机全部监听者。
 *
 * **不抛**：查不了收敛成 `probed: false`。可注入 spawn；每次尝试都带预算。
 *
 * @param deps 可注入的 spawn 与预算。
 */
export declare function listListeners(deps: {
    spawn: SpawnImpl;
    timeoutMs: number;
    signal?: AbortSignal | undefined;
}): Promise<ListenerScanResult>;
//# sourceMappingURL=ports.d.ts.map