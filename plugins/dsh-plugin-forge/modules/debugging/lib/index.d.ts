/**
 * 宿主半边入口。
 *
 * 这是**唯一**接触 Cordis 的地方：生命周期、配置校验、注册点都落在这里。
 * 业务逻辑放在本文件之外，那样才能用普通对象直接单测。
 *
 * 生命周期纪律：状态、监听器、定时器一律在 `ctx.effect()` / `ctx.on()` 内创建并由
 * 返回的 disposer 释放。**模块顶层不持有任何可变状态** —— 否则热重载后会留下两代
 * 插件共用同一份状态的幽灵故障。
 */
import type { Context } from '@deepseek-ai/cordis';
import { type Config } from './config.js';
/** Cordis 插件名，用于 loader 诊断。 */
export declare const name = "dsh-plugin-debugging";
/**
 * 本插件需要的服务。
 *
 * `tools` 是**硬依赖**：没有它，这个插件一行输出都没有。
 * `skills` **不写进来** —— 它是可选能力；写进去会让缺技能服务的宿主把整插件挂成
 * PENDING（静默无输出，且不算错误），而我们希望工具半边照常工作。
 */
export declare const inject: string[];
export { Config } from './config.js';
export type { PluginState, ResolvedConfig, SkillReport } from './contracts.js';
/**
 * 挂载点。
 *
 * @param ctx 宿主上下文。
 * @param config 配置（缺省即全默认值）。
 */
export declare function apply(ctx: Context, config?: Config): void;
//# sourceMappingURL=index.d.ts.map