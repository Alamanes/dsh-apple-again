/** 宿主 `webApp` 服务的注册名（`ctx.provide('webApp', …)`）。 */
const WEB_APP_SERVICE = 'webApp';
/** 宿主 `connection` 服务的注册名（`HostConnectionService` 的 `super(ctx, 'connection')`）。 */
const CONNECTION_SERVICE = 'connection';
/** 宿主 `webServer` 服务的注册名（`get port()` 是**实际监听**端口）。 */
const WEB_SERVER_SERVICE = 'webServer';
/**
 * 本进程的 Web 根地址 + launch token；任一环缺席即 `undefined`。
 *
 * **不带 token 就不返回**：调用方（窗口）把「没有地址」显示成一句话，比显示一个必定 401 的
 * 链接诚实得多。
 *
 * @param ctx 宿主上下文。
 */
export function stopWindowUrlOf(ctx) {
    const getter = ctx.get;
    if (typeof getter !== 'function')
        return undefined;
    const webApp = getter.call(ctx, WEB_APP_SERVICE);
    const root = typeof webApp?.getAdvertisedUrl === 'function' ? webApp.getAdvertisedUrl() : undefined;
    if (typeof root !== 'string' || root === '')
        return undefined;
    const connection = getter.call(ctx, CONNECTION_SERVICE);
    const url = typeof connection?.authenticatedUrl === 'function'
        ? connection.authenticatedUrl(root)
        : undefined;
    if (typeof url !== 'string' || url === '')
        return undefined;
    return url;
}
/**
 * 宿主**实际监听**的端口；没在监听 / 服务不在场即 `undefined`。
 *
 * 与 `src/tools/index.ts` 的 `webServerPortOf` 同一份事实，但那一处是工具层的私有闭包；
 * 本层要在启动期用一次，所以在这里给一个同名语义的公开实现，工具层复用**这一个**
 * （`src/tools/index.ts` 已改为从本文件导入，避免两份实现漂移）。
 *
 * `0` 是非正数、不是一个端口：`webServer` 在 `listen` 之前 `port` 就是 `undefined`，
 * 而 schema 上的 `0` 是「用户没填」的哨兵 —— 两者都不许进文件名（见 `restart.ts`
 * 的 `requireResolvedPort`）。
 *
 * @param ctx 宿主上下文。
 */
export function listeningPortOf(ctx) {
    const getter = ctx.get;
    if (typeof getter !== 'function')
        return undefined;
    const server = getter.call(ctx, WEB_SERVER_SERVICE);
    const port = server?.port;
    return typeof port === 'number' && Number.isSafeInteger(port) && port > 0 ? port : undefined;
}
/**
 * 把「一次发布」序列化成落盘文本。
 *
 * 两行、`key=value`，与停止窗口读它的方式一一对应（那一边是纯 ASCII 的 PowerShell，
 * 不引 JSON 解析）。**`url` 缺席时也要写这一格**：空值让窗口显示「还没有地址」，
 * 而不是让它去猜上一行是不是结尾。
 *
 * @param pid 发布者（宿主）的 pid —— 窗口据此判这份地址属不属于当前绑定的宿主。
 * @param url 带 token 的完整地址；`undefined` = 本次不发布（回收时也用它）。
 */
export function serializeStopWindowUrl(pid, url) {
    return `pid=${String(pid)}\r\nurl=${url ?? ''}\r\n`;
}
//# sourceMappingURL=stop-url.js.map