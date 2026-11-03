/**
 * `dsh_check_effect_mode` —— 「改了什么 → 要做什么才生效」。
 *
 * 对应 SKILL §一「生效机制三档」。这个工具的价值全在**第二步**：
 * 光按原表回答会把「配置改动 → 热生效」当成无条件成立，而 `reload()` 在没有 `hmr`
 * 的 profile 上是**空操作** —— 那些 profile（`headless` / `sdk` / `acp` 默认没挂 hmr）
 * 上，工具会**假装热生效**，用户按它做完发现没变化。所以必须先探 hmr，再决定降级。
 *
 * 探测分两层（否定的代价大于肯定）：
 * 1. 文件层：profile 的 `bundles` / `dependencies` / `node_modules` —— 便宜；
 * 2. 组合层：`dsh --profile <p> --dump-config` 里真有 `- id: hmr` 行 —— 权威。
 *
 * 只有文件层**没找到**时才补跑 dump 复核，仍找不到才判 `hmr: 'absent'`。
 *
 * ## 保留 profile（`desktop`）：那次复核**不可用**，于是 hmr **不可核实**
 *
 * `dsh --profile desktop --dump-config` 被 CLI **无条件**拒绝（真机实测：npm CLI 与
 * 桌面内置 CLI 都回 `error: profile "desktop" is managed exclusively by the Electron
 * application`、exit 1）⇒ 这条 profile 上的 hmr 状态**拿不到证据**。
 *
 * ⚠️ 而「桌面 profile 里没有 hmr」是**假的**：`- id: hmr` 那一行由
 * `@deepseek-ai/dsh-base` 的 `cordis.patch.yml` 插入，而桌面 profile 的第一个 bundle
 * 就是 `dsh-base`（Lead 从桌面 asar 里逐字核过），`@deepseek-ai/dsh-hmr` 也从 install
 * anchor 解析得到。所以「文件层没看到」**不是**「组合层没有」。
 *
 * ⇒ **不许**把不可核实压成 `absent`（那是把「不知道」印成「没有」，而且方向最坏：
 * 桌面端根本重启不了 —— 闸④拒绝 —— 于是用户会被指向一个走不通的动作）。
 * 分岔判据是**这次改动的答案是否依赖 hmr**（唯一真源是 `effect.ts` 的 `baselineMode`）：
 * - 原表本来就要求重启的那两档（`host-code` / 已在 dependencies 里的 `bundle-added`）
 *   **不依赖** hmr ⇒ 照常回答，只把「复核不可用」写进 `note` / `evidence`；
 * - 其余（`config` / `client-code` / 全新型 `bundle-added`）⇒ 走 `stage: 'hmr-unverified'`
 *   的诚实失败（同时否认「热生效」与「必须重启」两个断言）。
 *
 * ## 新契约的形状（W2-A，见 docs/SHAPE.md §2 / §3 / §5）
 *
 * 1. **描述四段骨架**：`CHECK_EFFECT_MODE_DESCRIPTION` 里逐段声明，
 *    由 `composeDescription` 合成。恒定知识（「没有热重载时，原表说 live 的改动要重启」）
 *    只在边界段**写一次**，不再每次调用都印。
 * 2. **`data` 恰好三键** `{ verdict, key, audit }`：
 *    - `verdict`：一句话判定 + 「所以呢」（成功失败都有，**失败分支不许只写 failed**）；
 *    - `key`：模型做下一个决定要用的（走的哪一步、`mode` / `baseline` / `downgraded` /
 *      `hmr`、生效配置块、失败时的 profile 目录）；
 *    - `audit`：给人复核的 —— hmr 探测的原文证据、`effect.ts` 那句机制解释、全字段配置块。
 * 3. **`nextStep` 必须带动作**：`{ tool, args?, why }` 或 `{ manual: true, why }`。
 *    ⚠️ `mode=restart-required` 走 **`manual`**，但 why 里**必须点出 `dsh_restart`**：
 *    那个工具**已实现并注册**（SHAPE §6.1 的协作纪律正是「走 `dsh_restart`」），
 *    只是它**不可逆** ⇒ 这一步留给用户拍板，所以不写成工具支；而写「本侧没有工具能重启」
 *    是假话 —— 模型读到它就不会去调那个真实存在的工具。
 * 4. `execute` **绝不 throw**：意外异常在顶层收敛成 `internal` 失败（B24 的承载条件）。
 */
import { type ToolDefinition } from '@deepseek-ai/dsh-tools';
import { type ToolDescription } from './describe.js';
import { type ToolDeps } from './shared.js';
/** 工具名。 */
export declare const EFFECT_MODE_TOOL = "dsh_check_effect_mode";
/**
 * 这个 profile 有没有**可用的** hmr（也就是有没有人在 watch patch 文件）。
 *
 * ⚠️ **三值，不是两值**。`disabled:` 是一个 `!!js` 表达式时（本机 web profile 实测正是
 * `!!js '!ctx.get(''profileContext'')'`），静态看既不能判确定可用、也不能判确定不可用 ——
 * `src/lib/effect.ts` 的 `HmrProbe.disabled` 第三值就是它，那句 note 的原文承诺是
 * 「treated as usable, but the verdict carries that condition」。
 * 压成 `present` 就等于把「按上下文决定」印成「确定可用」，而条件只留在 `audit` 里
 * （`audit` 模型看不到）⇒ 承诺落空。所以第三值必须原样进 `key`（L2 由它投影）。
 *
 * ⚠️ **第四值 `unverified`**（2026-10-16 加）：两个真源里只剩文件层可用时（保留 profile 的
 * `--dump-config` 被 CLI 无条件拒绝），「有没有 hmr」这件事**拿不到证据**。
 * 它**不许**并进 `absent` —— `absent` 的含义是「没人 watch patch 文件，必须降级」，
 * 而那正是**没有证据**时不能下的结论（详因见文件头「保留 profile」那一节）。
 */
export type HmrAvailability = 'present' | 'present-conditional' | 'unverified' | 'absent';
/**
 * 这次调用走到了哪一步。
 *
 * **成功与失败共用一个 `key` 形状**，所以「没答出来」也必须能说清是**卡在哪一步** ——
 * 否则模型只能从 `error.message` 猜，而那个字段不进模型文本（SHAPE §4.1）。
 */
export type EffectModeStage = 
/** 有判定（成功路径）。 */
'answered'
/**
 * hmr 没能被核实：**文件层没看到**，而复核要么没轮到（预算耗尽）、要么在这个 profile
 * 上不可用（保留 profile 的 dump 被 CLI 无条件拒绝）。两种成因都导向同一件事 ——
 * 谁也没确认过，所以两个断言都不许下。
 */
 | 'hmr-unverified'
/** 复核用的 dump 在传输层超时。 */
 | 'dump-timeout'
/** 调用方在复核期间取消。 */
 | 'dump-cancelled'
/** 起不了 `dsh`（ENOENT / 其它 spawn 错）。 */
 | 'launch-failed'
/** 意外异常被顶层兜住（本插件的 bug，不是被测系统的状态）。 */
 | 'unexpected';
/**
 * 本工具的描述（SHAPE §2.1 四段骨架）。
 *
 * 逐段理由：
 * - `what`：动词 + 对象。
 * - `useWhen`：模型的路由信号 —— 「改完没生效」正是本工具的入口。
 * - `boundary`：**两行**。① 反直觉点：没有热重载时，原表说「热生效」的改动
 *   **要重启**（这句话过去每次调用都印一遍，现在只写在这里）；
 *   ② 答不了什么：它只说**什么能让改动生效**，**不验证**改动生效了没有。
 *   观察类工具没有「代价段」，所以两行边界 + 两行前置 = 合成后仍是四行。
 */
export declare const CHECK_EFFECT_MODE_DESCRIPTION: ToolDescription;
/**
 * 造工具。
 *
 * @param deps 运行期依赖。
 */
export declare function createEffectModeTool(deps: ToolDeps): ToolDefinition;
//# sourceMappingURL=dsh_check_effect_mode.d.ts.map