const SUPABASE_URL = "https://kacxgveptrawqsxataly.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_qFQGAK79ODKvJjsyJRnmjA_YXP5pPZ_";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

const state = { cats: [], subs: [], items: [], open: new Set() };

// ---- Login ----
async function refresh() {
  const { data: { session } } = await db.auth.getSession();
  $("login").hidden = !!session;
  $("app").hidden = !session;
  if (session) {
    loadAll();
    loadSize();
  }
}

$("login-btn").addEventListener("click", async () => {
  const { error } = await db.auth.signInWithPassword({
    email: $("email").value.trim(),
    password: $("password").value,
  });
  $("login-error").textContent = error ? error.message : "";
  if (!error) refresh();
});

$("logout-btn").addEventListener("click", async () => {
  await db.auth.signOut();
  refresh();
});

// ---- Register icon size ----
const sizeInput = $("card-size");
sizeInput.addEventListener("input", () => {
  $("card-size-label").textContent = sizeInput.value;
});

async function loadSize() {
  const { data } = await db.from("settings").select("value").eq("key", "card_size").maybeSingle();
  if (data) {
    sizeInput.value = data.value;
    $("card-size-label").textContent = data.value;
  }
}

$("save-size").addEventListener("click", async () => {
  const { error } = await db.from("settings").upsert({ key: "card_size", value: sizeInput.value });
  alert(error ? error.message : "Saved. Reload the register to see the new size.");
});

// ---- Inventory tree ----
async function loadAll() {
  const [c, s, i] = await Promise.all([
    db.from("categories").select("*").order("code"),
    db.from("subcategories").select("*").order("code"),
    db.from("items").select("*").order("name"),
  ]);
  const err = c.error || s.error || i.error;
  if (err) {
    $("tree").innerHTML = `<p class="err">${esc(err.message)}</p>`;
    return;
  }
  state.cats = c.data;
  state.subs = s.data;
  state.items = i.data;
  renderTree();
}

function renderTree() {
  const isOpen = (key) => (state.open.has(key) ? "open" : "");

  const itemHtml = (i) => `
    <div class="item" draggable="true" data-drag="item" data-id="${i.id}">
      ${i.image_url ? `<img src="${esc(i.image_url)}" alt="" />` : `<span class="thumb"></span>`}
      <span class="name">${esc(i.name)}</span>
      <span class="price">$${Number(i.price).toFixed(2)}</span>
      <button class="small" data-act="edit-item" data-id="${i.id}">Edit</button>
    </div>`;

  const subHtml = (s) => {
    const items = state.items.filter((i) => i.subcategory_code === s.code);
    return `
      <details class="sub" data-kind="sub" data-code="${esc(s.code)}" data-key="sub:${esc(s.code)}" ${isOpen("sub:" + s.code)}>
        <summary draggable="true" data-drag="sub" data-id="${esc(s.code)}">
          <span>${esc(s.name)} <small>${esc(s.code)} (${items.length})</small></span>
          <span class="actions">
            <button class="small" data-act="add-item" data-code="${esc(s.code)}">+ Item</button>
            <button class="small" data-act="edit-sub" data-code="${esc(s.code)}">Edit</button>
          </span>
        </summary>
        <div class="items">${items.map(itemHtml).join("") || `<p class="muted">No items yet. Drop one here.</p>`}</div>
      </details>`;
  };

  $("tree").innerHTML =
    state.cats.map((c) => {
      const subs = state.subs.filter((s) => s.category_code === c.code);
      return `
        <details class="cat" data-kind="cat" data-code="${esc(c.code)}" data-key="cat:${esc(c.code)}" ${isOpen("cat:" + c.code)}>
          <summary>
            <span>${esc(c.name)} <small>${esc(c.code)}${c.note ? " - " + esc(c.note) : ""}</small></span>
            <span class="actions">
              <button class="small" data-act="add-sub" data-code="${esc(c.code)}">+ Subcategory</button>
              <button class="small" data-act="edit-cat" data-code="${esc(c.code)}">Edit</button>
            </span>
          </summary>
          ${subs.map(subHtml).join("") || `<p class="muted">&nbsp;No subcategories yet.</p>`}
        </details>`;
    }).join("") || `<p class="muted">No categories yet. Click "+ Category" to start.</p>`;
}

// Remember which folders are open across reloads
$("tree").addEventListener("toggle", (e) => {
  const key = e.target.dataset && e.target.dataset.key;
  if (!key) return;
  e.target.open ? state.open.add(key) : state.open.delete(key);
}, true);

// ---- Add / edit dialog ----
const FORMS = {
  cat: {
    table: "categories", pk: "code", title: "category",
    fields: () => [
      { key: "code", label: "Code (A, B, ...)", lockOnEdit: true },
      { key: "name", label: "Name" },
      { key: "note", label: "Note" },
    ],
  },
  sub: {
    table: "subcategories", pk: "code", title: "subcategory",
    fields: () => [
      { key: "code", label: "Code (A1, A2, ...)", lockOnEdit: true },
      { key: "name", label: "Name" },
      { key: "category_code", label: "Category", options: state.cats.map((c) => [c.code, `${c.name} (${c.code})`]) },
    ],
  },
  item: {
    table: "items", pk: "id", title: "item",
    fields: () => [
      { key: "name", label: "Name" },
      { key: "price", label: "Price", type: "number" },
      { key: "subcategory_code", label: "Subcategory", options: state.subs.map((s) => [s.code, `${s.name} (${s.code})`]) },
      { key: "image_url", label: "Image URL" },
    ],
  },
};

let editing = null; // { kind, pk }  (pk is null when adding)

function openEditor(kind, row, defaults = {}) {
  const form = FORMS[kind];
  const isNew = !row;
  const values = row || defaults;
  editing = { kind, pk: isNew ? null : row[form.pk] };

  $("editor-title").textContent = `${isNew ? "Add" : "Edit"} ${form.title}`;
  $("editor-fields").innerHTML = form.fields().map((f) => {
    const v = values[f.key] ?? "";
    const input = f.options
      ? `<select data-key="${f.key}">${f.options.map(([val, text]) =>
          `<option value="${esc(val)}" ${val === v ? "selected" : ""}>${esc(text)}</option>`).join("")}</select>`
      : `<input data-key="${f.key}" type="${f.type || "text"}" step="0.01" value="${esc(v)}" ${!isNew && f.lockOnEdit ? "disabled" : ""} />`;
    return `<label>${esc(f.label)}${input}</label>`;
  }).join("");
  $("editor-delete").hidden = isNew;
  $("editor").showModal();
}

$("editor-cancel").addEventListener("click", () => $("editor").close());

$("editor-save").addEventListener("click", async () => {
  const form = FORMS[editing.kind];
  const values = {};
  $("editor-fields").querySelectorAll("[data-key]").forEach((el) => {
    const v = el.value.trim();
    values[el.dataset.key] = v === "" ? null : v;
  });
  const q = db.from(form.table);
  const res = editing.pk === null
    ? await q.insert(values)
    : await q.update(values).eq(form.pk, editing.pk);
  if (res.error) return alert(res.error.message);
  $("editor").close();
  loadAll();
});

$("editor-delete").addEventListener("click", async () => {
  const form = FORMS[editing.kind];
  if (!confirm(`Delete this ${form.title}?`)) return;
  const { error } = await db.from(form.table).delete().eq(form.pk, editing.pk);
  if (error) return alert(error.message);
  $("editor").close();
  loadAll();
});

$("add-cat").addEventListener("click", () => openEditor("cat", null));

$("tree").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-act]");
  if (!b) return;
  e.preventDefault(); // keep the folder from toggling when a button inside its header is clicked
  const { act, code, id } = b.dataset;

  if (act === "edit-cat") openEditor("cat", state.cats.find((c) => c.code === code));
  if (act === "edit-sub") openEditor("sub", state.subs.find((s) => s.code === code));
  if (act === "edit-item") openEditor("item", state.items.find((i) => String(i.id) === id));
  if (act === "add-sub") {
    state.open.add("cat:" + code);
    openEditor("sub", null, { category_code: code });
  }
  if (act === "add-item") {
    const sub = state.subs.find((s) => s.code === code);
    state.open.add("sub:" + code);
    state.open.add("cat:" + sub.category_code);
    openEditor("item", null, { subcategory_code: code });
  }
});

// ---- Drag and drop ----
let dragged = null; // { type: "item" | "sub", id }
const tree = $("tree");
const clearHover = () => tree.querySelectorAll(".drop-hover").forEach((el) => el.classList.remove("drop-hover"));

// Items can be dropped on subcategories; subcategories can be dropped on categories
const dropTarget = (e) =>
  dragged ? e.target.closest(`[data-kind="${dragged.type === "item" ? "sub" : "cat"}"]`) : null;

tree.addEventListener("dragstart", (e) => {
  const el = e.target.closest("[data-drag]");
  if (!el) return;
  dragged = { type: el.dataset.drag, id: el.dataset.id };
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", el.dataset.id);
});

tree.addEventListener("dragover", (e) => {
  const target = dropTarget(e);
  clearHover();
  if (target) {
    e.preventDefault();
    target.classList.add("drop-hover");
  }
});

tree.addEventListener("drop", async (e) => {
  const target = dropTarget(e);
  if (!target) return;
  e.preventDefault();
  clearHover();

  const code = target.dataset.code;
  let res;
  if (dragged.type === "item") {
    res = await db.from("items").update({ subcategory_code: code }).eq("id", dragged.id);
    const sub = state.subs.find((s) => s.code === code);
    state.open.add("sub:" + code);
    if (sub) state.open.add("cat:" + sub.category_code);
  } else {
    res = await db.from("subcategories").update({ category_code: code }).eq("code", dragged.id);
    state.open.add("cat:" + code);
  }
  dragged = null;
  if (res.error) return alert(res.error.message);
  loadAll();
});

tree.addEventListener("dragend", () => {
  dragged = null;
  clearHover();
});

refresh();
