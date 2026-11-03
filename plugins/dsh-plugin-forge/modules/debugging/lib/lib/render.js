import { toolResultProblem } from './errors.js';
/** L2 的默认行数上限。 */
export const DEFAULT_MAX_KEY_LINES = 15;
/** 渲染成宿主要的 `TextBlock[]`。 */
export function renderToolResult(toolName, value, table) {
    return [{ type: 'text', text: renderToolResultText(toolName, value, table) }];
}
/**
 * 渲染成文本（便于直接断言）。
 *
 * @param toolName 工具名（放在首行，便于模型在长对话里认出这段属于谁）。
 * @param value 工具的规范返回值。
 * @param table 该工具的输出表（L2 的投影函数）。
 */
export function renderToolResultText(toolName, value, table) {
    // 规则 4：形状不合法的值退化成**一行**（保持「永远有输出」）。
    // 用与 `ensureToolResult` 同一个判据 —— 两处必须同意同一套规则。
    if (toolResultProblem(value) !== undefined)
        return `[${toolName}] ${compactJson(value)}`;
    const result = value;
    const data = result.data;
    const lines = [
        `[${toolName}] ${result.ok ? 'ok' : `failed (${result.error.kind})`}`,
        // L1 逐字来自 data.verdict（校验已保证它非空）。
        `verdict: ${data.verdict}`,
    ];
    lines.push(...truncateKeyLines(keyLines(data, table), keyCap(table)));
    const step = nextStepLine(result.nextStep);
    if (step !== '')
        lines.push(step);
    return lines.join('\n');
}
/**
 * 取 L2 的行（丢掉非字符串与空串）。
 *
 * @param data 三层记录。
 * @param table 输出表。
 */
function keyLines(data, table) {
    const raw = table.key(data);
    if (!Array.isArray(raw))
        return [];
    return raw.filter((line) => typeof line === 'string' && line !== '');
}
/**
 * 定 L2 的行数上限。
 *
 * @param table 输出表。
 */
function keyCap(table) {
    const declared = table.maxKeyLines;
    if (declared === undefined)
        return DEFAULT_MAX_KEY_LINES;
    return Number.isSafeInteger(declared) && declared > 0 ? declared : DEFAULT_MAX_KEY_LINES;
}
/**
 * 截断 L2，并**明说**被截断、还剩几条（官方 `truncated` + `total` 判例）。
 *
 * 函数名保持 `truncate…` 前缀是有意的：红线 B10 用「本仓 `render.ts` 里的本地 `truncate`
 * 不是 `node:fs` 的 `truncate`」自证它按 import 来源判定、不误报同名本地助手。
 *
 * @param lines L2 全文。
 * @param max 行数上限（已归一化为正整数）。
 */
function truncateKeyLines(lines, max) {
    if (lines.length <= max)
        return [...lines];
    const hidden = lines.length - max;
    return [
        ...lines.slice(0, max),
        `${String(hidden)} more line(s) not shown`,
    ];
}
/**
 * 拼 nextStep 那一行（两支的逐字形状）。
 *
 * @param nextStep 下一步建议。
 */
function nextStepLine(nextStep) {
    if (nextStep === undefined)
        return '';
    // manual 支：只有 why —— 不印 `—`、不印空括号（旧形状 `nextStep: — <why>` 的空指代必须消失）。
    // 用 `in` 收窄（直接读 `.manual` 在联合类型上不可见）。
    if ('manual' in nextStep)
        return `nextStep: ${nextStep.why}`;
    const args = nextStep.args === undefined ? '' : compactJson(nextStep.args);
    return `nextStep: ${nextStep.tool}(${args}) — ${nextStep.why}`;
}
/**
 * 单行 JSON（形状不合法时的那一行用；JSON 转义保证它不含换行）。
 *
 * @param value 任意值。
 */
function compactJson(value) {
    try {
        return JSON.stringify(value) ?? String(value);
    }
    catch {
        return String(value);
    }
}
//# sourceMappingURL=render.js.map