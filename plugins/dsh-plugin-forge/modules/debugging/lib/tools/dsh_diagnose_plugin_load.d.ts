/**
 * `dsh_diagnose_plugin_load` —— 「插件到底加载了吗」的外部三处 + 启动日志。
 *
 * 对应 SKILL §3.1 / §3.2 / §3.8。真正的硬证据只有一条：**启动失败**时才会生成的
 * `$DSH_HOME/logs/startup-<ISO>-<uuid>.log`。所以「一条都没有」= 好消息。
 *
 * ## 这一版（W1 样板）的三处形状改造 —— 见 docs/SHAPE.md §2 / §3 / §5
 *
 * 1. **恒定知识搬去描述层**：旧的 `loadProofCaveat`（365 字符）与 `observation.note`
 *    （156 字符）每次调用逐字重复，现在只在 `description` 的**边界段写一次**
 *    （本工具是观察类，没有「代价段」，所以边界段占两行、合成后仍是四行）。
 *    `startupLogsNote` 同理（它也是恒定的），它的知识压进了描述第 3 行。
 * 2. **`data` 三段划分**（判据是 §5 那句：**模型看不到它，会不会做出不同的下一步？**）：
 *    - `verdict`：`buildVerdict` 的结果（L1）。成功、失败两条路都有。
 *    - `key`：要模型决策的原料 —— 观测模式与原因、树里 entry 总数与相位直方图、
 *      每个包的名字/相位/命中的 entryId/错误、入口的三值判定、在不在 bundles、
 *      产物相对进程的**三值**判定（`changed-after-process-start` 明说「推不出」）、
 *      启动日志的**三值状态与路径**、以及实际用的目录/profile/端口。
 *    - `audit`：其余全部（bundles 全列表、安装形态与 patch 细节、`missingInject` /
 *      `fiberState` / `basis`、`port.lookup`、启动日志全字段）—— 给人复核，不进模型文本。
 *    - **三值不许压成两值**：入口是 `present|missing|unknown`、启动日志是
 *      `present|none|unknown`。把「没查到」印成「不在」/「没有」是静默坏
 *      （缺 A 的假红与活跃坑 18 各是一次教训）。
 * 3. **不再有「结论当下一步」**：旧代码是 `ok({ ...data, verdict }, { why: verdict })`
 *    （同一个 const 绑了两次）。现在 `nextStep` 要么带工具与参数、要么 `manual: true`、
 *    要么根本不出现。
 */
import { type ToolDefinition } from '@deepseek-ai/dsh-tools';
import { type EntryCheck, type ResolutionSource } from '../lib/profile.js';
import { type ToolDescription } from './describe.js';
import { type ToolDeps } from './shared.js';
/** 工具名。 */
export declare const DIAGNOSE_PLUGIN_LOAD_TOOL = "dsh_diagnose_plugin_load";
/**
 * 产物（入口文件）相对监听进程的**三值**判定 —— **闭集，不许压成布尔**。
 *
 * 参照系只有一个：**监听进程的启动时间**。宿主 `alpha.3` 的
 * `feat(hmr): replace plugins whose package files changed during profile recomposition`
 * 之后，HMR 重组合会**就地驱逐模块缓存并替换插件**：进程 `startedAt` 不变，磁盘上却已是新代码。
 * 于是「产物比进程新」**推不出**「宿主跑的是旧产物」—— 两个解释都成立：
 * ① 没人换过它，进程仍跑改动前的那份；② 刚被热替换过，跑的正是改动后的那份。
 *
 * 所以中间那一档**不是结论，是「这个比较不足以判定」**：
 * - `changed-after-process-start`：产物比进程启动时刻新。**推不出宿主跑的是旧产物**
 *   （可能在跑新产物 —— 热替换过）。这是本条修复前的缺陷所在：那时的取值是 `stale=true`，
 *   等于把「推不出来」印成「宿主跑的是历史遗留」。
 * - `unchanged-since-process-start`：产物不比进程启动时刻新（相等按这一档算）——
 *   也就是说启动那一刻盘上就是这份文件，没有「改完没重启」的信号。
 * - `undated`：**没有可比的参照**（没给端口 / 端口查不了 / 读不到启动时间 /
 *   读不到产物 mtime / 启动时间解析不出来）。它**既不是**「没这回事」，
 *   **也不允许**被读成「产物是新的」。
 *
 * ⚠️ 三档互不重叠，塌成两档就是**反向结论**（活跃坑 18 那一族）：
 * 把 `undated` 压成「没变」会漏掉真有一次热替换后的判断，
 * 把 `changed-after-process-start` 压成「跑的是旧产物」就是本条修复前的假阳性。
 */
export type ArtifactFreshness = 'changed-after-process-start' | 'unchanged-since-process-start' | 'undated';
/**
 * 该三值的**闭集**（运行时形状，供调用方与判据枚举）。
 *
 * 为什么导出成值而不只是类型：类型在运行期**不存在**，而「三值不许塌成两值」
 * 这条纪律需要一个能被枚举、被数出来的真源 —— 判据断言「取到的三个值互不相同
 * 且都在闭集里」，少一档就红。
 */
export declare const ARTIFACT_FRESHNESS_VALUES: readonly ArtifactFreshness[];
/**
 * `dsh.bundle` 声明的检查结果（**三值，不许压成两值**）。
 *
 * 为什么必须进 `key`：`declared === false` 改变的是**「去哪找原因」**这一层 ——
 * 这个包**根本不贡献组合层**，所以「查它有没有被后一层整行替换」这个方向是错的；
 * `patchIssue` 非空则相反：宿主把**整条层**丢掉了（连它插的行、它覆盖的 config 一起没了），
 * 而插件只是「好像没装」，正确动作是修那个文件而不是改配置。
 *
 * 三值的来源与 `EntryCheck` 一一对应：`undeclared` → `false`、`unknown` → `null`、
 * 其余 → `true`。**「读不到那份 package.json」不等于「没声明」**（B0 的假红正是
 * 从这里出去的：官方包只在安装锚点下存在，profile 本地没有目录）。
 */
interface BundleKey {
    /** `true` = 声明了（字符串与数组两种形态都算）；`false` = 没声明；`null` = 读不到（未知）。 */
    declared: boolean | null;
    /** 读了哪条锚点的那份 `package.json`（`unresolved` = 两条都没解析到）。 */
    resolvedFrom: ResolutionSource;
    /** 声明的 patch 文件（**包相对**路径，按宿主应用顺序）。 */
    patches: string[];
    /** `patches` 里不存在的那些（`missing` 时非空）。 */
    missing: string[];
    /**
     * 声明本身有问题时才有值（两种都会让宿主**丢掉整条层**）：
     * - `missing`：声明了、文件不在（数组形态下**任何一个**不在都算）；
     * - `malformed`：`dsh.bundle.patch` 既不是字符串也不是字符串数组。
     */
    patchIssue?: 'missing' | 'malformed';
}
/**
 * 本工具的描述（SHAPE §2.1 四段骨架）。
 *
 * 逐段理由：
 * - `what`：动词 + 对象。
 * - `useWhen`：模型的路由信号 —— 它是四个观察入口里唯一回答「加载没有」的那个。
 * - `boundary`：**两行**，承载从输出里搬出来的恒定知识。它是本工具唯一的反直觉点所在：
 *   ① 「三处前置条件都在」**不等于**「加载成功」（旧 `observation.note` / `loadProofCaveat`
 *   的 inferred 分支）；② Loader 树的相位**不是公开 API**，而且没稳定时「还在挂载」的行
 *   会被读成 import 失败（同一个 caveat 的 observed 分支）—— 后半句是**必须写进模型文本**的
 *   那一条（`lib/fiber.ts` 文件头的边界段原文：调用方必须把这一条写进输出，别让「刚插进来」
 *   被读成「崩了」）；它原先只进了 `audit.basis`，而 `audit` 模型看不到，模型在 L2 只看到
 *   `error=failed to import`。观察类工具没有「代价段」，所以两行边界 + 两行前置 = 合成后仍是四行。
 */
export declare const DIAGNOSE_PLUGIN_LOAD_DESCRIPTION: ToolDescription;
/**
 * 造工具。
 *
 * @param deps 运行期依赖。
 */
export declare function createDiagnosePluginLoadTool(deps: ToolDeps): ToolDefinition;
/**
 * 把 `EntryCheck` 的 patch 字段投影成 `key.bundle`（**B**）。
 *
 * 三值取法：`undeclared` → `false`、`unknown` → `null`、其余 → `true`。
 * `patchIssue` 只在**声明本身有问题**时才有值 —— `present`（声明了且文件都在）是默认情形，
 * 不在这里造一个 `'ok'` 出来。
 *
 * 导出它是为了让测试能直接钉住「字符串与数组两种形态都认」这条判据，
 * 而不必绕一整套临时目录（那种写法会让「两种形态」的差别淹没在 fixture 里）。
 *
 * @param entry `checkInstalledEntry` 的结果。
 */
export declare function toBundleKey(entry: EntryCheck): BundleKey;
export {};
//# sourceMappingURL=dsh_diagnose_plugin_load.d.ts.map