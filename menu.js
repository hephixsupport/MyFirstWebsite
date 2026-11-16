const SUPABASE_URL = "https://kacxgveptrawqsxataly.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_qFQGAK79ODKvJjsyJRnmjA_YXP5pPZ_";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// One entry per table. Add a field here and it shows up in the page automatically.
const TABLES = [
  {
    table: "categories", title: "Categories", pk: "code",
    fields: [
      { key: "code", label: "Code (A, B, ...)" },
      { key: "name", label: "Name" },
      { key: "note", label: "Note" },
    ],
  },
  {
    table: "subcategories", title: "Subcategories", pk: "code",
    fields: [
      { key: "code", label: "Code (A1, A2, ...)" },
      { key: "name", label: "Name" },
      { key: "category_code", label: "Category code" },
    ],
  },
  {
    table: "items", title: "Items", pk: "id",
    fields: [
      { key: "name", label: "Name" },
      { key: "price", label: "Price", type: "number" },
      { key: "subcategory_code", label: "Subcategory code" },
      { key: "image_url", label: "Image URL" },
    ],
  },
];

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

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

// ---- Tables ----
async function loadAll() {
  const root = $("tables");
  root.innerHTML = "";
  for (const cfg of TABLES) {
    const { data, error } = await db.from(cfg.table).select("*").order(cfg.pk);
    if (error) {
      root.insertAdjacentHTML("beforeend", `<p class="err">${esc(cfg.table)}: ${esc(error.message)}</p>`);
      continue;
    }
    root.appendChild(renderTable(cfg, data));
  }
}

function renderTable(cfg, rows) {
  const rowHtml = (row, isNew) => {
    const cells = cfg.fields.map((f) => {
      const locked = !isNew && f.key === cfg.pk ? "disabled" : "";
      return `<td><input data-key="${f.key}" type="${f.type || "text"}" step="0.01" value="${esc(row[f.key])}" ${locked} /></td>`;
    });
    const buttons = isNew
      ? `<button data-act="add" type="button">Add</button>`
      : `<button data-act="save" type="button">Save</button> <button data-act="del" class="danger" type="button">Delete</button>`;
    return `<tr data-pk="${isNew ? "" : esc(row[cfg.pk])}">${cells.join("")}<td>${buttons}</td></tr>`;
  };

  const section = document.createElement("section");
  section.innerHTML = `
    <h2>${esc(cfg.title)}</h2>
    <table>
      <thead><tr>${cfg.fields.map((f) => `<th>${esc(f.label)}</th>`).join("")}<th></th></tr></thead>
      <tbody>${rows.map((r) => rowHtml(r, false)).join("")}${rowHtml({}, true)}</tbody>
    </table>`;
  section.addEventListener("click", (e) => onAction(e, cfg));
  return section;
}

async function onAction(e, cfg) {
  const act = e.target.dataset.act;
  if (!act) return;

  const tr = e.target.closest("tr");
  const pk = tr.dataset.pk;
  const values = {};
  tr.querySelectorAll("input").forEach((input) => {
    const v = input.value.trim();
    values[input.dataset.key] = v === "" ? null : v;
  });

  let res;
  if (act === "add") {
    res = await db.from(cfg.table).insert(values);
  } else if (act === "save") {
    res = await db.from(cfg.table).update(values).eq(cfg.pk, pk);
  } else if (act === "del") {
    if (!confirm("Delete this row?")) return;
    res = await db.from(cfg.table).delete().eq(cfg.pk, pk);
  }

  if (res.error) {
    alert(res.error.message);
    return;
  }
  loadAll();
}

refresh();
