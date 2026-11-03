/**
 * `dsh_sign_cookie` —— 用本机 `.credentials.yaml` 里的持久签名密钥**自签** browser-session cookie。
 *
 * 对应 SKILL §3.4 与 SHAPE §1「派生类」。它是本仓**唯一会经手秘密**的工具，因此：
 *
 * 1. **独立成工具，绝不并进 `dsh_check_auth`**（SHAPE §1）：判据是「有没有秘密要经手」。
 *    并进去会让一个**判定型**输出带上凭证 —— 它的 `audit` 会被 spill 落盘。
 * 2. **cookie 本体不进返回值**。契约要求 `data` 是可无损落 JSON 的值，而 `audit` 会被
 *    spill 写到磁盘；凭证进 `audit` = 凭证落盘。所以本工具只报**签发成功与否**、
 *    **绑在哪个 authority**、**cookie 叫什么名** —— 值算完即弃，**只活在签名那一侧**。
 *    因此模型**拿不到可用的 cookie 值**：谁要用它，谁就得直接调签名器（`lib/cookie-sign.ts`
 *    导出的 `signCookie` / `cookieHeader`），这条通道读不回来。
 * 3. **只读**（B10）：读一个文件 + 在内存里算 HMAC，**不写**任何东西、不发任何请求。
 *    它不联网 —— 「签出来」与「用上去」是分开的动作，后者由人或浏览器做。
 *
 * ## 一条被真机钉住的反直觉点（`lib/cookie-sign.ts` 有完整出处）
 *
 * cookie 绑定 authority（`host:port`）**逐字匹配**。而宿主算 audience 读的是 `Host`
 * 请求头 —— `fetch`（undici）**静默忽略显式设置的 `Host`**，所以实际 authority 由
 * **连接地址**决定。实测（2026-10-13，本机 `0.2.1-alpha.2`）：显式发
 * `Host: localhost:3080` 仍按 `127.0.0.1:3080` 算，得到 **401**。
 * ⇒ `host` 参数必须填**你真正要连的那个地址**，不是「浏览器地址栏里看着像的那个」。
 *
 * ## 为什么它不是「绕过认证」
 *
 * 它用**本机自己的**密钥、在**本机自己的** `DSH_HOME` 里签 —— 没有第二个宿主、没有
 * 网络往返、没有提权。它做的事与浏览器登录后拿到的 cookie 完全同构，只是省掉了那次交互。
 */
import { type ToolDefinition } from '@deepseek-ai/dsh-tools';
import { cookieHeader } from '../lib/cookie-sign.js';
import { type ToolDescription } from './describe.js';
import { type ToolDeps } from './shared.js';
/** 工具名。 */
export declare const SIGN_COOKIE_TOOL = "dsh_sign_cookie";
/**
 * 本工具的描述（SHAPE §2.1 四段骨架）。
 *
 * - `what`：动词 + 对象，并明说它**产出凭证**。
 * - `useWhen`：路由信号 —— `check_auth` 刚报 401，且要让脚本 / 命令行客户端带上 cookie。
 * - `boundary`：**这一类才有代价段**（SHAPE §3.1）：① 它读密钥，这是本仓唯一经手秘密的
 *   工具；② cookie 值**不会**出现在输出里。这两句是承重的 —— 不写，模型会以为返回值里
 *   就有可直接用的 cookie，而那时它会去找一个不存在的东西。
 */
export declare const SIGN_COOKIE_DESCRIPTION: ToolDescription;
/**
 * 造工具。
 *
 * @param deps 运行期依赖。
 */
export declare function createSignCookieTool(deps: ToolDeps): ToolDefinition;
/** 导给测试与真机脚本用：本工具算出的 `Cookie:` 头那一段。 */
export { cookieHeader };
//# sourceMappingURL=dsh_sign_cookie.d.ts.map