/**
 * `$DSH_HOME/logs/startup-*.log` 的解析（**纯函数：不读盘，内容由调用方传入**）。
 *
 * ## 为什么要有它
 *
 * 那个日志不是 JSON，是 **`util.inspect(...)` 的输出**（`dsh/lib/bin.js` 的
 * `reportStartupFailure`，参数 `depth:null, showHidden:true, customInspect:false`）：
 * 键没有引号、`[length]: N` 是**伪字段**、多行 error 内嵌、字符串带 `\n` 转义。
 * 所以只能**行导向 + 容错**地解析，不能 `JSON.parse`。
 *
 * ## 三个「不许压成两值」的地方（都是本仓踩过的坑）
 *
 * 1. **解析失败 ≠ 没有失败条目**。整份日志读到了、但四个锚点一个都没命中时，
 *    必须 `parse.ok === false`（判红）；把它当成「日志里没有失败插件」是本项目
 *    头号禁忌（AGENTS 活跃坑 18：最危险的静默失败是让判据自己看起来通过了）。
 * 2. **某段合法缺席 ≠ 某段在但没解出来**。`Failed plugins (N):` 只在 N>0 时打印
 *    （`dsh-app-boot` 的 `startupDiagnostic`），所以「没有这一段」= 没有失败插件；
 *    「有这一段却解不出 N 条」才进 `gaps`。
 * 3. **读不到 ≠ 没有**。读文件失败走 `parse.readError`（未知），不参与 `ok` 的判定。
 *
 * ## 计数为什么要交叉核对
 *
 * 真机那份日志的锚点是 **headline=2 / Failed=1 / waiting=11 / entries=12**：
 * `2` 是**未激活的 required 条目**数（`webserver` 失败 + `connection` 等待），
 * `1` 才是失败的个数。**别把 2 当成「失败插件个数」** —— 所以 `requiredNotActivated`
 * 与 `failed.length` 是两个字段，且 `gaps` 里有一条专门核对它们。
 *
 * ## 缩进是**相对**的
 *
 * 段标题的缩进由它在 `inspect` 输出里的嵌套深度决定（真机那份里 `Failed plugins (N):`
 * 在缩进 2、条目在 4、`Package:` 在 6）。这里不写死数字，而是**以标题行的缩进为基准**
 * 取偏移 —— 宿主换个包装层也不会整段解错。
 */
/** 认出来的段（`sections` 的取值）。 */
export type StartupLogSection = 'header' | 'failed' | 'pending' | 'entries' | 'startup' | 'messages';
/** 一份日志的解析结论。 */
export interface StartupLogParse {
    /**
     * 解析成功（四个锚点里至少命中一个）。
     *
     * `false` **必须判红**：它是「这份日志存在、但里面的段一个都没认出来」，
     * 与「日志里没有失败条目」是两件完全不同的事（活跃坑 18）。
     */
    ok: boolean;
    /** 实际认出来的段。 */
    sections: StartupLogSection[];
    /**
     * 部分解析的缺口（非空 = 有的段没解全）。**每一条都由标记推出，不许猜**。
     *
     * 形状：`<缺口名> (declared N, parsed M)`，例如 `failed-count (declared 1, parsed 0)`。
     */
    gaps: string[];
    /** `ok === false` 时的一句话原因（英文）。 */
    reason?: string;
    /** 读文件失败的原因（英文）。有它时 `ok === false` 的语义是**未知**，不是「格式不认识」。 */
    readError?: string;
    /** 内容看起来被截断（写盘中途被杀 / 超过字节上限）。**这不是解析失败**。 */
    truncated?: boolean;
}
/** 一条失败插件（`Failed plugins (N):` 段）。 */
export interface StartupFailure {
    /** entry id（`webserver` 这种）。 */
    id: string;
    /** 宿主把它算进了未激活的 required 条目。 */
    required: boolean;
    /** 包名 —— 只有这个字段能把 id 与「装了哪个包」对上。 */
    module?: string;
    /** 续行块首行（已剥掉 `Error: ` 前缀）。**这是唯一能导向「端口被占」那类根因的原料。** */
    error?: string;
    /** 续行块的其余行（原文，给人工复核）。 */
    stack?: string;
}
/** 一条等待服务的插件（`Plugins waiting for services (N):` 段）。 */
export interface StartupPending {
    /** entry id（**不是**服务名，也不是包名）。 */
    id: string;
    required: boolean;
    /** 缺哪些服务。 */
    missing: string[];
    /** 右列恰为字面量 `unknown` —— 宿主不知道缺什么，**不是**缺一个叫 unknown 的服务。 */
    missingUnknown?: boolean;
}
/** 一条 entry（`[entries]` 块）。 */
export interface StartupEntry {
    id: string;
    /** 包名（等待表里没有这一项，所以这个块不可替代）。 */
    module?: string;
    required: boolean;
    fiberState?: number;
    /** 宿主给的结果档位；别的一律 `unknown`（不猜）。 */
    kind: 'failed' | 'pending' | 'unknown';
    missing?: string[];
    /** 有没有 `error:` 字段。 */
    hasError: boolean;
}
/** 一条组合期消息（`[startup].messages`）。 */
export interface StartupMessage {
    /** 消息来源（`root` / `web-server` 这种）。 */
    name?: string;
    /** `warn` / `error`。 */
    type?: string;
    /** 第一个参数的文本（字符串原样；`Error` 取 `Error: ` 之后的第一行）。 */
    text?: string;
}
/** 一份日志解析出来的全部事实。 */
export interface StartupLogReport {
    timestamp?: string;
    dshVersion?: string;
    nodeVersion?: string;
    platform?: string;
    arch?: string;
    profile?: string;
    /** `[startup].configurationPath`。 */
    configurationPath?: string;
    /** headline 原文（`startup failed: 2 required plugins did not activate`）。 */
    headline?: string;
    /** headline 里的数字 = **未激活的 required 条目**数（**不是**失败插件个数）。 */
    requiredNotActivated?: number;
    failed: StartupFailure[];
    pending: StartupPending[];
    entries: StartupEntry[];
    messages: StartupMessage[];
}
/** 解析一份日志的结果（`parse` 是结论，`report` 是事实）。 */
export interface StartupLogParseResult {
    parse: StartupLogParse;
    report: StartupLogReport;
}
/**
 * 解析一份启动日志的内容。**绝不抛**。
 *
 * @param text 文件内容（调用方读盘；超字节上限时已由调用方截断）。
 * @param options 调用方的补充事实（是否因超上限而截断）。
 */
export declare function parseStartupLog(text: string, options?: {
    truncatedBySize?: boolean;
}): StartupLogParseResult;
/**
 * 造一份「读不到」的解析结果。
 *
 * 它**不是**解析失败：`parse.ok === false` 且 `parse.readError` 非空 ——
 * 「读不到」是未知，与「格式不认识」对下一步的决定不同（活跃坑 18 的同族）。
 *
 * @param readError 读文件失败的一句话（英文）。
 */
export declare function unreadableStartupLog(readError: string): StartupLogParseResult;
//# sourceMappingURL=startup-log.d.ts.map