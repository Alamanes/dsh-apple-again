/**
 * 「生效三档」的判定（SKILL §一），**纯函数**，不碰 IO。
 *
 * SKILL 的原表：
 * | 改了什么 | 生效方式 |
 * |---|---|
 * | 配置 / patch / 启用状态 / 卸载 | 热生效 |
 * | 新装 bundle（已在 `dependencies` 里 → 重启） | 热生效 |
 * | 已装插件宿主端代码 / 改插件依赖 | 必须重启 |
 * | 客户端代码 / 界面 | HMR 自动换入；未挂则构建 + 刷新 |
 *
 * **关键前提**（SKILL §一 的加注）：`reload()` 在没有 `hmr` 服务时是**空操作**，
 * 此时任何「热生效」都退化成 `restart-required`。
 * 所以判定的第二步必须先探测 hmr，再决定要不要降级 —— 不做这一步的工具会在
 * 没挂 hmr 的 profile 上**假装热生效**（`headless` / `sdk` / `acp` 默认就没挂）。
 */
/** 「改了什么」的闭枚举。 */
export type EffectChangeKind = 
/** 配置 / patch / 启用状态 / 卸载。 */
'config'
/** 新装 bundle。 */
 | 'bundle-added'
/** 已装插件的**宿主端代码**，或改了插件依赖。 */
 | 'host-code'
/** 客户端代码 / 界面。 */
 | 'client-code';
/** 生效方式。 */
export type EffectMode = 
/** 热生效：loader 重读配置即可。 */
'hot'
/** HMR 自动换入（客户端侧）。 */
 | 'hmr'
/** 客户端需要重新构建 + 刷新（没挂 hmr 时的客户端路径）。 */
 | 'client-rebuild'
/** 必须重启进程。 */
 | 'restart-required';
/** hmr 探测结果。 */
export interface HmrProbe {
    /** 组合树里有没有 hmr 行。 */
    present: boolean;
    /**
     * 那一行是不是被禁用。
     *
     * `conditional` = `disabled:` 是一个 `!!js` 表达式（实测 web profile 上正是
     * `!!js '!ctx.get(''profileContext'')'`）—— 静态看是「按上下文决定」，
     * 不能当成确定可用，也不能当成确定不可用。
     */
    disabled: 'no' | 'yes' | 'conditional';
    /** 证据行（原样摘录，便于模型自己复核）。 */
    evidence: string[];
    /** 一句可读说明。 */
    note: string;
}
/** 判定输入。 */
export interface EffectInput {
    change: EffectChangeKind;
    /** 仅 `bundle-added` 用：该包是否**已经**在 profile 的 `dependencies` 里。 */
    alreadyInDependencies?: boolean;
    /** 该 profile 的 hmr 是否**真的可用**（`present && disabled !== 'yes'`）。 */
    hmrUsable: boolean;
}
/** 判定结果。 */
export interface EffectDecision {
    change: EffectChangeKind;
    /** 只看 SKILL §一 原表（不看 hmr）的答案。 */
    baseline: EffectMode;
    /** 结合 hmr 探测后的最终答案。 */
    mode: EffectMode;
    /** 是否因为 hmr 缺席而发生了降级。 */
    downgraded: boolean;
    /** 为什么 —— 模型真正读的是这句。 */
    why: string;
    hmrUsable: boolean;
}
/**
 * 探测组合树里的 hmr。
 *
 * 判据用**行**而不是「文本里出现过 `dsh-hmr`」：后者会把 `node_modules` 路径、
 * 注释里的提及也算成命中，于是「没挂 hmr」被判成「挂了」，工具开始假装热生效。
 *
 * @param configText `dsh --profile <p> --dump-config` 的 stdout。
 */
export declare function probeHmr(configText: string): HmrProbe;
/**
 * 判定一份改动需要什么才能生效。
 *
 * @param input 改动种类 + hmr 可用性。
 */
export declare function decideEffectMode(input: EffectInput): EffectDecision;
/**
 * SKILL §一 原表的答案（**不看 hmr**）。
 *
 * 为什么导出它（而不是让消费者自己复述那张表）：`dsh_check_effect_mode` 在 hmr
 * **不可核实**的 profile 上必须按「这次的答案是否依赖 hmr」分岔，而那个判据就是
 * 「原表答案是不是本来就是 `restart-required`」。表只有这一份 —— 抄第二份迟早漂，
 * 漂出来的形状是「工具说要重启、判定层说不用」（或反过来）。
 *
 * ⚠️ 下面那个 `switch` 是 SKILL §一 的原文，**不是**给消费者改的。
 *
 * @param input 判定输入（`hmrUsable` 这一格不参与，它只喂 {@link downgrade}）。
 */
export declare function baselineMode(input: EffectInput): EffectMode;
//# sourceMappingURL=effect.d.ts.map