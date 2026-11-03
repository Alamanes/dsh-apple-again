/**
 * `dsh_list_instances` —— 列出本机**活着的** DSH 宿主（D′ 第①块，见 `docs/SHAPE.md` §1.2）。
 *
 * ## 它为什么存在
 *
 * 文件型工具能指向另一个实例（`dshHome` 参数），但**没有任何东西能先告诉你「本机有哪些实例」**。
 * 这个工具补的就是那一格：**发现**。
 *
 * ## 四条硬边界（每一条都是「不这么写就是骗模型」）
 *
 * 1. **只能给 authority（`host:port`），给不出 home**。宿主 HTTP 面上没有任何路由能问出
 *    「我是谁 / 读哪个 home」，`$DSH_HOME` 里也没有别的实例的登记文件 ⇒ 发现结果与 home
 *    之间**没有可推导的关系**。所以描述里绝不暗示它知道 home，输出里也只给 authority ——
 *    要把文件型工具指向另一个实例，**路径必须由调用方手填**。
 * 2. **认领 DSH 靠专有签名，不是「401 就算」**：未认证 `GET /` 的 401 且 body **逐字**
 *    等于 {@link DSH_UNAUTHORIZED_BODY} 才算。任何要认证的服务都会返 401，把 401 当签名
 *    会把本机所有「需要登录」的东西都报成 DSH 实例。
 * 3. **三值，不是两值**：`dsh` / `other` / `unknown`。连不上、超时、取消、非 HTTP 全归
 *    `unknown` —— 那是「**没探到**」，与「探到了、不是 DSH」是相反的两件事
 *    （本仓三值纪律：「缺席」≠「空」）。
 * 4. **「没扫」也单独报**：给了 `port` 就不去读 socket 表，`scan.status = 'skipped'` ——
 *    它不是「查不了」，也不是「没扫到」。
 *
 * ## 只探回环 + 有界
 *
 * 一律连 `127.0.0.1:<port>`：候选来自 socket 表，那些端口可能绑在局域网上，
 * 但我们**只从本机回环去敲**（不做网络扫描）。候选数与每次探测都受预算约束，
 * 一次调用绝不挂死。
 */
import { type ToolDefinition } from '@deepseek-ai/dsh-tools';
import { type ToolDescription } from './describe.js';
import { type ToolDeps } from './shared.js';
/** 工具名。加工具时同步改：注册处 / B9 闭集 / 两份 README 的工具清单。 */
export declare const LIST_INSTANCES_TOOL = "dsh_list_instances";
/**
 * DSH 未认证 `GET /` 的响应体 —— **逐字**这一段才是签名。
 *
 * 出处：`docs/SHAPE.md` §1.2 的「已核的识别签名」（真源在 HOST-CONTRACTS）。
 * 对照：`/api`、`/api/session.export` 的 body 只是通用 `unauthorized`；
 * `/health`、`/version` 是 404 —— **这些都不算签名**。
 */
export declare const DSH_UNAUTHORIZED_BODY = "dsh web authentication required; reopen the URL printed by dsh web.\n";
/**
 * 探签名的 HTTP 实现。
 *
 * 为什么不是 `lib/http.ts` 的 `FetchImpl`：那个形状只给 `{ status, headers }`，
 * **读不到 body** —— 而签名恰恰在 body 上。这里的类型比它多一个 `text()`；
 * 值仍然从注入点进（测试喂替身，不真发请求）。
 */
export type SignatureFetch = (url: string, init: {
    readonly signal: AbortSignal;
    readonly redirect: 'manual';
}) => Promise<{
    readonly status: number;
    text(): Promise<string>;
}>;
/**
 * 生产实现：包一层全局 `fetch`。
 *
 * 与 `lib/http.ts` 的 `defaultFetchImpl` 同源，只多读一次 body。
 * **放在本文件是刻意的**：`lib/http.ts` 不在本卡写域里，而为一个三行的适配器去扩写域外的
 * 文件代价更大。将来若要收进 `lib/http.ts`，改动就是把这一段搬过去。
 *
 * @param url 目标地址。
 * @param init 信号与重定向策略。
 */
export declare const defaultSignatureFetch: SignatureFetch;
/** 一个候选的认领结论。**三值**：`unknown` 与 `other` 不许压成一个。 */
export type InstanceVerdict = 
/** 401 且 body 逐字等于签名 —— 这是 DSH。 */
'dsh'
/** 探到了，但不是 DSH（含 body 不同的 401）。 */
 | 'other'
/** **没探到**：连不上 / 超时 / 取消 / 非 HTTP。**不是**「不是 DSH」。 */
 | 'unknown';
/**
 * 本工具的描述（SHAPE §2.1 四段骨架，观察类没有「代价段」）。
 *
 * 逐段理由：
 * - `what`：动词 + 对象。
 * - `useWhen`：路由信号 + **一句去路**（结果可以喂给 `dsh_check_auth`）。
 * - `boundary`：**两行**，承载两条「不说就是骗模型」的边界：
 *   ① 只能给 authority，**给不出 home**（SHAPE §1.2 硬边界 2）；
 *   ② 只探回环，且「没探到」≠「不是 DSH」。
 */
export declare const LIST_INSTANCES_DESCRIPTION: ToolDescription;
/**
 * 造工具。
 *
 * @param deps 运行期依赖（`signatureFetch` 可注入；不给就用全局 `fetch`）。
 */
export declare function createListInstancesTool(deps: ToolDeps & {
    readonly signatureFetch?: SignatureFetch | undefined;
}): ToolDefinition;
/** 兜底行：`ensureToolResult` 合成的结果里 `key` 是 `{}`。 */
//# sourceMappingURL=dsh_list_instances.d.ts.map