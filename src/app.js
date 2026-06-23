import { initSupabase, supabase, isConfigured } from "./supabaseClient.js";
import { STORAGE_BUCKET, SUPABASE_URL } from "./config.js";
import { ANALYSIS_SUMMARY, CHAPTERS, NOTE_SEEDS, QUESTION_SEEDS, SOURCE_SEEDS } from "./data/seed.js";

const state = {
  view: "dashboard",
  session: null,
  profile: null,
  questions: [],
  notes: [],
  attachments: [],
  sources: [],
  filters: {},
  selected: null,
  studyIndex: 0,
  studyReveal: false,
  busy: false,
  loadError: "",
  theme: localStorage.getItem("ic-study-theme") || "auto",
};

const $ = (selector) => document.querySelector(selector);
const app = $("#app");
const localKey = "ic-study-progress";
const configKey = "ic-study-config-hint-hidden";
const themeKey = "ic-study-theme";

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function md(value = "") {
  const escaped = escapeHtml(value);
  return escaped
    .replace(/!\[(.*?)\]\((.*?)\)/g, '<img class="inline-image" alt="$1" src="$2" data-zoom="$2">')
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}

function renderMath() {
  if (window.renderMathInElement) {
    window.renderMathInElement(document.body, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
      ],
      throwOnError: false,
    });
  }
}

function progress() {
  return JSON.parse(localStorage.getItem(localKey) || "{}");
}

function saveProgress(next) {
  localStorage.setItem(localKey, JSON.stringify(next));
}

function currentUserId() {
  return state.session?.user?.id || null;
}

function statusOf(item) {
  if (item.status) return item.status;
  if (!item.answer && !item.analysis) return "待补充";
  if (!item.answer || !item.analysis) return "待完善";
  return "已整理";
}

function parseTags(input) {
  if (Array.isArray(input)) return input.filter(Boolean);
  return String(input || "")
    .split(/[,，#\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function tagsHtml(tags = []) {
  return parseTags(tags)
    .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
    .join("");
}

function showToast(message, type = "ok") {
  const old = $(".toast");
  if (old) old.remove();
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function sourceOf(item) {
  return item.source_text || item.source || item.path || "";
}

function isPending(item) {
  return ["待补充", "待完善", "待整理"].includes(statusOf(item));
}

async function init() {
  applyTheme();
  await initSupabase();
  if (isConfigured) {
    const { data } = await supabase.auth.getSession();
    state.session = data.session;
    supabase.auth.onAuthStateChange((_event, session) => {
      state.session = session;
      loadAll();
    });
  }
  await loadAll();
}

async function loadAll() {
  state.busy = true;
  render();
  try {
    if (!isConfigured) {
      state.sources = SOURCE_SEEDS;
      state.questions = QUESTION_SEEDS.map((q, i) => ({ id: `seed-q-${i}`, status: "待补充", ...q }));
      state.notes = NOTE_SEEDS.map((n, i) => ({ id: `seed-n-${i}`, status: "待整理", ...n }));
      state.attachments = [];
      state.profile = null;
      state.loadError = "";
      return;
    }

    const userId = currentUserId();
    const [questions, notes, attachments, sources, profile] = await Promise.all([
      supabase.from("questions").select("*").eq("archived", false).order("updated_at", { ascending: false }),
      supabase.from("knowledge_notes").select("*").eq("archived", false).order("updated_at", { ascending: false }),
      supabase.from("attachments").select("*").eq("archived", false).order("created_at", { ascending: false }),
      supabase.from("sources").select("*").eq("archived", false).order("created_at", { ascending: false }),
      userId ? supabase.from("profiles").select("*").eq("id", userId).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    for (const res of [questions, notes, attachments, sources, profile]) {
      if (res.error) throw res.error;
    }
    state.questions = questions.data || [];
    state.notes = notes.data || [];
    state.attachments = attachments.data || [];
    state.sources = sources.data || [];
    state.profile = profile.data;
    state.loadError = "";
    if (!state.sources.length && state.questions.length === 0 && state.notes.length === 0) {
      state.sources = SOURCE_SEEDS;
      state.questions = QUESTION_SEEDS.map((q, i) => ({ id: `seed-q-${i}`, status: "待补充", ...q }));
      state.notes = NOTE_SEEDS.map((n, i) => ({ id: `seed-n-${i}`, status: "待整理", ...n }));
    }
  } catch (error) {
    state.loadError = error.message;
    state.sources = SOURCE_SEEDS;
    state.questions = QUESTION_SEEDS.map((q, i) => ({ id: `seed-q-${i}`, status: "待补充", ...q }));
    state.notes = NOTE_SEEDS.map((n, i) => ({ id: `seed-n-${i}`, status: "待整理", ...n }));
    state.attachments = [];
    showToast(error.message, "bad");
  } finally {
    state.busy = false;
    render();
  }
}

async function login(email) {
  if (!isConfigured) return showToast("请先配置 Supabase URL 和 anon key", "bad");
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + window.location.pathname },
  });
  if (error) return showToast(error.message, "bad");
  showToast("登录邮件已发送，请查看邮箱");
}

async function logout() {
  await supabase.auth.signOut();
}

async function saveProfile(form) {
  const userId = currentUserId();
  if (!userId) return;
  const payload = {
    id: userId,
    nickname: form.nickname.value.trim(),
    emoji_avatar: form.emoji_avatar.value.trim() || "🧪",
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("profiles").upsert(payload);
  if (error) return showToast(error.message, "bad");
  showToast("个人信息已保存");
  await loadAll();
}

async function uploadFiles(files, objectType, objectId) {
  if (!files?.length || !isConfigured || !objectId || String(objectId).startsWith("seed-")) return [];
  const uploaded = [];
  for (const file of files) {
    const ext = file.name.split(".").pop();
    const path = `${objectType}/${objectId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    const row = {
      object_type: objectType,
      object_id: objectId,
      file_name: file.name,
      file_type: file.type,
      storage_bucket: STORAGE_BUCKET,
      storage_path: path,
      public_url: data.publicUrl,
      created_by: currentUserId(),
      updated_by: currentUserId(),
    };
    const inserted = await supabase.from("attachments").insert(row).select().single();
    if (inserted.error) throw inserted.error;
    uploaded.push(inserted.data);
  }
  return uploaded;
}

async function saveQuestion(form) {
  if (!state.session) return showToast("登录后才能新增或编辑", "bad");
  const id = form.id.value;
  const payload = {
    title: form.title.value.trim(),
    type: form.type.value,
    chapter: form.chapter.value,
    tags: parseTags(form.tags.value),
    difficulty: form.difficulty.value,
    answer: form.answer.value.trim(),
    analysis: form.analysis.value.trim(),
    related_formulas: form.related_formulas.value.trim(),
    source_text: form.source_text.value.trim(),
    status: form.status.value,
    known_conditions: form.known_conditions.value.trim(),
    solve_goal: form.solve_goal.value.trim(),
    used_formulas: form.used_formulas.value.trim(),
    solution_steps: form.solution_steps.value.trim(),
    final_answer: form.final_answer.value.trim(),
    common_mistakes: form.common_mistakes.value.trim(),
    updated_by: currentUserId(),
  };
  if (!id) payload.created_by = currentUserId();
  const query = id
    ? supabase.from("questions").update(payload).eq("id", id).select().single()
    : supabase.from("questions").insert(payload).select().single();
  const { data, error } = await query;
  if (error) return showToast(error.message, "bad");
  try {
    await uploadFiles(form.images.files, "question", data.id);
  } catch (error) {
    showToast(error.message, "bad");
  }
  showToast(id ? "题目已更新" : "题目已新增");
  state.view = "questions";
  await loadAll();
}

async function saveNote(form) {
  if (!state.session) return showToast("登录后才能新增或编辑", "bad");
  const id = form.id.value;
  const selectedQuestionIds = Array.from(form.related_question_ids.selectedOptions).map((x) => x.value);
  const payload = {
    title: form.title.value.trim(),
    body: form.body.value.trim(),
    chapter: form.chapter.value,
    tags: parseTags(form.tags.value),
    formulas: form.formulas.value.trim(),
    source_text: form.source_text.value.trim(),
    status: form.status.value,
    related_question_ids: selectedQuestionIds,
    updated_by: currentUserId(),
  };
  if (!id) payload.created_by = currentUserId();
  const query = id
    ? supabase.from("knowledge_notes").update(payload).eq("id", id).select().single()
    : supabase.from("knowledge_notes").insert(payload).select().single();
  const { data, error } = await query;
  if (error) return showToast(error.message, "bad");
  try {
    await uploadFiles(form.images.files, "note", data.id);
    await syncNoteQuestionLinks(data.id, selectedQuestionIds);
  } catch (error) {
    showToast(error.message, "bad");
  }
  showToast(id ? "知识点已更新" : "知识点已新增");
  state.view = "notes";
  await loadAll();
}

async function syncNoteQuestionLinks(noteId, questionIds) {
  if (!isConfigured || !noteId || String(noteId).startsWith("seed-")) return;
  const existing = await supabase.from("note_question_links").select("*").eq("note_id", noteId);
  if (existing.error) throw existing.error;
  const current = existing.data || [];
  const wanted = new Set(questionIds);
  const userId = currentUserId();
  const toArchive = current.filter((x) => !wanted.has(String(x.question_id)) && !x.archived);
  for (const link of toArchive) {
    const res = await supabase
      .from("note_question_links")
      .update({ archived: true, updated_by: userId })
      .eq("note_id", noteId)
      .eq("question_id", link.question_id);
    if (res.error) throw res.error;
  }
  for (const questionId of questionIds) {
    const payload = { note_id: noteId, question_id: questionId, archived: false, created_by: userId, updated_by: userId };
    const res = await supabase.from("note_question_links").upsert(payload, { onConflict: "note_id,question_id" });
    if (res.error) throw res.error;
  }
}

async function archiveAttachment(id) {
  if (!state.session || !isConfigured) return showToast("登录后才能归档附件记录", "bad");
  const { error } = await supabase.from("attachments").update({ archived: true, updated_by: currentUserId() }).eq("id", id);
  if (error) return showToast(error.message, "bad");
  showToast("图片记录已归档，没有物理删除");
  await loadAll();
}

async function importSeedData() {
  if (!state.session || !isConfigured) return showToast("登录并配置 Supabase 后才能导入", "bad");
  const existingQuestionTitles = new Set(state.questions.map((q) => q.title));
  const existingNoteTitles = new Set(state.notes.map((n) => n.title));
  const existingSourceTitles = new Set(state.sources.map((s) => s.title));
  const userId = currentUserId();
  const sources = SOURCE_SEEDS.filter((s) => !existingSourceTitles.has(s.title)).map((s) => ({
    title: s.title,
    kind: s.kind,
    path: s.path,
    parse_status: s.parse_status || "已识别",
    created_by: userId,
    updated_by: userId,
  }));
  const questions = QUESTION_SEEDS.filter((q) => !existingQuestionTitles.has(q.title)).map((q) => ({
    title: q.title,
    type: q.type,
    chapter: q.chapter,
    tags: q.tags || [],
    difficulty: q.difficulty || "中等",
    related_formulas: q.related_formulas || "",
    source_text: q.source,
    status: "待补充",
    known_conditions: q.known_conditions || "",
    solve_goal: q.solve_goal || "",
    used_formulas: q.used_formulas || "",
    created_by: userId,
    updated_by: userId,
  }));
  const notes = NOTE_SEEDS.filter((n) => !existingNoteTitles.has(n.title)).map((n) => ({
    title: n.title,
    body: n.body,
    chapter: n.chapter,
    tags: n.tags || [],
    formulas: n.formulas || "",
    source_text: n.source,
    status: "待整理",
    created_by: userId,
    updated_by: userId,
  }));
  const batches = [
    ["sources", sources],
    ["questions", questions],
    ["knowledge_notes", notes],
  ];
  for (const [table, rows] of batches) {
    if (!rows.length) continue;
    const { error } = await supabase.from(table).insert(rows);
    if (error) return showToast(error.message, "bad");
  }
  showToast(`已导入 ${sources.length} 个来源、${questions.length} 道题、${notes.length} 个知识点`);
  await loadAll();
}

function setView(view, selected = null) {
  state.view = view;
  state.selected = selected;
  state.studyReveal = false;
  render();
}

function unique(values) {
  return [...new Set(values.flatMap((x) => (Array.isArray(x) ? x : [x])).filter(Boolean))];
}

function filteredQuestions() {
  const f = state.filters;
  return state.questions.filter((q) => {
    const src = sourceOf(q);
    const text = [q.title, q.answer, q.analysis, src, ...(q.tags || [])].join(" ").toLowerCase();
    if (f.keyword && !text.includes(f.keyword.toLowerCase())) return false;
    if (f.chapter && q.chapter !== f.chapter) return false;
    if (f.type && q.type !== f.type) return false;
    if (f.difficulty && q.difficulty !== f.difficulty) return false;
    if (f.tag && !(q.tags || []).includes(f.tag)) return false;
    if (f.source && src !== f.source) return false;
    if (f.pending && !isPending(q)) return false;
    if (f.noAnswer && q.answer) return false;
    if (f.noAnalysis && q.analysis) return false;
    if (f.calcOnly && q.type !== "计算题") return false;
    return true;
  });
}

function filteredNotes() {
  const f = state.filters;
  return state.notes.filter((n) => {
    const src = sourceOf(n);
    const text = [n.title, n.body, n.formulas, src, ...(n.tags || [])].join(" ").toLowerCase();
    if (f.keyword && !text.includes(f.keyword.toLowerCase())) return false;
    if (f.chapter && n.chapter !== f.chapter) return false;
    if (f.tag && !(n.tags || []).includes(f.tag)) return false;
    if (f.source && src !== f.source) return false;
    if (f.pending && !isPending(n)) return false;
    if (f.noBody && n.body) return false;
    if (f.noFormula && n.formulas) return false;
    if (f.noLinks && n.related_question_ids?.length) return false;
    return true;
  });
}

function byObject(type, id) {
  return state.attachments.filter((a) => a.object_type === type && String(a.object_id) === String(id));
}

function attachmentHtml(type, id) {
  const items = byObject(type, id);
  if (!items.length) return "";
  return `<div class="image-grid">${items
    .map(
      (a) => `<figure>
        <img src="${a.public_url}" alt="${escapeHtml(a.file_name)}" data-zoom="${a.public_url}">
        <figcaption>${escapeHtml(a.caption || a.file_name)}</figcaption>
        <div class="image-actions">
          <button class="ghost" data-copy-md="${escapeHtml(a.public_url)}">复制引用</button>
          ${state.session ? `<button class="ghost danger" data-archive-attachment="${a.id}">归档</button>` : ""}
        </div>
      </figure>`
    )
    .join("")}</div>`;
}

function shell(content) {
  const nav = [
    ["dashboard", "工作台"],
    ["questions", "题库"],
    ["notes", "知识库"],
    ["study", "刷题"],
    ["analysis", "资料识别"],
    ["settings", "登录/个人"],
  ];
  app.innerHTML = `
    <aside class="sidebar">
      <div class="brand">半导体集成电路<span>协作学习</span></div>
      <nav>${nav
        .map(([id, label]) => `<button class="${state.view === id ? "active" : ""}" data-view="${id}">${label}</button>`)
        .join("")}</nav>
      <button class="refresh" data-action="refresh">${state.busy ? "读取中..." : "刷新 Supabase 数据"}</button>
      <button class="refresh" data-action="theme">${state.theme === "dark" ? "切到浅色" : state.theme === "light" ? "跟随系统" : "切到深色"}</button>
      ${!isConfigured && !localStorage.getItem(configKey) ? `<div class="config-warning">尚未配置 Supabase，当前显示本地 seed 预览。填写 <code>src/config.js</code> 后即可真实保存。</div>` : ""}
      ${state.loadError ? `<div class="config-warning">Supabase 已配置，但数据库表可能还没创建：${escapeHtml(state.loadError)}</div>` : ""}
    </aside>
    <main class="main">${content}</main>
  `;
}

function dashboard() {
  const pending = [...state.questions, ...state.notes].filter(isPending);
  const noAnswer = state.questions.filter((q) => !q.answer && !q.final_answer).length;
  const calcCount = state.questions.filter((q) => q.type === "计算题").length;
  const recent = [...state.questions, ...state.notes]
    .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))
    .slice(0, 8);
  shell(`
    <section class="topbar">
      <div>
        <h1>学习工作台</h1>
        <p>题库和知识库并排推进，适合几个人一起把资料慢慢补全。</p>
      </div>
      <div class="user-pill">${state.profile?.emoji_avatar || "🧪"} ${escapeHtml(state.profile?.nickname || state.session?.user?.email || "未登录浏览")}</div>
    </section>
    <section class="metrics">
      <button data-view="questions"><b>${state.questions.length}</b><span>题目总数</span></button>
      <button data-view="notes"><b>${state.notes.length}</b><span>知识点总数</span></button>
      <button data-action="pending"><b>${pending.length}</b><span>待完善</span></button>
      <button data-action="no-answer"><b>${noAnswer}</b><span>无答案题</span></button>
      <button data-action="calc-only"><b>${calcCount}</b><span>计算题</span></button>
      <button data-view="analysis"><b>${state.sources.length || SOURCE_SEEDS.length}</b><span>资料来源</span></button>
    </section>
    <section class="quick">
      <button data-view="questions">题库</button>
      <button data-view="notes">知识库</button>
      <button data-view="study">刷题</button>
      <button data-view="question-form">添加题目</button>
      <button data-view="note-form">添加知识点</button>
    </section>
    <div class="split">
      <section>
        <h2>最近新增题目</h2>
        ${state.questions.slice(0, 6).map(questionRow).join("") || empty("暂无题目")}
      </section>
      <section>
        <h2>最近新增知识点</h2>
        ${state.notes.slice(0, 6).map(noteRow).join("") || empty("暂无知识点")}
      </section>
    </div>
    <section>
      <h2>最近更新</h2>
      <div class="timeline">${recent.map((x) => `<button data-detail="${x.type ? "question" : "note"}:${x.id}"><b>${escapeHtml(x.title)}</b><span>${escapeHtml(x.chapter || "")} · ${statusOf(x)}</span></button>`).join("") || empty("暂无更新")}</div>
    </section>
  `);
}

function empty(text) {
  return `<div class="empty">${text}</div>`;
}

function filters(kind) {
  const items = kind === "questions" ? state.questions : state.notes;
  const tags = unique(items.map((x) => x.tags || []));
  const sources = unique(items.map(sourceOf));
  return `
    <div class="filters">
      <input name="keyword" placeholder="关键词搜索" value="${escapeHtml(state.filters.keyword || "")}">
      <select name="chapter"><option value="">全部章节</option>${CHAPTERS.map((c) => `<option ${state.filters.chapter === c ? "selected" : ""}>${c}</option>`).join("")}</select>
      <select name="tag"><option value="">全部标签</option>${tags.map((t) => `<option ${state.filters.tag === t ? "selected" : ""}>${escapeHtml(t)}</option>`).join("")}</select>
      <select name="source"><option value="">全部来源</option>${sources.map((s) => `<option value="${escapeHtml(s)}" ${state.filters.source === s ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}</select>
      ${kind === "questions" ? `<select name="type"><option value="">全部题型</option>${["名词解释", "简答题", "计算题"].map((t) => `<option ${state.filters.type === t ? "selected" : ""}>${t}</option>`).join("")}</select>` : ""}
      ${kind === "questions" ? `<select name="difficulty"><option value="">全部难度</option>${["基础", "中等", "困难"].map((d) => `<option ${state.filters.difficulty === d ? "selected" : ""}>${d}</option>`).join("")}</select>` : ""}
      <label><input type="checkbox" name="pending" ${state.filters.pending ? "checked" : ""}> 只看待完善</label>
      ${kind === "questions" ? `<label><input type="checkbox" name="noAnswer" ${state.filters.noAnswer ? "checked" : ""}> 无答案</label><label><input type="checkbox" name="noAnalysis" ${state.filters.noAnalysis ? "checked" : ""}> 无解析</label><label><input type="checkbox" name="calcOnly" ${state.filters.calcOnly ? "checked" : ""}> 计算题</label>` : ""}
      ${kind === "notes" ? `<label><input type="checkbox" name="noBody" ${state.filters.noBody ? "checked" : ""}> 无正文</label><label><input type="checkbox" name="noFormula" ${state.filters.noFormula ? "checked" : ""}> 无公式</label><label><input type="checkbox" name="noLinks" ${state.filters.noLinks ? "checked" : ""}> 无关联题</label>` : ""}
    </div>
  `;
}

function questionsView() {
  const list = filteredQuestions();
  shell(`
    <section class="topbar"><div><h1>题库</h1><p>名词解释、简答题、计算题都可以先空答案录入，后续一起补。</p></div><button data-view="question-form">新增题目</button></section>
    ${filters("questions")}
    <div class="table-list">${list.map(questionRow).join("") || empty("没有匹配题目")}</div>
  `);
}

function questionRow(q) {
  return `<article class="row" data-detail="question:${q.id}">
    <div><h3>${escapeHtml(q.title)}</h3><p>${escapeHtml(q.chapter || "")} · ${escapeHtml(q.type || "")} · ${escapeHtml(q.difficulty || "")} · ${escapeHtml(sourceOf(q))}</p>${tagsHtml(q.tags)}</div>
    <span class="status ${statusOf(q)}">${statusOf(q)}</span>
  </article>`;
}

function questionDetail(q) {
  const isCalc = q.type === "计算题";
  const linkedNotes = state.notes.filter((n) => (n.related_question_ids || []).map(String).includes(String(q.id)));
  shell(`
    <section class="topbar"><div><button class="ghost" data-view="questions">返回题库</button><h1>${escapeHtml(q.title)}</h1><p>${escapeHtml(q.chapter || "")} · ${escapeHtml(q.type || "")} · 来源：${escapeHtml(sourceOf(q))}</p></div><button data-edit-question="${q.id}">编辑/补充</button></section>
    <section class="detail">
      <div class="meta">${tagsHtml(q.tags)} <span class="status ${statusOf(q)}">${statusOf(q)}</span></div>
      ${isCalc ? calcBlocks(q) : ""}
      ${block("题目", q.title)}
      ${block("相关公式", q.related_formulas || q.used_formulas)}
      ${block("答案", q.answer || q.final_answer || "这题还没有答案，欢迎补充。")}
      ${block("解析", q.analysis)}
      ${block("常见错误", q.common_mistakes)}
      ${attachmentHtml("question", q.id)}
      <section class="block"><h2>关联知识点</h2>${linkedNotes.map(noteRow).join("") || empty("暂未关联知识点")}</section>
    </section>
  `);
}

function calcBlocks(q) {
  return `
    <div class="calc-grid">
      ${block("已知条件", q.known_conditions)}
      ${block("求解目标", q.solve_goal)}
      ${block("使用公式", q.used_formulas || q.related_formulas)}
      ${block("解题步骤", q.solution_steps)}
      ${block("最终答案", q.final_answer)}
    </div>
  `;
}

function block(title, value) {
  if (!value) return "";
  return `<section class="block"><h2>${title}</h2><div>${md(value)}</div></section>`;
}

function notesView() {
  const list = filteredNotes();
  shell(`
    <section class="topbar"><div><h1>知识库</h1><p>把概念、公式、常考点和易混淆点整理成可关联题目的笔记。</p></div><button data-view="note-form">新增知识点</button></section>
    ${filters("notes")}
    <div class="table-list">${list.map(noteRow).join("") || empty("没有匹配知识点")}</div>
  `);
}

function noteRow(n) {
  return `<article class="row" data-detail="note:${n.id}">
    <div><h3>${escapeHtml(n.title)}</h3><p>${escapeHtml(n.chapter || "")} · ${escapeHtml(sourceOf(n))}</p>${tagsHtml(n.tags)}</div>
    <span class="status ${statusOf(n)}">${statusOf(n)}</span>
  </article>`;
}

function noteDetail(n) {
  const linked = (n.related_question_ids || []).map((id) => state.questions.find((q) => String(q.id) === String(id))).filter(Boolean);
  shell(`
    <section class="topbar"><div><button class="ghost" data-view="notes">返回知识库</button><h1>${escapeHtml(n.title)}</h1><p>${escapeHtml(n.chapter || "")} · 来源：${escapeHtml(sourceOf(n))}</p></div><button data-edit-note="${n.id}">编辑知识点</button></section>
    <section class="detail">
      <div class="meta">${tagsHtml(n.tags)} <span class="status ${statusOf(n)}">${statusOf(n)}</span></div>
      ${block("正文", n.body || "这个知识点还没有正文，欢迎补充。")}
      ${block("相关公式", n.formulas)}
      ${attachmentHtml("note", n.id)}
      <section class="block"><h2>关联题目</h2>${linked.map(questionRow).join("") || empty("暂未关联题目")}</section>
    </section>
  `);
}

function questionForm(q = {}) {
  shell(`
    <section class="topbar"><div><h1>${q.id ? "编辑题目" : "新增题目"}</h1><p>支持 Markdown 图片语法和 LaTeX：行内 $V_{GS}>V_T$，块级 $$I_D=...$$。</p></div></section>
    <form class="editor" data-form="question">
      <input type="hidden" name="id" value="${q.id && !String(q.id).startsWith("seed-") ? q.id : ""}">
      ${input("题目", "title", q.title, "textarea")}
      <div class="grid-4">${select("题型", "type", ["名词解释", "简答题", "计算题"], q.type)}${select("章节", "chapter", CHAPTERS, q.chapter)}${select("难度", "difficulty", ["基础", "中等", "困难"], q.difficulty)}${select("完善状态", "status", ["待补充", "待完善", "待整理", "已整理"], statusOf(q))}</div>
      ${input("标签", "tags", (q.tags || []).join(", "))}
      ${input("来源", "source_text", q.source_text || q.source)}
      <div class="calc-editor">
        ${input("已知条件", "known_conditions", q.known_conditions, "textarea")}
        ${input("求解目标", "solve_goal", q.solve_goal, "textarea")}
        ${input("使用公式", "used_formulas", q.used_formulas, "textarea")}
        ${input("解题步骤", "solution_steps", q.solution_steps, "textarea")}
        ${input("最终答案", "final_answer", q.final_answer, "textarea")}
        ${input("常见错误", "common_mistakes", q.common_mistakes, "textarea")}
      </div>
      ${input("答案", "answer", q.answer, "textarea")}
      ${input("解析", "analysis", q.analysis, "textarea")}
      ${input("相关公式", "related_formulas", q.related_formulas, "textarea")}
      <label>上传图片<input type="file" name="images" accept="image/*" multiple></label>
      <div class="actions"><button type="submit">保存题目</button><button type="button" class="ghost" data-view="questions">取消</button></div>
    </form>
  `);
}

function noteForm(n = {}) {
  shell(`
    <section class="topbar"><div><h1>${n.id ? "编辑知识点" : "新增知识点"}</h1><p>正文、公式、图片和关联题目都可以逐步补全。</p></div></section>
    <form class="editor" data-form="note">
      <input type="hidden" name="id" value="${n.id && !String(n.id).startsWith("seed-") ? n.id : ""}">
      ${input("标题", "title", n.title)}
      <div class="grid-4">${select("章节", "chapter", CHAPTERS, n.chapter)}${select("完善状态", "status", ["待补充", "待完善", "待整理", "已整理"], statusOf(n))}</div>
      ${input("标签", "tags", (n.tags || []).join(", "))}
      ${input("来源", "source_text", n.source_text || n.source)}
      ${input("正文", "body", n.body, "textarea")}
      ${input("相关公式", "formulas", n.formulas, "textarea")}
      <label>关联题目<select name="related_question_ids" multiple size="6">${state.questions.map((q) => `<option value="${q.id}" ${(n.related_question_ids || []).includes(q.id) ? "selected" : ""}>${escapeHtml(q.title)}</option>`).join("")}</select></label>
      <label>上传图片<input type="file" name="images" accept="image/*" multiple></label>
      <div class="actions"><button type="submit">保存知识点</button><button type="button" class="ghost" data-view="notes">取消</button></div>
    </form>
  `);
}

function input(label, name, value = "", type = "input") {
  return `<label>${label}${type === "textarea" ? `<textarea name="${name}" rows="4">${escapeHtml(value || "")}</textarea>` : `<input name="${name}" value="${escapeHtml(value || "")}">`}</label>`;
}

function select(label, name, options, value = "") {
  return `<label>${label}<select name="${name}">${options.map((o) => `<option value="${escapeHtml(o)}" ${o === value ? "selected" : ""}>${escapeHtml(o)}</option>`).join("")}</select></label>`;
}

function studyView() {
  const base = filteredQuestions().filter((q) => !state.filters.favOnly || progress()[q.id]?.fav);
  const q = base[state.studyIndex % Math.max(base.length, 1)];
  const p = progress();
  shell(`
    <section class="topbar"><div><h1>刷题模式</h1><p>个人掌握程度和收藏存在 localStorage，不同步到 Supabase。</p></div></section>
    ${filters("questions")}
    <div class="study-tools"><label><input type="checkbox" name="favOnly" ${state.filters.favOnly ? "checked" : ""}> 只刷收藏题</label></div>
    ${q ? `<section class="study-card">
      <div class="meta">${escapeHtml(q.chapter || "")} · ${escapeHtml(q.type || "")} · ${tagsHtml(q.tags)}</div>
      <h2>${escapeHtml(q.title)}</h2>
      ${state.studyReveal ? `${block("答案", q.answer || q.final_answer || "这题还没有答案，欢迎补充。")}${block("解析", q.analysis)}${block("公式", q.related_formulas || q.used_formulas)}${attachmentHtml("question", q.id)}` : ""}
      <div class="actions">
        <button data-action="reveal">${state.studyReveal ? "收起" : "展开答案/解析"}</button>
        <button data-progress="${q.id}:会了">会了</button>
        <button data-progress="${q.id}:不熟">不熟</button>
        <button data-progress="${q.id}:不会">不会</button>
        <button data-fav="${q.id}">${p[q.id]?.fav ? "取消收藏" : "收藏"}</button>
        <button data-action="next">下一题</button>
      </div>
    </section>` : empty("没有可刷题目")}
  `);
}

function analysisView() {
  shell(`
    <section class="topbar"><div><h1>资料识别结果</h1><p>${ANALYSIS_SUMMARY.files}</p></div><button data-action="import-seed">导入初始题库/知识库</button></section>
    <div class="split">
      <section><h2>识别章节</h2>${ANALYSIS_SUMMARY.chapters.map((x) => `<p>${escapeHtml(x)}</p>`).join("")}</section>
      <section><h2>题型</h2>${ANALYSIS_SUMMARY.questionTypes.map((x) => `<span class="tag">${x}</span>`).join("")}<h2>公式候选</h2>${ANALYSIS_SUMMARY.formulas.map((x) => `<div class="formula">${x}</div>`).join("")}</section>
    </div>
    <section><h2>可导入题目候选</h2>${QUESTION_SEEDS.map((q) => `<p><b>${escapeHtml(q.type)}</b> · ${escapeHtml(q.chapter)} · ${escapeHtml(q.title)} <span class="muted">${escapeHtml(q.source)}</span></p>`).join("")}</section>
    <section><h2>可导入知识点</h2>${NOTE_SEEDS.map((n) => `<p><b>${escapeHtml(n.chapter)}</b> · ${escapeHtml(n.title)} <span class="muted">${escapeHtml(n.source)}</span></p>`).join("")}</section>
    <section><h2>未能完整解析</h2>${ANALYSIS_SUMMARY.incomplete.map((x) => `<p>${escapeHtml(x)}</p>`).join("")}</section>
  `);
}

function settingsView() {
  shell(`
    <section class="topbar"><div><h1>登录与个人信息</h1><p>未登录可以浏览；登录后可以新增、编辑和上传图片。</p></div></section>
    ${!isConfigured ? `<section class="block warn"><h2>Supabase 未配置</h2><p>填写 <code>src/config.js</code> 中的 <code>SUPABASE_URL</code> 和 <code>SUPABASE_ANON_KEY</code> 后启用真实数据库。</p></section>` : ""}
    ${isConfigured ? `<section class="block"><h2>Supabase 状态</h2><p>项目已连接：<code>${escapeHtml(new URL(SUPABASE_URL).host)}</code></p><p>如果页面提示数据库表不存在，请在 Supabase SQL Editor 运行仓库里的 <code>supabase/schema.sql</code>。运行后回到这里点击“刷新 Supabase 数据”。</p></section>` : ""}
    ${state.session ? `
      <form class="editor" data-form="profile">
        <p>当前登录：${escapeHtml(state.session.user.email)}</p>
        ${input("昵称", "nickname", state.profile?.nickname || "")}
        ${input("emoji 头像", "emoji_avatar", state.profile?.emoji_avatar || "🧪")}
        <div class="actions"><button type="submit">保存个人信息</button><button type="button" data-action="logout" class="ghost">退出登录</button></div>
      </form>
    ` : `
      <form class="editor" data-form="login">
        ${input("邮箱", "email", "")}
        <button type="submit">发送登录邮件</button>
      </form>
    `}
  `);
}

function render() {
  if (state.selected?.type === "question") return questionDetail(state.selected.item);
  if (state.selected?.type === "note") return noteDetail(state.selected.item);
  if (state.view === "dashboard") dashboard();
  if (state.view === "questions") questionsView();
  if (state.view === "notes") notesView();
  if (state.view === "study") studyView();
  if (state.view === "analysis") analysisView();
  if (state.view === "settings") settingsView();
  if (state.view === "question-form") questionForm();
  if (state.view === "note-form") noteForm();
  renderMath();
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button, article, img");
  if (!target) return;
  if (target.dataset.view) {
    state.filters = target.dataset.view === state.view ? state.filters : state.filters;
    setView(target.dataset.view);
  }
  if (target.dataset.action === "refresh") await loadAll();
  if (target.dataset.action === "pending") {
    state.filters.pending = true;
    setView("questions");
  }
  if (target.dataset.action === "no-answer") {
    state.filters.noAnswer = true;
    setView("questions");
  }
  if (target.dataset.action === "calc-only") {
    state.filters.calcOnly = true;
    setView("questions");
  }
  if (target.dataset.action === "theme") {
    state.theme = state.theme === "auto" ? "dark" : state.theme === "dark" ? "light" : "auto";
    localStorage.setItem(themeKey, state.theme);
    applyTheme();
    render();
  }
  if (target.dataset.detail) {
    const [type, id] = target.dataset.detail.split(":");
    const item = type === "question" ? state.questions.find((q) => String(q.id) === id) : state.notes.find((n) => String(n.id) === id);
    state.selected = { type, item };
    render();
  }
  if (target.dataset.editQuestion) {
    const item = state.questions.find((q) => String(q.id) === target.dataset.editQuestion);
    questionForm(item);
  }
  if (target.dataset.editNote) {
    const item = state.notes.find((n) => String(n.id) === target.dataset.editNote);
    noteForm(item);
  }
  if (target.dataset.action === "reveal") {
    state.studyReveal = !state.studyReveal;
    render();
  }
  if (target.dataset.action === "next") {
    state.studyIndex += 1;
    state.studyReveal = false;
    render();
  }
  if (target.dataset.progress) {
    const [id, mark] = target.dataset.progress.split(":");
    const p = progress();
    p[id] = { ...(p[id] || {}), mark, updated_at: new Date().toISOString() };
    saveProgress(p);
    showToast(`已标记：${mark}`);
  }
  if (target.dataset.fav) {
    const p = progress();
    p[target.dataset.fav] = { ...(p[target.dataset.fav] || {}), fav: !p[target.dataset.fav]?.fav };
    saveProgress(p);
    render();
  }
  if (target.dataset.action === "logout") await logout();
  if (target.dataset.action === "import-seed") await importSeedData();
  if (target.dataset.archiveAttachment) await archiveAttachment(target.dataset.archiveAttachment);
  if (target.dataset.copyMd) {
    const markdown = `![图片](${target.dataset.copyMd})`;
    await navigator.clipboard.writeText(markdown);
    showToast("已复制图片 Markdown 引用");
  }
  if (target.dataset.zoom) {
    const box = $("#lightbox");
    box.innerHTML = `<button aria-label="关闭">×</button><img src="${target.dataset.zoom}" alt="">`;
    box.classList.remove("hidden");
  }
});

document.addEventListener("change", (event) => {
  if (event.target.closest(".filters") || event.target.closest(".study-tools")) {
    const el = event.target;
    state.filters[el.name] = el.type === "checkbox" ? el.checked : el.value;
    render();
  }
});

document.addEventListener("input", (event) => {
  if (event.target.closest(".filters")) {
    const el = event.target;
    state.filters[el.name] = el.value;
    render();
  }
});

document.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  if (form.dataset.form === "login") await login(form.email.value.trim());
  if (form.dataset.form === "profile") await saveProfile(form);
  if (form.dataset.form === "question") await saveQuestion(form);
  if (form.dataset.form === "note") await saveNote(form);
});

$("#lightbox").addEventListener("click", () => {
  $("#lightbox").classList.add("hidden");
});

init();
