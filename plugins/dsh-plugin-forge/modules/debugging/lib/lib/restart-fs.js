import { systemErrorCode } from './errors.js';
/** 宿主 `fs` 服务在 Cordis 上的注册名（`FileSystem` 的 `super(ctx, 'fs')`）。 */
const HOST_FS_SERVICE = 'fs';
/** 唯独这个码算「文件不在」；其余一律「读不到」。 */
const FS_NOT_FOUND = 'FS_NOT_FOUND';
/** 「宿主要求先观察过这个目标」——只在有人显式传 `createIfAbsent` 时才出现。 */
const FS_NOT_OBSERVED = 'FS_NOT_OBSERVED';
/**
 * 取宿主 `fs` 服务；**拿不到、或形状不认识**都返回 `undefined`（不猜）。
 *
 * @param ctx 宿主上下文（可以是单测替身）。
 */
function hostFsOf(ctx) {
    const getter = ctx.get;
    if (typeof getter !== 'function')
        return undefined;
    const service = getter.call(ctx, HOST_FS_SERVICE);
    if (service === null || typeof service !== 'object')
        return undefined;
    const candidate = service;
    // 三个必需方法都必须是函数：服务在、但形状不对（宿主换版本）同样算「不可用」，
    // 而不是「调用时再炸」——后者会让「不可用」在更晚、更难查的地方才现形。
    for (const method of ['resolve', 'readText', 'writeText']) {
        if (typeof candidate[method] !== 'function')
            return undefined;
    }
    return service;
}
/**
 * 宿主 `fs` 服务**不可用**的原因；可用时返回 `undefined`。
 *
 * 给上层一个**早失败**的口子：`undefined` 之外的任何值都意味着「这次一定读不到 marker」，
 * 上层据此给结构化失败（`not-configured` 一类），而**不是**静默当成「没有 marker」。
 *
 * @param ctx 宿主上下文。
 */
export function hostFsUnavailableReason(ctx) {
    if (typeof ctx.get !== 'function') {
        return 'this context exposes no service getter, so the host fs service cannot be reached';
    }
    const service = ctx.get(HOST_FS_SERVICE);
    if (service === null || service === undefined) {
        return 'the host fs service is not registered in this composition';
    }
    if (typeof service !== 'object') {
        return `the host fs service is not a service object (got ${typeof service})`;
    }
    const missing = ['resolve', 'readText', 'writeText'].filter((method) => typeof service[method] !== 'function');
    if (missing.length > 0) {
        return `the host fs service is missing ${missing.join(', ')}`;
    }
    return undefined;
}
/**
 * 取一个异常的稳定码（宿主 `FsError` 的 `code`；其它异常没有）。
 *
 * 实现直接用 `errors.ts` 的正典 `systemErrorCode`（多读 `cause` 那一半 ——
 * node:fs 的错误常包在 cause 里；本地原有一份只读顶层的弱化副本已删，
 * 与 2026-10-16 审计 A6 揪出的 `list_instances` 同族）。
 *
 * @param error 任意异常。
 */
function errorCodeOf(error) {
    return systemErrorCode(error);
}
/**
 * 把任意异常写成一句英文事实（`code` 优先 —— 它是稳定判据，message 会随版本变）。
 *
 * @param error 任意异常。
 */
function reasonOf(error) {
    const code = errorCodeOf(error);
    const message = error instanceof Error ? error.message : String(error);
    // ⚠️ 与 restart-recovery.ts 的 describeError 形状相似但**不同义**：
    // 这里的 message 兜底是 messageOf 语义（Error.message / String），
    // 那边是多级兜底（message → name → 'unknown error'）—— 最后一行的
    // `${code}: ${message}` 拼接相同只是巧合，别按同语义收拢（审计 A7 判定）。
    return code === undefined ? message : `${code}: ${message}`;
}
/**
 * 造一个走宿主 `ctx.fs` 的 {@link RestartFsPort}。
 *
 * **每次调用现取服务**（apply 期拿不到，实测见文件头）—— 不缓存、不闭包捕获实例。
 *
 * 路径**一律作为实参进来**：本层不构造任何路径，落点的唯一出处是
 * `src/lib/restart.ts` 的 `restartMarkerPath`（「一处一事实」）。
 *
 * @param ctx 宿主上下文。
 * @param options 选项（目前只有沙箱策略透传）。
 */
export function createRestartFsPort(ctx, options = {}) {
    /** 读一个文件；**只把 `FS_NOT_FOUND` 当缺席**。 */
    const read = async (path) => {
        const fs = hostFsOf(ctx);
        if (fs === undefined) {
            // 服务缺席**不是**「文件不在」—— 这是本层最要紧的一格。
            return {
                status: 'unreadable',
                reason: hostFsUnavailableReason(ctx) ?? 'the host fs service is unavailable',
            };
        }
        let target;
        try {
            target = await fs.resolve(path);
        }
        catch (error) {
            return { status: 'unreadable', reason: reasonOf(error) };
        }
        try {
            return { status: 'text', text: await fs.readText(target) };
        }
        catch (error) {
            if (errorCodeOf(error) === FS_NOT_FOUND)
                return { status: 'absent' };
            // 其余一切都不是「不在」：形状不认识也不许猜（认不出来就报「读不到」）。
            return { status: 'unreadable', reason: reasonOf(error) };
        }
    };
    /**
     * 写一个文件。
     *
     * 两点是有意的：
     * ① **不传 `expected`** ⇒ 宿主的语义是「无条件 create-or-overwrite」（实测：同一个路径
     *    第二次写回的是 `operation: 'update'`，**不抛**）。marker 的改写（含「消费」那次）
     *    因此天然幂等，**不需要预先读一次**。
     * ② 万一后端**要求先观察过**（只有显式 `createIfAbsent` 才会引来 `FS_NOT_OBSERVED`），
     *    就**读一次再重试同一次无条件写**；重试仍失败**原样抛出** —— 绝不吞成「写成功」。
     */
    const write = async (path, text) => {
        const fs = hostFsOf(ctx);
        if (fs === undefined) {
            throw new Error(hostFsUnavailableReason(ctx) ?? 'the host fs service is unavailable');
        }
        const target = await fs.resolve(path);
        try {
            await fs.writeText(target, text, undefined, undefined, options.sandboxPolicy);
        }
        catch (error) {
            if (errorCodeOf(error) !== FS_NOT_OBSERVED)
                throw error;
            // 读一次（= 记下观察），再重试。读失败就让它抛：那是更真实的障碍。
            await fs.readText(target);
            await fs.writeText(target, text, undefined, undefined, options.sandboxPolicy);
        }
    };
    return { read, write };
}
//# sourceMappingURL=restart-fs.js.map