import fs from "node:fs";
import path from "node:path";
import * as core from "../lib/core.js";
import { applePatches, groupOf } from "../lib/patches/apple.mjs";

const BAK_SUFFIX = ".applepurge.bak";

function aiBase() {
  const candidates = [];
  try {
    const found = core.findAiBase();
    if (found) candidates.push(found);
  } catch { /* not inside DSH */ }
  const env = String(process.env.DSH_BASE || "").trim();
  if (env) candidates.push(env);
  const resources = String(process.resourcesPath || "");
  if (resources) candidates.push(path.join(resources, "app", "dsh", "node_modules", "@deepseek-ai"));
  candidates.push("/Applications/DeepSeek Harness.app/Contents/Resources/app/dsh/node_modules/@deepseek-ai");
  candidates.push(path.join(process.execPath, "..", "Resources", "app", "dsh", "node_modules", "@deepseek-ai"));
  for (const c of candidates) {
    const norm = path.normalize(String(c));
    if (fs.existsSync(path.join(norm, "dsh-agent-instructions"))) return norm;
  }
  return "";
}

function targetsFor(patch, base) {
  if (!base) return [];
  let map;
  try {
    map = core.targetFiles(base);
  } catch {
    return [];
  }
  const keys = Array.isArray(patch.file) ? patch.file : [patch.file];
  const out = [];
  for (const key of keys) {
    const value = map[key];
    const list = Array.isArray(value) ? value : [value];
    for (const fp of list) {
      if (!fp || typeof fp !== "string") continue;
      try {
        if (fs.existsSync(fp) && !out.includes(fp)) out.push(fp);
      } catch { /* ignore */ }
    }
  }
  return out;
}

function markersHit(text, patch) {
  const markers = Array.isArray(patch.markers) ? patch.markers : [];
  if (!markers.length) return false;
  return patch.markersAny
    ? markers.some((m) => typeof m === "string" && text.includes(m))
    : markers.every((m) => typeof m === "string" && text.includes(m));
}

export function status(enabled) {
  const base = aiBase();
  const patches = applePatches(enabled);
  const rows = patches.map((p) => {
    const files = targetsFor(p, base);
    let state = "missing_file";
    let reason = "";
    if (files.length) {
      state = "pending";
      for (const fp of files) {
        try {
          const text = fs.readFileSync(fp, "utf8");
          if (markersHit(text, p)) {
            state = "applied";
            break;
          }
        } catch (e) {
          reason = String(e && e.message || e);
        }
      }
      if (state === "pending" && !files.length) state = "missing_file";
    }
    return { id: p.id, name: p.name, group: groupOf(p.id), files, state, reason };
  });
  const counts = rows.reduce((acc, r) => {
    acc[r.state] = (acc[r.state] || 0) + 1;
    return acc;
  }, {});
  return { base, total: rows.length, counts, rows };
}

export async function apply(enabled) {
  const patches = applePatches(enabled);
  const result = await core.applyPatchesAllHosts(patches, { forApply: true });
  return {
    hosts: (result.hosts || []).map((h) => ({
      aiBase: h.aiBase,
      summary: h.summary,
      report: h.report,
    })),
    report: result.report,
  };
}

export async function backup() {
  const base = aiBase();
  if (!base) throw new Error("未定位宿主目录");
  const result = await core.backupAll(base);
  return { base, errors: (result && result.errors) || [], files: (result && result.files) || 0 };
}

export async function revert() {
  const result = await core.revertAllHosts({ discover: true });
  return { reverted: result.reverted, errors: result.errors };
}

export { BAK_SUFFIX };