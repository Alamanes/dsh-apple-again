/**
 * 配置 schema —— 默认值同时是文档。
 *
 * 只放**值**，不放凭据：本插件读本机既有文件（`$DSH_HOME/.credentials.yaml`、
 * `startup-*.log`），自己不产生也不存任何密钥。
 *
 * 字段顺序无关紧要：`.default()` 与 `.volatile()` 各写各的 `meta` 键，没有先后约束
 * （已回宿主源码核过）。真正的约束是
 * `.volatile()` 只能落在固定对象路径上 —— 本 schema 全部是顶层标量，不受影响。
 */
import type { Volatile } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { ResolvedConfig } from './contracts.js';
/**
 * 总闸的默认值 —— **这个字面量的唯一出处**（维护者 2026-10-15 拍板：**默认关**）。
 *
 * 它同时喂两处：schema 的 `.default(...)` 与 {@link frozenVolatile} 的兜底值。
 * ⚠️ **两处各写一个 `false` 就是「一处一事实」被破** —— 而且是**静默**地破：
 * 2026-10-15 变异实测抓到过（把 schema 那一处改回 `true`，判据**照样全绿**，
 * 因为 `resolveConfig` 走的是另一个字面量）。改这里一处即可，两处同时变。
 */
export declare const RESTART_ENABLED_BY_DEFAULT = false;
/** 用户在配置卡片里能改的东西。 */
export interface Config {
    /** DSH_HOME 目录；留空则取环境变量 `DSH_HOME`，再退回 `<homedir>/.dsh`。 */
    dshHome?: string;
    /**
     * profile 名；留空则取**运行时真源** `profileContext.name`，再退回环境变量 `DSH_PROFILE`，
     * 最后退回 `web`。
     *
     * ⚠️ **`DSH_PROFILE` 不是 profile 身份的真源**（2026-10-16 真机缺陷后改的优先级）：
     * 它只说明「启动这个进程的那个 shell 里恰好有什么」。真机那一轮 Desktop Host 拿到的是
     * `web`，于是 `dsh_restart` 拉起的是一条 **`--profile web`** 的命令行 —— 桌面端用户
     * 被送到了另一个 profile。真源是 `profileContext.name`（每次 `dsh` 启动都由启动器在
     * **建树之前** provide）。
     *
     * ⚠️ **那个 `web` 是怎么来的，判「推不出来」**（2026-10-16 复核）：本机没有用户级/机器级
     * 持久 `DSH_PROFILE`，所以它**可能**来自启动 shell 的继承、**也可能**来自本仓
     * {@link DEFAULT_PROFILE} 的兜底。两种成因**后果相同**（拿一个与宿主无关的名字去拼命令行），
     * 所以这里只写形状、不断言成因。
     */
    profile?: string;
    /** 宿主端口；`0` = 由工具从监听端口推断。 */
    port?: number;
    /** **快档**工具的工具预算（毫秒）：读文件 / 一条快命令 / 一次 HTTP 探测。 */
    timeoutMs?: number;
    /** **慢档**工具的预算（毫秒）：会跑 `--dump-config-schema` 的那些。 */
    schemaDumpTimeoutMs?: number;
    /**
     * `dsh_restart` 的总闸；**默认关**（维护者 2026-10-15 拍板）。
     *
     * 关着时那个工具**仍然注册**，每次调用返回一句「现在被配置挡住了、怎么打开」——
     * **不注册是错的**：模型看到「这个插件不提供 `dsh_restart`」就会去另想办法重启
     * （甚至直接让用户手动重启）⇒ 风险不降反升，而且不可控；「工具静默消失」
     * 正是本仓「别把不知道印成结论」那一族。
     *
     * ## 为什么带 `.volatile()`（**与其余字段相反**，维护者 2026-10-15 追加要求）
     *
     * 需求是「丝滑关开、不用重启」：宿主 `dsh/lib/index.js` 在比较两份 config 时，
     * 只有当这次变更**全部落在 volatile 字段上**时，才不把它当成一次「需要重启的变更」。
     * ⇒ 不带 `.volatile()` 的话，用户改一下开关就被要求重启宿主，而界面上还写着
     * 「no restart」—— 那是一次骗人。
     *
     * `Volatile` 是**活引用**（`.get()` 现读当前值），所以本仓的读取链必须
     * **每次调用现读**，绝不在 `apply` 期把它拍成一个常量（判据见
     * `test/tools/restart-tool.test.ts` 的「没有缓存」那一条）。
     */
    enableRestart?: Volatile<boolean>;
}
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    dshHome: z<string, string, "defined">;
    profile: z<string, string, "defined">;
    port: z<number, number, "defined">;
    timeoutMs: z<number, number, "defined">;
    schemaDumpTimeoutMs: z<number, number, "defined">;
    /**
     * 总闸**默认关**。这是维护者的产品决定，所以 `resolveConfig` 显式兜底成 `false`
     * —— 不靠「字段可能缺席」那点隐含缺席。
     *
     * ⚠️ `.default()` **必须在** `.volatile()` 之前：前者先定 mode，后者才产出
     * `Volatile<boolean>`（而不是 `Volatile<boolean | undefined>`）；反过来写，
     * `enableRestart.get()` 就带上 `undefined`，与下面 `?? false` 的读法打架
     * （`dsh-zhihu-search/src/index.ts` 的注释记着同一个坑）。
     */
    enableRestart: z<boolean, boolean, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    dshHome: z<string, string, "defined">;
    profile: z<string, string, "defined">;
    port: z<number, number, "defined">;
    timeoutMs: z<number, number, "defined">;
    schemaDumpTimeoutMs: z<number, number, "defined">;
    /**
     * 总闸**默认关**。这是维护者的产品决定，所以 `resolveConfig` 显式兜底成 `false`
     * —— 不靠「字段可能缺席」那点隐含缺席。
     *
     * ⚠️ `.default()` **必须在** `.volatile()` 之前：前者先定 mode，后者才产出
     * `Volatile<boolean>`（而不是 `Volatile<boolean | undefined>`）；反过来写，
     * `enableRestart.get()` 就带上 `undefined`，与下面 `?? false` 的读法打架
     * （`dsh-zhihu-search/src/index.ts` 的注释记着同一个坑）。
     */
    enableRestart: z<boolean, boolean, "volatile-defined">;
}>>, "plain">;
/** 默认 profile 名：`ctx.cmdlineArgs` **不含** `--profile`（启动器自己吃掉了），只能读 env。 */
export declare const DEFAULT_PROFILE = "web";
/**
 * 默认 DSH_HOME：`<homedir>/.dsh`。
 *
 * **这不是我们发明的兜底**，而是宿主自己的默认值：实测 `DSH_HOME` 未设时宿主的 home 就是
 * `~/.dsh`（Windows 上是 `%USERPROFILE%\.dsh`），与官方 `@deepseek-ai/dsh-home-paths` 的解析一致。
 * 因此「读默认值」与「读宿主实际在用的值」在正常机器上指向同一处。
 */
export declare function defaultDshHome(): string;
/**
 * 把「可能没配」的配置补齐成工具半边要的形状。
 *
 * 不走 schema 的 `resolve()`：`apply()` 在单测里会被直接调用（宿主不在场），
 * 那时拿到的就是一个普通对象。这里显式兜底，让两条路径同形。
 *
 * **`dshHomeSource` 是给用户看的**：诊断工具最怕「看着成功其实读错了目录」。
 * 把「这个值是从配置来的、从环境变量来的、还是我们按默认值推的」显式带出去，
 * 读的是默认目录这件事本身就成了可见证据，而不是隐藏假设。
 *
 * ## profile 的优先级（**运行时真源优先于环境变量**，2026-10-16 改）
 *
 * `config.profile`（用户显式写的）> **`runtime.profile`（`profileContext.name`）** >
 * `env.DSH_PROFILE` > `web`。
 *
 * 为什么真源必须排在环境变量之前：`DSH_PROFILE` 是**继承来的**（那次真机缺陷里它正是
 * 从启动 Electron 的那个 shell 继承下来的 `web`），而 `profileContext.name` 是**启动器
 * 为这个进程登记的** profile。两者不一致时，后者才回答「这个宿主管的是哪个 profile」。
 * 环境变量保留在链上，只为兼容**没有** `profileContext` 的注入式调用（单测 / 宿主不在场）。
 *
 * @param config 宿主传来的（或单测里手写的）配置。
 * @param env 只用于测试注入；默认读 `process.env`。
 * @param runtime 运行期真源（`profileContext`）；形状与容错在 `src/lib/carrier.ts` 里判。
 */
export declare function resolveConfig(config: Config | undefined, env?: NodeJS.ProcessEnv, runtime?: {
    profile?: string | undefined;
}): ResolvedConfig;
//# sourceMappingURL=config.d.ts.map