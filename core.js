// Logique pure de la checklist : aucune I/O ici.

export function newId(text) {
  const slug = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "tache";
  return slug + "-" + Math.random().toString(36).slice(2, 6);
}

export function counts(section) {
  const items = section.groups.flatMap(g => g.items);
  return { done: items.filter(i => i.done).length, total: items.length };
}

const dropEmpty = s => { s.groups = s.groups.filter(g => g.items.length); };

export function applyOp(data, op) {
  const d = structuredClone(data);
  if (op.type === "toggle") {
    for (const s of d.sections) for (const g of s.groups) for (const i of g.items)
      if (i.id === op.id) i.done = !!op.done;
  } else if (op.type === "add") {
    const s = d.sections.find(s => s.id === op.sectionId);
    if (!s) return d;
    let g = s.groups.find(g => g.title === op.groupTitle);
    if (!g) s.groups.push(g = { title: op.groupTitle, items: [] });
    g.items.push({ id: newId(op.text), text: op.text, note: "", done: false });
  } else if (op.type === "remove") {
    for (const s of d.sections) { for (const g of s.groups) g.items = g.items.filter(i => i.id !== op.id); dropEmpty(s); }
  } else if (op.type === "clearDone") {
    const s = d.sections.find(s => s.id === op.sectionId);
    if (s) { for (const g of s.groups) g.items = g.items.filter(i => !i.done); dropEmpty(s); }
  }
  return d;
}

export function encodeB64(str) {
  let bin = "";
  for (const b of new TextEncoder().encode(str)) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function decodeB64(b64) {
  const bin = atob(b64.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}
