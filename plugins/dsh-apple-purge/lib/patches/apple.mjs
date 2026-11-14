// dsh-apple-purge: 只保留提示词洗白、持久化、审批与沙箱三组补丁。
// 条目定义来自 dsh-purge（MIT），此处只做筛选与段名改名，不改替换语义。
import { ALL_PATCHES } from "./index.mjs";

export const PATCH_GROUPS = [
  {
    key: "whiten",
    label: "提示词洗白",
    defaultEnabled: true,
    ids: [1, 2, 3, 4, 25, 29, 32, 33, 34, 36, 37, 43, 48, 50, 53, 54, 60, 61, 63, 93, 94],
  },
  {
    key: "persist",
    label: "持久化",
    defaultEnabled: true,
    ids: [40, 55, 57, 66, 67, 68, 69, 72, 74, 78, 87, 88],
  },
  {
    key: "approval",
    label: "审批与沙箱",
    defaultEnabled: false,
    ids: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 35, 51, 52, 62],
  },
];

const ALL_IDS = PATCH_GROUPS.flatMap((g) => g.ids);
export const APPLE_IDS = new Set(ALL_IDS);

// #40 只保留名字以 dsh-purge 开头的段；本插件的段叫 dsh-apple-purge，需要改判定。
const RENAME_FROM = 'startsWith("dsh-purge")';
const RENAME_TO = 'startsWith("dsh-apple-purge")';

function renameForApple(patch) {
  if (patch.id !== 40) return patch;
  const list = Array.isArray(patch.replacements)
    ? patch.replacements.map((rep) => {
        if (typeof rep.replace !== "string" || !rep.replace.includes(RENAME_FROM)) return rep;
        return { ...rep, replace: rep.replace.split(RENAME_FROM).join(RENAME_TO) };
      })
    : patch.replacements;
  return { ...patch, replacements: list };
}

export function groupOf(id) {
  const g = PATCH_GROUPS.find((item) => item.ids.includes(id));
  return g ? g.key : "";
}

export function applePatches(enabled = {}) {
  const active = new Set(
    PATCH_GROUPS.filter((g) => enabled[g.key] ?? g.defaultEnabled).flatMap((g) => g.ids),
  );
  return ALL_PATCHES.filter((p) => active.has(p.id)).map(renameForApple);
}

export function applePatchList(enabled = {}) {
  return applePatches(enabled).map((p) => ({
    id: p.id,
    name: p.name,
    group: groupOf(p.id),
    desc: p.desc || "",
  }));
}
