/**
 * `dsh_check_auth` —— 分开「连接被拒（没启动）」与「401（服务在、认证没过）」。
 *
 * 对应 SKILL §3.3 / §3.4。这是本工具**唯一**要回答的问题，因为两者的下一步完全相反：
 * 前者去启动宿主；后者只能**换一条真能区分的路**（在浏览器里打开同一个 authority 看是不是
 * 也 401）。**本工具的探测不带凭据**，所以它拿到的 401 是**匿名 401** —— 对「存的凭据还有没有效」
 * 零信息，**不许**由它推出「authority 不匹配」这类结论（旧文案正是这么编的，已删）。
 * cookie 绑定 `host:port`、30 天不滑动这些机制事实见 SKILL §3.3。
 *
 * ## 这一版（W2）的三处形状改造 —— 见 docs/SHAPE.md §2 / §3 / §4
 *
 * 1. **描述改四段并导出**（`CHECK_AUTH_DESCRIPTION`，红线 B20a 直接 import）。
 * 2. **`data` 顶层恰好 `{ verdict, key, audit }`**：失败分支的「所以呢」只能由
 *    `data.verdict` 承载 —— 新契约里 `error.message` **不进模型文本**（§4.1 字段角色表），
 *    所以每一条失败分支都写了实质判定句，而不是只写 `failed`。
 * 3. **旧 `error.hint` 与旧 `error.evidence` 都删了**，内容各有唯一的家：
 *    - 「browser-session 条目在不在」是**本次观测** → `key.credentials`（401 那条路上）；
 *    - 「v1 只判存在性、不读值、不自签 cookie」是**恒定知识** → 描述层的边界段，写一次。
 *    一处一事实：同一句话不再既藏在 hint 里又出现在输出里。
 * 4. **`execute` 绝不 throw**（B24）：意外异常在顶层收敛成 `internal` 失败。
 *    这是**契约的承载条件**，不是风格 —— 抛出去的异常会被宿主包成一句裸 `Error: <message>`，
 *    `verdict` / `key` / `audit` 全部失效，而且没有任何红线会报警（见 docs/SHAPE.md §4）。
 *    这条路径上真会抛的一环是 `resolvePort` 读 `env`（`fetch` 那条路由 `lib/http.ts` 自己收敛）。
 *
 * v1 的边界（决策 D4/D5）：**只报** `.credentials.yaml` 里
 * `client-connection/browser-session` 条目**在不在**，
 * **不提取密钥、不读值、不自签 cookie** —— 那是 v1.1。返回值里没有任何秘密。
 */
import { type ToolDefinition } from '@deepseek-ai/dsh-tools';
import { type ToolDescription } from './describe.js';
import { type ToolDeps } from './shared.js';
/** 工具名。 */
export declare const CHECK_AUTH_TOOL = "dsh_check_auth";
/**
 * 本工具的描述（SHAPE §2.1 四段骨架）。
 *
 * 逐段理由：
 * - `what`：动词 + 对象 —— 唯一的「分开两档」。
 * - `useWhen`：模型的路由信号（页面 401；或根本不知道宿主起没起）。这两句是旧的
 *   description 里唯一承重的部分，其余（输出结构复述）删掉。
 * - `boundary`：**两行**，承载从输出里搬出来的恒定知识：① v1 只判存在性、不读值、
 *   不自签 cookie，**也不发送任何凭据** —— 措辞是「不读秘密的**值**」而不是「不读秘密」：
 *   401 那条路上本工具**确实会读** `.credentials.yaml` 判条目在不在（只取布尔与行号），
 *   说「no secrets read」是**说过头**；② cookie 绑定 `host:port` 这个机制 —— 但**只对
 *   「带着 cookie 的浏览器页面」成立**：本工具的探测是匿名的，它那条 401 推不出
 *   「authority 变了」。旧文案写的是「A 401 usually means the authority changed」，
 *   那正是把不知道说成结论（与 L1 同批改掉）。
 *   观察类工具没有「代价段」，所以两行边界 + 两行前置 = 合成后仍是四行。
 */
export declare const CHECK_AUTH_DESCRIPTION: ToolDescription;
/**
 * 造工具。
 *
 * @param deps 运行期依赖。
 */
export declare function createCheckAuthTool(deps: ToolDeps): ToolDefinition;
//# sourceMappingURL=dsh_check_auth.d.ts.map