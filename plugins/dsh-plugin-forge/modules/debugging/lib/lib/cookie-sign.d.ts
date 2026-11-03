/** cookie payload 版本（`COOKIE_PAYLOAD_VERSION`，`:272`）。 */
declare const PAYLOAD_VERSION = 1;
/** 宿主默认 cookie 寿命（天）。`cookieMaxAgeDays` 的默认值 30（SKILL §3.3 已实测）。 */
export declare const DEFAULT_COOKIE_MAX_AGE_DAYS = 30;
/** 取密钥失败的原因（闭集，便于工具分叉出不同的下一步）。 */
export type SecretProblem = 'missing' | 'malformed';
/** 从 `.credentials.yaml` 文本里取出 browser-session 的签名密钥。 */
export interface ExtractedSecret {
    /** 解码后的密钥字节（**敏感**：绝不进日志、绝不进模型可见文本）。 */
    secret: Buffer;
}
/** base64url 编码（宿主 `encodeBase64Url` 的同构实现）。 */
export declare function encodeBase64Url(value: Buffer | string): string;
/** base64url 解码；非法输入返回 `undefined`（宿主的 `decodeBase64Url:282-287` 加一道重编码自检）。 */
export declare function decodeBase64Url(value: string): Buffer | undefined;
/**
 * 从凭证文件文本里取 `client-connection/browser-session` 的 `payload.secret`。
 *
 * **只认真实形状**：顶层 `records:` 段下的**合体键**一行，往下到 `secret:`。
 * 嵌套两层（顶层 `client-connection:` 再往下）在宿主 `parseCredentialsDocument`
 * 那里会被**直接拒绝**，所以那种形状不存在 —— 判它「缺失」是对的（见 `lib/credentials.ts`）。
 *
 * @param text `.credentials.yaml` 全文。
 * @returns 密钥字节；取不到时给出**原因**而不是抛。
 */
export declare function extractBrowserSessionSecret(text: string): {
    ok: true;
    value: ExtractedSecret;
} | {
    ok: false;
    problem: SecretProblem;
};
/** cookie 的 payload（宿主 `decodeCookie:368` 校验的就是这四个字段）。 */
export interface CookiePayload {
    version: typeof PAYLOAD_VERSION;
    authority: string;
    issuedAt: number;
    expiresAt: number;
}
/**
 * cookie 名：`dsh-auth-` + `base64url(sha256(authority))`。
 *
 * @param authority `host:port`，必须与实际连的地址**逐字**一致。
 */
export declare function cookieName(authority: string): string;
/**
 * 签一个 cookie 值。
 *
 * @param secret 密钥字节。
 * @param payload cookie 载荷。
 */
export declare function encodeCookie(secret: Buffer, payload: CookiePayload): string;
/**
 * 一步签发：名 + 值 + 载荷。
 *
 * @param secret 密钥字节。
 * @param authority `host:port`，逐字匹配。
 * @param issuedAt 签发时刻（ms）；测试可注入。
 * @param maxAgeDays 寿命（天）；必须是正安全整数。
 */
export declare function signCookie(secret: Buffer, authority: string, issuedAt: number, maxAgeDays?: number): {
    name: string;
    value: string;
    payload: CookiePayload;
};
/**
 * 拼出可以直接贴进 `Cookie:` 头的那一段。
 *
 * @param name cookie 名。
 * @param value cookie 值。
 */
export declare function cookieHeader(name: string, value: string): string;
/**
 * host 侧完整 `Set-Cookie` 属性的复刻（`sessionCookie:341-344`）。
 *
 * 只在**人工把 cookie 塞进浏览器**时需要 —— 那个场景要有 Max-Age / Expires 才不会被
 * 当成会话 cookie 立刻丢掉。给 `Cookie:` 头用时**不要**带这些属性。
 *
 * @param name cookie 名。
 * @param value cookie 值。
 * @param payload 载荷（取 `expiresAt` 算 `Expires`）。
 * @param secure 监听是否用 TLS；`true` 时追加 `Secure`（宿主按**该监听自己的协议**决定，
 *   不看 `publicUrl` 也不看转发头 —— `:432-435`）。
 */
export declare function setCookieAttribute(name: string, value: string, payload: CookiePayload, secure: boolean): string;
export {};
//# sourceMappingURL=cookie-sign.d.ts.map