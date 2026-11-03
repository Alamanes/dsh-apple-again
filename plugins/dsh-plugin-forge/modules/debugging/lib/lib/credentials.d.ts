/** 凭证文件的存在性报告。 */
export interface CredentialsPresence {
    /** 被扫描的文件路径（绝对路径）。 */
    file: string;
    /** 文件是否存在。 */
    exists: boolean;
    /** `records:` 段里有没有 `client-connection/<id>` 条目（合体键的段名部分）。 */
    clientConnectionPresent: boolean;
    /** `records:` 段里有没有 `client-connection/browser-session` 这一条。 */
    browserSessionPresent: boolean;
    /** `browser-session` 所在行号（1 起）；只在存在时有值。**不是**它的内容。 */
    line?: number;
}
/**
 * 扫描凭证文件，判两个键在不在。
 *
 * @param file 凭证文件路径。
 */
export declare function readCredentialsPresence(file: string): Promise<CredentialsPresence>;
//# sourceMappingURL=credentials.d.ts.map