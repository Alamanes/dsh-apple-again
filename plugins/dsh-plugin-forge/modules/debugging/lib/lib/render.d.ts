/**
 * 工具结果的模型可见渲染（SHAPE §3.1 冻结）。
 *
 * `output.render` 的返回值就是**模型读到的东西**。新契约下模型看到的只有三段：
 *
 * ```
 * [dsh_x] ok                              ← 或：[dsh_x] failed (<kind>)
 * verdict: <data.verdict 逐字>
 * <L2 第一行，来自 table.key(data)>
 * nextStep: <tool>(<args JSON>) — <why>   ← 或（manual 支）：nextStep: <why>
 * ```
 *
 * 为什么不再整块打印 JSON：诊断输出可能很大（实测 `--dump-config-schema` 有 3.2 万行），
 * 而**最需要证据的那次（插件被整条丢弃）恰是最可能被截断的那次**。所以模型需要细节时走
 * **路径**（L2 给出日志路径 / 目录），它自己有读文件的工具。
 *
 * 三条纪律（都在 §3.1 里，这里只留指针）：
 * - `audit` **不进**这段文本（B22 用哨兵断言）—— 渲染只读 `data.verdict` 与 `table.key(data)`。
 * - L3 只在 `nextStep` 存在时出现；`manual` 支不印 `—`、不印空括号。
 * - 截断要**明说并给总数**（官方的 `truncated` + `total` 判例），但**不许**在截断行里指向
 *   模型够不到的位置。原先那句「the full record is in the session log」正是反例：会话日志里
 *   **没有完整 `value`**（宿主 `appendToolResult` 只写 `{turn, step, message, error?, meta?}`，
 *   见 SHAPE §8.1 的 `[已核]`），本仓也没有任何读会话日志的工具 ⇒ 被截掉的行任何通道都没有，
 *   那句指引**说了但兑现不了**（由红线 B27 守着，别再换个说法加回来）。
 */
import type { ToolData } from './errors.js';
/** 模型可见的一段文本；形状与宿主的 `TextBlock` 一致（避免多引一个包）。 */
export interface TextBlockLike {
    type: 'text';
    text: string;
}
/** L2 的默认行数上限。 */
export declare const DEFAULT_MAX_KEY_LINES = 15;
/**
 * 一个工具声明的输出表：**L2 从哪来**。
 *
 * L1 不在这张表里 —— 它就是 `data.verdict` 逐字（SHAPE §4.1 把 L1 定为必填）。
 * 为什么不在表里再放一个 `verdict(data)` 生成器：那是「L1 有两个家」，而且
 * `ensureToolResult` 合成的兜底失败**没有专属输出表**，多一个生成器那条路径就印不出判定行。
 *
 * `key` 返回的行**顺序即输出顺序**，只放本次非默认、且下一个决定可能要用到的。
 * 返回值里非字符串 / 空串的条目会被丢掉（渲染不抛，永远有输出）。
 */
export interface RenderTable<T> {
    /** L2：逐行文本，顺序即输出顺序。 */
    key(data: ToolData<T>): readonly string[];
    /** L2 的行数上限；超出时截断并**明说**还剩几条。默认 15。 */
    maxKeyLines?: number;
}
/** 渲染成宿主要的 `TextBlock[]`。 */
export declare function renderToolResult<T>(toolName: string, value: unknown, table: RenderTable<T>): TextBlockLike[];
/**
 * 渲染成文本（便于直接断言）。
 *
 * @param toolName 工具名（放在首行，便于模型在长对话里认出这段属于谁）。
 * @param value 工具的规范返回值。
 * @param table 该工具的输出表（L2 的投影函数）。
 */
export declare function renderToolResultText<T>(toolName: string, value: unknown, table: RenderTable<T>): string;
//# sourceMappingURL=render.d.ts.map