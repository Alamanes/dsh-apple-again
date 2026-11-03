/**
 * `dsh_hot_reload` —— v1.1 的第一个**写侧**工具：把一个已经在树里的 entry
 * 就地换成磁盘上的新代码，不重启宿主。
 *
 * 工具这一层只做四件事：解析参数（三者择一，不猜）→ 调机制层 →
 * 把机制层的失败原因映射成闭枚举 `kind` → 补 `nextStep`。
 * 算法本身在 `lib/hot-reload.ts`（那里可脱离宿主单测）。
 *
 * ## 新契约下的形状（SHAPE §2 / §3 / §4 / §5）
 *
 * 1. **描述四段**（`what / useWhen / boundary / cost`）并由 `composeDescription` 合成；
 *    上限是红线 B20a 的硬数（description ≤240 字符；参数描述只判下界 —— 非空 + 合计 > 0）。
 *    **`cost` 段必写**（§2 的规则 ④：只对行动 / 派生类写）——「改不改状态、有没有
 *    `dryRun`、可不可逆」三件事都在这一行里。
 * 2. **`data` 顶层恰好三键** `{verdict, key, audit}`，成功失败同形（B21），由
 *    `outcomeToToolResult()` 一处产出（机制层负责算，本层不重算）。
 * 3. **失败分支没有 `hint` 了**（§4.1 删掉它）：那句最要紧的
 *    "the running entry was never touched — nothing to undo" 现在住在 **`verdict`**（L1），
 *    而「要不要收拾」的两个结构化事实（`oldFiberTouched` / `rolledBack`）住在 **`key`**（L2）。
 *    `error.message` **不进模型文本**，所以失败分支的「所以呢」只能由 `verdict` 承载。
 * 4. **`kind` 不许降级**：import / apply 两档仍是 `reload-failed` —— 那是模型判
 *    「该去改被重载的那份插件代码再重试」的唯一稳定机器码（`kindForReason` 里钉住）。
 * 5. `execute` **绝不 throw**（B24）：写侧工具抛异常最难收拾 —— 树可能已经改了一半，
 *    而调用方只看到一条栈。顶层 try/catch 因此不是风格，是契约的承载条件。
 */
import { type ToolDefinition } from '@deepseek-ai/dsh-tools';
import { type ReloadHost } from '../lib/hot-reload.js';
import { type ToolDescription } from './describe.js';
import { type ToolDeps } from './shared.js';
/** 工具名。 */
export declare const HOT_RELOAD_TOOL = "dsh_hot_reload";
/**
 * 这个工具的运行期依赖。
 *
 * 为什么在本文件里扩展 `ToolDeps` 而不是改 `shared.ts`：写侧需要一个新的注入点
 * （`reload` 宿主端口），而 `shared.ts` 是四个只读工具共享的、已被契约冻结的形状。
 * 在本地扩一个子类型，四个只读工具的依赖面就一点没变。
 */
export interface HotReloadDeps extends ToolDeps {
    /**
     * 宿主侧的热重载能力（真实实现 `reloadHostFrom(ctx)`）。
     *
     * 契约是「**不抛**」：端口内部把宿主结构的任何意外都收敛成返回值，
     * 让机制层能把它们变成结构化失败，而不是让 `execute` 抛出去。
     */
    readonly reload: ReloadHost;
}
/**
 * 本工具的描述（SHAPE §2.1 四段骨架）。
 *
 * 逐段理由：
 * - `what`：动词 + 对象，并点明它**不重启**（那是它与 `dsh_restart` 的分界）。
 * - `useWhen`：路由信号 = 「刚改完插件自己的代码」+ 「三个目标参数只能给一个」
 *   （后者是执行前必须知道、且调用结果里学不到的约束 —— §1.1 的判据）。
 * - `boundary`：**唯一的反直觉点**，也是这个工具唯一会让人事后吃亏的地方 ——
 *   cordis 之外开的资源不归 effect 管、dispose 旧 fiber 不会释放 → 静默泄漏。
 * - `cost`：行动类的三件事 —— 会改**运行中的树**、有 `dryRun` 可预览、失败会回滚。
 */
export declare const HOT_RELOAD_DESCRIPTION: ToolDescription;
/**
 * 造工具。
 *
 * @param deps 运行期依赖。
 */
export declare function createHotReloadTool(deps: HotReloadDeps): ToolDefinition;
//# sourceMappingURL=dsh_hot_reload.d.ts.map