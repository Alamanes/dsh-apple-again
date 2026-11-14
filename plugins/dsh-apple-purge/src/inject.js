import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DEFAULT_INJECT } from "./defaults.js";

export function dshHome() {
  const env = String(process.env.DSH_HOME || "").trim();
  return env || path.join(os.homedir(), ".dsh");
}

export function stateDir(home = dshHome()) {
  return path.join(home, "apple-purge");
}

export function injectFile(home = dshHome()) {
  return path.join(stateDir(home), "inject.md");
}

export function stateFile(home = dshHome()) {
  return path.join(stateDir(home), "state.json");
}

export function fullInjectFile() {
  return path.join(path.dirname(new URL(import.meta.url).pathname), "..", "docs", "full-inject.md");
}

export function readInject(home = dshHome()) {
  try {
    const text = fs.readFileSync(injectFile(home), "utf8");
    return text.trim() ? text : DEFAULT_INJECT;
  } catch {
    return DEFAULT_INJECT;
  }
}

export function writeInject(text, home = dshHome()) {
  const dir = stateDir(home);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const fp = injectFile(home);
  const tmp = fp + ".tmp-" + process.pid;
  fs.writeFileSync(tmp, String(text ?? ""), { mode: 0o600 });
  fs.renameSync(tmp, fp);
  return fp;
}

export function resetInject(home = dshHome()) {
  try {
    fs.unlinkSync(injectFile(home));
  } catch {
    /* already default */
  }
  return DEFAULT_INJECT;
}

export function readFullInject(home = dshHome()) {
  const local = path.join(stateDir(home), "full-inject.md");
  try {
    return fs.readFileSync(local, "utf8");
  } catch { /* fall through to the bundled copy */ }
  try {
    return fs.readFileSync(fullInjectFile(), "utf8");
  } catch {
    return "";
  }
}

export function isCustomInject(home = dshHome()) {
  try {
    const text = fs.readFileSync(injectFile(home), "utf8");
    return text.trim().length > 0 && text !== DEFAULT_INJECT;
  } catch {
    return false;
  }
}

const DEFAULT_STATE = { modules: { whiten: true, persist: true, approval: false } };

export function readState(home = dshHome()) {
  try {
    const raw = JSON.parse(fs.readFileSync(stateFile(home), "utf8"));
    return {
      modules: { ...DEFAULT_STATE.modules, ...(raw && raw.modules) },
      lastApply: raw && raw.lastApply ? raw.lastApply : null,
    };
  } catch {
    return { ...DEFAULT_STATE, lastApply: null };
  }
}

export function writeState(next, home = dshHome()) {
  const dir = stateDir(home);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const fp = stateFile(home);
  const tmp = fp + ".tmp-" + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, fp);
}