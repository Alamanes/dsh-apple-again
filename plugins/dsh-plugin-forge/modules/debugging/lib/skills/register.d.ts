import type { Context } from '@deepseek-ai/cordis';
import type { SkillRegistry } from '@deepseek-ai/dsh-skill';
import type { SkillReport } from '../contracts.js';
/**
 * 可选的注入口。
 *
 * **只为测试与解耦存在**：三个 fail-closed 分支（缺文件 / frontmatter 坏 / 正文空）没法拿
 * 真实 SKILL.md 触发，只能指向 `test/skills/fixtures/` 下的夹具。
 * 生产调用（`src/index.ts`）不传它，走的永远是 `DEFAULT_SKILL_ROOT`。
 */
export interface RegisterSkillOptions {
    /** 技能根目录；缺省 = 按产物位置推断的包内 `skills/`。 */
    skillRoot?: string;
    /**
     * 取 `ctx.agents`（活跃 agent 注册表）。
     *
     * **用函数而不是值**：宿主上下文里这个服务可能缺席（那时我们只做全局层注册），
     * 而且这样调用方不必知道 `agents` 服务的形状。缺省 = 不做动态注入。
     */
    agents?: () => AgentsLike | undefined;
}
/**
 * 「活跃 agent 注册表」的**结构型**视图。
 *
 * 刻意**不**从 `@deepseek-ai/dsh-agent` import 具体类型：这套机制（`ctx.agents` / `agent.ctx` /
 * `agent/created`）是**宿主内部 primitive、不是公开契约**（实测；见 AGENTS.md 活跃坑第 19、26 条），
 * 而结构型声明让我们**只依赖真正用到的那一点点形状** —— 宿主换版本时，
 * 失效会表现为「读不到」，而不是类型编译不过或运行期炸。
 */
export interface AgentsLike {
    /** 全部活跃 agent，注册序。 */
    list(): readonly AgentLike[];
}
/** 一个活跃 agent 的**结构型**视图：我们只要它的作用域 ctx。 */
export interface AgentLike {
    /** Agent 作用域上下文；其贡献是 agent-local、随销毁解开。 */
    readonly ctx: {
        get(serviceName: string): unknown;
    };
}
/**
 * 注册本插件的技能。**绝不抛**。
 *
 * @param ctx 宿主上下文（单测里是普通对象替身，只要有 `effect`）。
 * @param skills `ctx.skills`；缺失即 `no-registry`（缺技能服务的宿主属正常降级，不算错误路径）。
 * @param options 只在单测里用，见 {@link RegisterSkillOptions}。
 * @returns 成功时带 `name` 与 `contentBytes`；失败时带结构化 `error`。
 */
export declare function registerSkills(ctx: Context, skills: SkillRegistry | undefined, options?: RegisterSkillOptions): SkillReport;
//# sourceMappingURL=register.d.ts.map