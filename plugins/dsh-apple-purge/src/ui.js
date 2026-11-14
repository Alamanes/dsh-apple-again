const PAGE = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" type="image/png" href="/dsh-apple-purge/icon.png">
<title>限制</title>
<style>
  :root{
    --ink:#0d1117; --ink-2:#151b23; --line:#242d38; --paper:#e9eef4; --dim:#8a97a6;
    --signal:#c6f24e; --alert:#ff8a5b; --ok:#7bd88f;
  }
  *{box-sizing:border-box}
  html,body{margin:0;background:var(--ink);color:var(--paper);
    font:14px/1.6 -apple-system,"PingFang SC","Helvetica Neue",sans-serif}
  body{min-height:100vh;display:flex;flex-direction:column}
  body.standalone header{padding-top:38px}
  header{display:flex;align-items:center;gap:18px;padding:16px 24px;border-bottom:1px solid var(--line)}
  .brand{display:flex;align-items:baseline;gap:10px}
  .brand b{font:600 17px/1 "Iowan Old Style","Songti SC",serif;letter-spacing:.02em}
  .brand span{color:var(--dim);font-size:12px;letter-spacing:.14em}
  .mark{color:var(--signal)}
  .meta{margin-left:auto;color:var(--dim);font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;
    max-width:52ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  button{font:inherit;color:var(--paper);background:transparent;border:1px solid var(--line);
    padding:6px 14px;border-radius:2px;cursor:pointer;transition:border-color .15s,color .15s}
  button:hover{border-color:var(--signal);color:var(--signal)}
  button.primary{border-color:var(--signal);color:var(--signal)}
  button:disabled{opacity:.45;cursor:default}
  main{display:grid;grid-template-columns:230px 1fr;flex:1;min-height:0}
  aside{border-right:1px solid var(--line);padding:18px 16px;display:flex;flex-direction:column;gap:22px}
  .label{color:var(--dim);font-size:11px;letter-spacing:.16em;margin-bottom:10px}
  .mod{display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--line)}
  .mod:last-child{border-bottom:0}
  .mod b{font-weight:500}
  .mod small{display:block;color:var(--dim);font-size:11px}
  .switch{position:relative;width:34px;height:18px;border:1px solid var(--line);border-radius:9px;
    background:transparent;cursor:pointer;flex:none}
  .switch i{position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;
    background:var(--dim);transition:transform .18s,background .18s}
  .switch[aria-checked="true"]{border-color:var(--signal)}
  .switch[aria-checked="true"] i{transform:translateX(16px);background:var(--signal)}
  .actions{display:flex;flex-direction:column;gap:8px}
  .actions button{text-align:left}
  .up{font:12px/1.7 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--dim)}
  .up b{color:var(--paper);font-weight:500}
  .up .new{color:var(--signal)}
  .up a{color:var(--signal);text-decoration:none;border-bottom:1px solid #3b4a2a}
  .editor{display:flex;flex-direction:column;min-height:0;padding:18px 24px 0}
  .editor-bar{display:flex;align-items:center;gap:12px;margin-bottom:10px}
  .editor-bar .label{margin:0}
  #count{margin-left:auto;color:var(--dim);font:12px ui-monospace,SFMono-Regular,Menlo,monospace}
  textarea{flex:1;min-height:340px;resize:none;background:var(--ink-2);border:1px solid var(--line);
    color:var(--paper);padding:16px;font:13px/1.75 ui-monospace,SFMono-Regular,Menlo,monospace;
    border-radius:2px;outline:none;tab-size:2}
  textarea:focus{border-color:var(--signal)}
  .editor-actions{display:flex;gap:8px;padding:12px 0 16px}
  .editor-actions .spacer{flex:1}
  .patches{padding:0 24px 28px}
  table{width:100%;border-collapse:collapse;font-size:12.5px}
  th{color:var(--dim);font-weight:400;text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);
    letter-spacing:.06em}
  td{padding:7px 10px;border-bottom:1px solid var(--line);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
  td.name{font-family:inherit}
  .st{font-size:11px;letter-spacing:.08em;padding:2px 7px;border:1px solid var(--line);border-radius:2px}
  .st.applied{color:var(--ok);border-color:#2c4a37}
  .st.pending{color:var(--alert);border-color:#4a332c}
  .st.missing_file{color:var(--dim)}
  .toast{position:fixed;right:24px;bottom:24px;background:var(--ink-2);border:1px solid var(--line);
    padding:10px 16px;border-radius:2px;font-size:13px;opacity:0;transform:translateY(6px);
    transition:opacity .18s,transform .18s;pointer-events:none}
  .toast.show{opacity:1;transform:none}
  @media (max-width:760px){main{grid-template-columns:1fr}aside{border-right:0;border-bottom:1px solid var(--line)}}
</style>
</head>
<body class="standalone">
<header>
  <div class="brand"><span class="mark">&#9680;</span><b>限制</b><span>PROMPT CONSOLE</span></div>
  <div class="meta" id="meta">正在读取宿主状态…</div>
  <button id="refresh">刷新</button>
</header>
<main>
  <aside>
    <section>
      <div class="label">模块</div>
      <div id="modules"></div>
    </section>
    <section>
      <div class="label">补丁</div>
      <div class="actions">
        <button class="primary" id="apply">应用到宿主</button>
        <button id="revert">从备份回滚</button>
      </div>
    </section>
    <section>
      <div class="label">上游</div>
      <div class="up" id="upstream">读取中…</div>
      <div class="actions" style="margin-top:10px">
        <button id="checkUpdate">检查上游版本</button>
      </div>
    </section>
  </aside>
  <section class="editor">
    <div class="editor-bar"><div class="label">注入正文</div><span id="count"></span></div>
    <textarea id="text" spellcheck="false"></textarea>
    <div class="editor-actions">
      <button class="primary" id="save">保存</button>
      <button id="reset">恢复默认</button>
      <span class="spacer"></span>
      <button id="full">载入完整原版</button>
    </div>
  </section>
</main>
<section class="patches">
  <div class="label">补丁清单</div>
  <table><thead><tr><th style="width:52px">#</th><th>名称</th><th style="width:120px">分组</th><th style="width:96px">状态</th></tr></thead>
  <tbody id="rows"></tbody></table>
</section>
<div class="toast" id="toast"></div>
<script>
const API = "/dsh-apple-purge";
const EMBED = new URLSearchParams(location.search).has("embed");
if (EMBED) document.body.classList.remove("standalone");
const $ = (id) => document.getElementById(id);
const GROUP_NAME = { whiten: "洗白", persist: "持久化", approval: "审批沙箱" };
let state = null;

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}
async function call(path, options) {
  const res = await fetch(API + path, Object.assign({ headers: { "content-type": "application/json" } }, options || {}));
  const data = await res.json();
  if (!res.ok || data.ok === false) throw new Error(data.error || res.status);
  return data;
}
function renderModules(modules, groups) {
  const box = $("modules");
  box.innerHTML = "";
  for (const g of groups) {
    const row = document.createElement("div");
    row.className = "mod";
    row.innerHTML = '<div><b>' + g.label + '</b><small>' + g.count + ' 条</small></div>';
    const sw = document.createElement("button");
    sw.className = "switch";
    sw.setAttribute("role", "switch");
    sw.setAttribute("aria-checked", String(Boolean(modules[g.key])));
    sw.innerHTML = "<i></i>";
    sw.onclick = async () => {
      const next = !Boolean(modules[g.key]);
      sw.disabled = true;
      try {
        const data = await call("/module", { method: "POST", body: JSON.stringify({ key: g.key, enabled: next }) });
        modules[g.key] = next;
        renderModules(modules, groups);
        toast((next ? "已开启 " : "已关闭 ") + g.label);
      } catch (e) { toast("失败：" + e.message); sw.disabled = false; }
    };
    row.appendChild(sw);
    box.appendChild(row);
  }
}
function renderRows(rows) {
  const body = $("rows");
  body.innerHTML = "";
  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = "<td>" + r.id + "</td><td class='name'>" + r.name + "</td><td>" + (GROUP_NAME[r.group] || r.group) + "</td>" +
      "<td><span class='st " + r.state + "'>" + r.state + "</span></td>";
    body.appendChild(tr);
  }
}
async function load() {
  const data = await call("/status");
  state = data;
  $("meta").textContent = data.base || "未定位宿主目录";
  renderModules(data.modules, data.groups);
  renderRows(data.patches);
  const counts = data.counts || {};
  $("meta").textContent = (data.base || "未定位宿主") + "  ·  " +
    "applied " + (counts.applied || 0) + " / pending " + (counts.pending || 0) + " / missing " + (counts.missing_file || 0);
  const t = await call("/text");
  $("text").value = t.text;
  $("count").textContent = t.text.length + " 字符" + (t.custom ? " · 自定义" : " · 默认");
}
async function loadUpdate(force) {
  const box = $("upstream");
  box.textContent = "检查中…";
  try {
    const d = await call("/update" + (force ? "?force=1" : ""));
    if (d.error) { box.textContent = "检查失败：" + d.error; return; }
    const when = d.checkedAt ? new Date(d.checkedAt).toLocaleString() : "";
    box.innerHTML = "当前插件 <b>" + d.version + "</b><br>上游最新 <b class='" + (d.hasUpdate ? "new" : "") + "'>" +
      (d.latest || "未知") + "</b>" + (d.hasUpdate ? " · 有新版" : " · 已同步") +
      "<br><a href='" + d.url + "' target='_blank' rel='noreferrer'>打开上游发行页</a><br>" +
      "<span style='color:var(--dim)'>" + when + (d.cached ? " · 缓存" : "") + "</span>";
  } catch (e) { box.textContent = "检查失败：" + e.message; }
}
$("checkUpdate").onclick = () => loadUpdate(true);
$("refresh").onclick = () => { load().catch((e) => toast(e.message)); loadUpdate(true); };
$("save").onclick = async () => {
  try {
    await call("/text", { method: "POST", body: JSON.stringify({ text: $("text").value }) });
    $("count").textContent = $("text").value.length + " 字符 · 自定义";
    toast("已保存，下一轮生效");
  } catch (e) { toast("失败：" + e.message); }
};
$("reset").onclick = async () => {
  try {
    const d = await call("/reset", { method: "POST", body: "{}" });
    $("text").value = d.text;
    $("count").textContent = d.text.length + " 字符 · 默认";
    toast("已恢复默认");
  } catch (e) { toast("失败：" + e.message); }
};
$("full").onclick = async () => {
  try {
    const d = await call("/full");
    $("text").value = d.text;
    $("count").textContent = d.text.length + " 字符 · 完整原版（未保存）";
    toast("已载入完整原版，可自行精简后保存");
  } catch (e) { toast("失败：" + e.message); }
};
$("apply").onclick = async () => {
  const btn = $("apply");
  btn.disabled = true;
  try { await call("/apply", { method: "POST", body: "{}" }); toast("补丁已写入，重启 DSH 后生效"); await load(); }
  catch (e) { toast("失败：" + e.message); }
  finally { btn.disabled = false; }
};
$("revert").onclick = async () => {
  try { await call("/revert", { method: "POST", body: "{}" }); toast("已从备份回滚"); await load(); }
  catch (e) { toast("失败：" + e.message); }
};
load().catch((e) => { $("meta").textContent = "加载失败：" + e.message; });
loadUpdate(false);
</script>
</body>
</html>`;

export function renderPage() {
  return PAGE;
}
