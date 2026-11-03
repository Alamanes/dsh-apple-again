/** 探测结论。 */
export type HttpProbeKind = 
/** 服务在、认证也过了（200 或 3xx 重定向）。 */
'ok'
/** 服务在，但认证没过（401）。 */
 | 'unauthorized'
/** 连不上：端口没在监听（`ECONNREFUSED` 等）。 */
 | 'not-running'
/** 传输层预算耗尽。 */
 | 'timeout'
/** 调用方取消了这次探测（`exec.signal`）。**不要**与 `not-running` 混为一谈。 */
 | 'cancelled'
/** 连上了但返回了别的状态码。 */
 | 'http-error';
/** 探测结果：`kind` 给机器判，`detail` 给人看。 */
export interface HttpProbeResult {
    kind: HttpProbeKind;
    /** HTTP 状态码；连不上/超时时为 `undefined`。 */
    status?: number;
    /** `Location` 响应头；303 交换成功时它指向最终地址。 */
    location?: string;
    /** 一句可读的原因。 */
    detail: string;
}
/**
 * 探测所需的最小响应面。
 *
 * 故意**不**用全局 `fetch` 的类型：那样单测就得伪造整个 `Response`。
 * 只要 status 与 headers 就够 —— 401 与 303 的判定都只依赖这两个。
 */
export interface HttpResponseLike {
    readonly status: number;
    readonly headers?: {
        get(name: string): string | null;
    } | undefined;
}
/** 可注入的 HTTP 实现。 */
export type FetchImpl = (url: string, init: {
    readonly signal: AbortSignal;
    readonly redirect: 'manual';
}) => Promise<HttpResponseLike>;
/**
 * 生产实现：包一层全局 `fetch`。
 *
 * `redirect: 'manual'` 是必须的 —— SKILL §3.3 说有效 token 交换是 **303 + Set-Cookie**，
 * 跟着跳转会把 303 变成 200，那个「成功」就无法与「本来就 200」区分。
 *
 * @param url 目标地址。
 * @param init 信号与重定向策略。
 */
export declare const defaultFetchImpl: FetchImpl;
/**
 * 探测一个 authority。
 *
 * **不抛**：所有失败都收敛成 `kind`。调用方据此决定重试与否。
 *
 * @param url 完整 URL（含 scheme、host、port）。
 * @param timeoutMs 本条请求的传输预算（调用方保证它小于工具预算）。
 * @param deps 可注入的实现。
 */
export declare function probeHttp(url: string, timeoutMs: number, deps: {
    fetch: FetchImpl;
    signal?: AbortSignal | undefined;
}): Promise<HttpProbeResult>;
//# sourceMappingURL=http.d.ts.map