/** `<dshHome>/profiles/<profile>`。 */
export declare function profileDir(dshHome: string, profile: string): string;
/** `<dshHome>/logs`。 */
export declare function logsDir(dshHome: string): string;
/** `<dshHome>/.credentials.yaml`。 */
export declare function credentialsPath(dshHome: string): string;
/** profile 的 `package.json` 里我们关心的字段。 */
export interface ProfileManifest {
    dir: string;
    /** `dsh.profile.bundles`：有序 bundle 列表。 */
    bundles: string[];
    /** 完整 `dependencies`，用于判「已在依赖里」。 */
    dependencies: Record<string, string>;
}
/**
 * 读 profile 的 `package.json`。
 *
 * @param dir profile 目录。
 * @returns manifest；文件不存在或不是合法 JSON 时返回 `undefined`。
 */
export declare function readProfileManifest(dir: string): Promise<ProfileManifest | undefined>;
/** 安装形态。 */
export interface InstallShape {
    packageName: string;
    /** `<profileDir>/node_modules/<pkg>` 的绝对路径。 */
    path: string;
    exists: boolean;
    /** `link`（本地目录 link）/ `copy`（registry 拷贝快照）/ `absent`。 */
    linkType: 'link' | 'copy' | 'absent';
    /** link 的目标（仓库路径）；只在 `linkType === 'link'` 时有值。 */
    target?: string;
}
/**
 * 判一个包在 profile 里是 link 还是 copy（SKILL §3.2）。
 *
 * 这个判定的用途只有一个：**改源码要不要重装**。link 指向仓库，产物就是被读产物；
 * copy 是快照，改源码不影响已装副本。
 *
 * @param dir profile 目录。
 * @param packageName 包名（可含 scope）。
 */
export declare function readInstallShape(dir: string, packageName: string): Promise<InstallShape>;
/** 一个「在不在」的**三值**判定：`unknown` 表示**没能查到**，不是「不存在」。 */
export type Presence = 'present' | 'missing' | 'unknown';
/**
 * 包是从哪条锚点解析到的。
 *
 * 宿主自己的顺序是「**安装锚点优先、profile 其次**」（`dsh-app-boot` 的 `resolveBundleDir`），
 * 所以这里也必须同序 —— 顺序反了会把官方包误判成「profile 本地没装」。
 */
export type ResolutionSource = 'installation' | 'profile' | 'unresolved';
/** `checkInstalledEntry` 的可选解析锚点。 */
export interface EntryCheckOptions {
    /**
     * dsh 安装处的 `package.json`（宿主的 `installAnchor`）。
     *
     * 省略时从**当前进程**认：本插件跑在宿主进程里，所以宿主入口脚本
     * （`process.argv[1]`）就是这条锚点的来源。认不出来时**不猜路径**，
     * 结果会退化成 `unknown`（不是 `missing`）。
     */
    installAnchor?: string;
}
/** 一个包声明的 patch 文件。 */
export interface PatchFileCheck {
    /** 声明里的原始**包内相对路径**。 */
    file: string;
    /** 它的绝对路径。 */
    path: string;
    exists: boolean;
}
/**
 * patch 声明的整体状态。
 *
 * 为什么不是一个布尔：宿主对 patch 的失败方式是**整层 skip**
 * （`skipping profile bundle …: dsh.bundle.patch must be a file path or a list of file paths`），
 * 而「没声明」「声明坏了」「查不到」与「文件真的不在」是四件不同的事。
 */
export type PatchState = 'present' | 'missing' | 'malformed' | 'undeclared' | 'unknown';
/** 已安装包的入口检查结果。 */
export interface EntryCheck {
    packageName: string;
    /** `<profileDir>/node_modules/<pkg>`：**profile 本地**的期望路径（安装形态仍认这一处）。 */
    packageDir: string;
    /** 真正解析到的包目录；解析不到时没有。 */
    resolvedDir?: string;
    /** 从哪条锚点解析到的。 */
    resolvedFrom: ResolutionSource;
    version?: string;
    /** `main`（或 `exports['.']` 的 import / default）指向的**绝对**路径。 */
    entry?: string;
    /**
     * 入口存在性（三值）。
     *
     * - `present`：清单写了入口、文件在；
     * - `missing`：清单写了入口、文件**不在**（这条会让组合层整条丢弃该插件）；
     * - `unknown`：包解析不到，或清单里没有我们能读出来的入口 —— 两者都**不许**当成「缺失」。
     */
    entryState: Presence;
    /**
     * 兼容字段：`present` → `true`，`missing` → `false`，**`unknown` → 省略**。
     * 不许用 `false` 冒充「不存在」（缺 A 的假红就是从这里出去的）。
     */
    entryExists?: boolean;
    /** 入口文件的 mtime（毫秒）；读不到时为 `undefined`。 */
    entryMtimeMs?: number;
    /** 声明里**全部** patch 文件（有序；`dsh.bundle.patch` 是数组时不止一个）。 */
    patches: PatchFileCheck[];
    /** 声明里的**第一个** patch 文件（历史字段；单文件声明等价于全部）。 */
    patch?: string;
    /** 兼容字段：全部声明都存在才 `true`；`malformed` / `unknown` 时省略。 */
    patchExists?: boolean;
    /** patch 声明的整体状态（见 {@link PatchState}）。 */
    patchState: PatchState;
}
/**
 * 检查已安装包的入口文件与 patch 文件**在不在**。
 *
 * 为什么这是必要的：组合期错被 `skipping` **整条丢弃**时插件会静默消失（SKILL §3.1），
 * 而「产物路径写错 / patch 文件漏发」是它最常见的两个成因。
 *
 * **包在哪里解析**：宿主不是只看 `<profileDir>/node_modules`，而是「安装锚点优先、profile 其次」。
 * 官方包（`@deepseek-ai/dsh-base` 这一类）**只**住在安装锚点下 —— 只看 profile 本地会把它们
 * 全部判成「缺文件」，而用户看到的是「你的插件缺文件」（缺 A 的假红）。
 * 这里照宿主的顺序走两条锚点，**解析不到时报 `unknown`**，绝不冒充「缺失」。
 *
 * @param dir profile 目录。
 * @param packageName 包名。
 * @param options 可选解析锚点（省略时从进程认）。
 */
export declare function checkInstalledEntry(dir: string, packageName: string, options?: EntryCheckOptions): Promise<EntryCheck>;
/**
 * 取文件的 mtime（毫秒）。
 *
 * ⚠️ **它单独不足以判「宿主端跑的是旧产物」**（2026-10-15 纠正）：与**进程启动时刻**相比，
 * 在宿主能**就地热替换插件**的前提下推不出结论 —— 「产物更新」与「跑的就是新产物」可同时成立。
 * 要判加载面得看 fiber 相位与注册面是否缺失，不是看这两个时间戳。
 * 判据形态见 `dsh_diagnose_plugin_load.ts` 的 `ArtifactFreshness`（三值，含「推不出来」那一档）。
 *
 * @param path 文件路径。
 */
export declare function mtimeMsOf(path: string): Promise<number | undefined>;
/** 一条启动日志。 */
export interface StartupLog {
    name: string;
    path: string;
    sizeBytes: number;
    mtimeMs: number;
}
/**
 * `listStartupLogs` 的结果。
 *
 * 为什么不是裸数组：「读不到那个目录」与「目录里没有日志」表面上都是「一条都没有」，
 * 而前者是**未知**、后者才是好消息。把两者混成一个 `[]`，就是活跃坑 18 那种
 * 「让判据自己看起来通过了」的静默坏（缺 D）。
 *
 * 调用方要这样读：
 * - `readError !== undefined` → **未知**：日志目录读不到，绝不等于「没有失败日志」；
 * - `dirExisted === false` 且没有 `readError` → **确定**没有（目录不存在）；
 * - `dirExisted === true` → 真列过了，`logs` 就是全部。
 */
export interface StartupLogsResult {
    logs: StartupLog[];
    /** `logs` 目录是否存在；读目录失败时为 `undefined`（**不知道**，不等于不存在）。 */
    dirExisted?: boolean;
    /** 读目录失败的原因（英文，可能进工具输出）；成功时为 `undefined`。 */
    readError?: string;
}
/**
 * 列 `$DSH_HOME/logs/startup-*.log`。
 *
 * **只在启动失败时生成**（SKILL §3.8）—— 所以「一条都没有」是好消息，不是缺数据。
 * 工具输出里必须把这句话说清楚，否则模型会把「空列表」读成「还没查」。
 *
 * 但「读不到目录」不能跟着一起说成好消息，所以返回的是
 * {@link StartupLogsResult}（三值：列到了 / 确定不存在 / 读不到）。
 *
 * @param dshHome DSH_HOME 目录。
 */
export declare function listStartupLogs(dshHome: string): Promise<StartupLogsResult>;
/**

/** 从 profile 的**文件**里探测 hmr 的结果。 */
export interface HmrFileProbe {
    /** 有没有找到 hmr 的迹象。 */
    present: boolean;
    /** 证据（人可复核）。 */
    evidence: string[];
}
/**
 * 从 profile 文件里探 hmr。
 *
 * 为什么先走文件而不是直接跑 `--dump-config`：文件判定**零子进程**、快，
 * 且 `hmr` 是随 bundle 装进来的，`bundles` 列表与 `node_modules` 都在本地。
 * 只有**否定**结论才值得再去跑一次 dump 复核（否定的代价大：它会让一切降级成重启）。
 *
 * @param dir profile 目录。
 */
export declare function detectHmrFromProfileFiles(dir: string): Promise<HmrFileProbe>;
/**
 * 读文件；不存在时返回 `undefined`（而不是抛）。
 *
 * @param path 文件路径。
 */
export declare function readTextIfExists(path: string): Promise<string | undefined>;
/**
 * 文件是否存在。
 *
 * @param path 文件路径。
 */
export declare function exists(path: string): Promise<boolean>;
//# sourceMappingURL=profile.d.ts.map