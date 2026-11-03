import { homedir } from 'node:os';
import { join } from 'node:path';
import z from '@deepseek-ai/schemastery';
import { WORKLOAD_DEFAULT_BUDGET_MS } from './lib/timeouts.js';
/**
 * 总闸的默认值 —— **这个字面量的唯一出处**（维护者 2026-10-15 拍板：**默认关**）。
 *
 * 它同时喂两处：schema 的 `.default(...)` 与 {@link frozenVolatile} 的兜底值。
 * ⚠️ **两处各写一个 `false` 就是「一处一事实」被破** —— 而且是**静默**地破：
 * 2026-10-15 变异实测抓到过（把 schema 那一处改回 `true`，判据**照样全绿**，
 * 因为 `resolveConfig` 走的是另一个字面量）。改这里一处即可，两处同时变。
 */
export const RESTART_ENABLED_BY_DEFAULT = false;
export const Config = z.object({
    dshHome: z.string().default(''),
    profile: z.string().default(''),
    port: z.number().default(0),
    // 两个预算的**默认值住在 `lib/timeouts.ts`**（一处一事实，连理由与实测数字一起）：
    // 这里只引用，不再把数字抄一遍 —— 抄一遍就意味着「改默认值时总有一处会忘」。
    //
    // ⚠️ **刻意不加 `.min()`**（2026-10-14 判）：
    // - 用户填一个很小的值（如 `1`）时，不变量「传输先于工具」**不会**静默破 ——
    //   `lib/timeouts.ts` 的 `transportTimeoutMs` 有一道封顶，保证传输预算永远小于工具预算；
    // - 而 `.min(MIN_TOOL_BUDGET_MS)` 会**新拒掉**今天能装的配置，代价有二：① 判别不了
    //   宿主把 schema 拒绝呈现成什么（响亮报错，还是坑 1 那一族「被 catch 进 skippedBundles ⇒
    //   插件像没装一样消失」，后者更坏）；② 与本仓「不静默夹取用户的数」同族 —— 拒绝也是
    //   一种夹取，只是更响。
    // - 因此边界数只作为**推导出来的常量**（`MIN_TOOL_BUDGET_MS`）与**判据**存在，
    //   要不要在配置面上强加它是维护者的决定。
    timeoutMs: z.number().default(WORKLOAD_DEFAULT_BUDGET_MS.timeoutMs),
    schemaDumpTimeoutMs: z.number().default(WORKLOAD_DEFAULT_BUDGET_MS.schemaDumpTimeoutMs),
    /**
     * 总闸**默认关**。这是维护者的产品决定，所以 `resolveConfig` 显式兜底成 `false`
     * —— 不靠「字段可能缺席」那点隐含缺席。
     *
     * ⚠️ `.default()` **必须在** `.volatile()` 之前：前者先定 mode，后者才产出
     * `Volatile<boolean>`（而不是 `Volatile<boolean | undefined>`）；反过来写，
     * `enableRestart.get()` 就带上 `undefined`，与下面 `?? false` 的读法打架
     * （`dsh-zhihu-search/src/index.ts` 的注释记着同一个坑）。
     */
    enableRestart: z.boolean().default(RESTART_ENABLED_BY_DEFAULT).volatile(),
});
/** 默认 profile 名：`ctx.cmdlineArgs` **不含** `--profile`（启动器自己吃掉了），只能读 env。 */
export const DEFAULT_PROFILE = 'web';
/**
 * 默认 DSH_HOME：`<homedir>/.dsh`。
 *
 * **这不是我们发明的兜底**，而是宿主自己的默认值：实测 `DSH_HOME` 未设时宿主的 home 就是
 * `~/.dsh`（Windows 上是 `%USERPROFILE%\.dsh`），与官方 `@deepseek-ai/dsh-home-paths` 的解析一致。
 * 因此「读默认值」与「读宿主实际在用的值」在正常机器上指向同一处。
 */
export function defaultDshHome() {
    return join(homedir(), '.dsh');
}
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
export function resolveConfig(config, env = process.env, runtime = {}) {
    const configuredHome = config?.dshHome ?? '';
    const envHome = env.DSH_HOME ?? '';
    const dshHome = configuredHome !== '' ? configuredHome : envHome !== '' ? envHome : defaultDshHome();
    const dshHomeSource = configuredHome !== '' ? 'config' : envHome !== '' ? 'env' : 'default';
    const runtimeProfile = runtime.profile ?? '';
    const profile = config?.profile || runtimeProfile || env.DSH_PROFILE || DEFAULT_PROFILE;
    // schema 上的 `port: z.number().default(0)` 是「用户没填」的惯用占位符（socket 语义），
    // 但它**只该活在 schema 边界**：`ResolvedConfig` 叫「已解析」，就不该再带着未解析的哨兵。
    // 所以这里把 0 / 非正数一律折成 `undefined` —— 缺席比一个假的端口诚实。
    const configuredPort = config?.port;
    const port = configuredPort !== undefined && Number.isSafeInteger(configuredPort) && configuredPort > 0
        ? configuredPort
        : undefined;
    return {
        dshHome,
        dshHomeSource,
        profile,
        port,
        timeoutMs: config?.timeoutMs ?? WORKLOAD_DEFAULT_BUDGET_MS.timeoutMs,
        schemaDumpTimeoutMs: config?.schemaDumpTimeoutMs ?? WORKLOAD_DEFAULT_BUDGET_MS.schemaDumpTimeoutMs,
        // 显式兜底成「一个恒为 false 的活引用」（**不是** `?? undefined`）：默认关是拍板的
        // 产品决定，判据 `restart-tool.test.ts` 钉它。⚠️ 这里**不读 `.get()`** ——
        // 读一次就把值冻结了，而本仓恰恰要求「改开关不用重启」：值必须由工具
        // 每次调用现读（`Volatile<T>` 就是 `{ get(): T }`）。
        enableRestart: config?.enableRestart ?? frozenVolatile(RESTART_ENABLED_BY_DEFAULT),
    };
}
/**
 * 一个**恒定**的活引用（宿主不在场、或用户没配这个字段时的兜底）。
 *
 * 为什么需要它：`ResolvedConfig` 的 `enableRestart` 是必填（不留第二种形状），
 * 而 `undefined` 那一格仍然要有个能 `.get()` 的东西。恒为 `false` 与 schema 的
 * `default(false)` 同值，所以「缺席」与「显式关」在读出来之后**不可分** ——
 * 而这两者本来就该不可分。
 *
 * @param value 恒定值。
 */
function frozenVolatile(value) {
    return { get: () => value };
}
//# sourceMappingURL=config.js.map