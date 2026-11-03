import type { Context } from '@deepseek-ai/cordis';
import type { PluginState } from '../contracts.js';
/**
 * 聚合注册入口。
 *
 * @param ctx 宿主上下文；`ctx.tools` 是唯一允许触碰的服务。
 * @param state 配置 + 技能半边的结果（工具可以据此在输出里提示技能没生效）。
 */
export declare function registerTools(ctx: Context, state: PluginState): void;
//# sourceMappingURL=index.d.ts.map