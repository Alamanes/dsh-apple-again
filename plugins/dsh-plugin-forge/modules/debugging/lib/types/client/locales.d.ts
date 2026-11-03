/**
 * 卡片文案字典（**中英双语，跟随界面语言切换**）。
 *
 * 形状照 `dsh-zhihu-search/src/client/locales.ts` 的骨架：命名空间合并进
 * `LocaleNamespaceMap`，key 因此有类型约束 —— 拼错或漏译都是**编译错误**，而不是运行时的空白。
 * 注册走 `register` 的 **typed 形态**（`ns, dicts`），它要求 `Record<BuiltInLocaleId, …>`；
 * `LOCALE_IDS` 恰好是 `["zh", "en"]` 两项 ⇒ 双语是这套 API 的**原生形状**，不是让步。
 *
 * ✅ **这里可以有 CJK**（维护者 2026-10-15 拍板：界面跟随中英文切换）。
 * 判据 B14（「`src/**` 的字符串字面量不许 CJK」）守的是**模型可见**字符串 ——
 * 而界面文案**到不了模型**，所以它**排除 `src/client/`**（判据里有注释说明理由）。
 * ⚠️ 反过来说：**这一条不能被误用成「所有中文都能进 `src/**`」** —— 工具的 `data` 文本字段、
 * `message`、`nextStep.why`、render 文本仍**必须英文**，那条判据在别处照样判红。
 */
import type { BuiltInLocaleId } from '@deepseek-ai/dsh-client-locale';
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots';
/**
 * 字典命名空间。
 *
 * 与槽的分派 key **同名但是两件事**：分派 key 是**包名**（描述「哪个 bundle 的配置」），
 * 这个命名空间只标识本卡片的文案归属，由注册时的 `locale:` 座位用。
 * 两者今天恰好同串，改一处不该顺手改另一处 —— 谁都不是谁的真源。
 */
export declare const LOCALE_NS = "dsh-plugin-debugging";
/** 本卡片全部文案的 key。`enableRestartInstallHint` 已并入 `enableRestartHint`（合成一行）。 */
export type RestartToggleLocaleKey = 'readOnly' | 'enableRestartLabel' | 'enableRestartOn' | 'enableRestartOff' | 'enableRestartHint' | 'save' | 'saving' | 'saveRejected';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'dsh-plugin-debugging': RestartToggleLocaleKey;
    }
}
/**
 * 本卡片注册的全部语言（typed 形态要的就是这张表）。
 *
 * 取值范围见 `dsh-client-locale` 的 `LOCALE_IDS` —— 它恰好是 `["zh", "en"]` 两项，
 * 所以这张表**必须是两个键**，少一个就编译不过（那正是我们要的：漏译不许静默）。
 */
export declare const RESTART_TOGGLE_LOCALES: Record<BuiltInLocaleId, Record<RestartToggleLocaleKey, string>>;
/** 供上层复用的命名空间表类型。 */
export type { LocaleNamespaceMap };
