import test from "node:test";
import assert from "node:assert/strict";
import { applyOp, counts, encodeB64, decodeB64, newId } from "../core.js";

const base = () => ({ version: 1, sections: [
  { id: "a", title: "A", tag: "", groups: [
    { title: "G1", items: [ { id: "x", text: "X", note: "", done: false }, { id: "y", text: "Y", note: "", done: true } ] },
    { title: "G2", items: [ { id: "z", text: "Z", note: "", done: true } ] } ] },
  { id: "b", title: "B", tag: "", groups: [ { title: "", items: [ { id: "w", text: "W", note: "", done: true } ] } ] } ] });
const ids = d => d.sections.flatMap(s => s.groups.flatMap(g => g.items.map(i => i.id)));

test("toggle met done=true sur l'id visé et rien d'autre", () => {
  const d = applyOp(base(), { type: "toggle", id: "x", done: true });
  const e = base(); e.sections[0].groups[0].items[0].done = true;
  assert.deepEqual(d, e);
});
test("toggle sur id absent renvoie des données égales (deepEqual)", () => {
  assert.deepEqual(applyOp(base(), { type: "toggle", id: "nope", done: true }), base());
});
test("add crée l'item done=false dans le groupe existant de même titre", () => {
  const d = applyOp(base(), { type: "add", sectionId: "a", groupTitle: "G2", text: "Nouveau" });
  const it = d.sections[0].groups[1].items[1];
  assert.equal(it.text, "Nouveau"); assert.equal(it.done, false); assert.equal(it.note, "");
  assert.equal(new Set(ids(d)).size, ids(d).length);
});
test("add avec groupTitle inconnu crée le groupe en fin de section", () => {
  const d = applyOp(base(), { type: "add", sectionId: "a", groupTitle: "G3", text: "T" });
  assert.equal(d.sections[0].groups.at(-1).title, "G3");
  assert.equal(d.sections[0].groups.at(-1).items[0].text, "T");
});
test("remove retire l'item ; un groupe vidé disparaît", () => {
  const d = applyOp(base(), { type: "remove", id: "z" });
  assert.deepEqual(d.sections[0].groups.map(g => g.title), ["G1"]);
  assert.deepEqual(applyOp(base(), { type: "remove", id: "nope" }), base());
});
test("clearDone retire les items cochés de la section seulement ; groupes vidés supprimés", () => {
  const d = applyOp(base(), { type: "clearDone", sectionId: "a" });
  assert.deepEqual(d.sections[0].groups, [{ title: "G1", items: [{ id: "x", text: "X", note: "", done: false }] }]);
  assert.deepEqual(d.sections[1], base().sections[1]);
});
test("applyOp ne modifie pas l'objet d'entrée", () => {
  const b = base(); applyOp(b, { type: "remove", id: "x" }); applyOp(b, { type: "toggle", id: "x", done: true });
  assert.deepEqual(b, base());
});
test('encode/decode aller-retour de "Préparer — café ☕ « ok »"', () => {
  const s = "Préparer — café ☕ « ok »";
  assert.equal(decodeB64(encodeB64(s)), s);
});
test("decodeB64 accepte un base64 coupé par \n", () => {
  const b = encodeB64("Laver la vaisselle à 40 degrés, puis ranger");
  assert.equal(decodeB64(b.slice(0, 10) + "\n" + b.slice(10) + "\n"), "Laver la vaisselle à 40 degrés, puis ranger");
});
test("counts compte done/total de tous les groupes", () => {
  assert.deepEqual(counts(base().sections[0]), { done: 2, total: 3 });
});
test("newId donne un slug ASCII unique", () => {
  const a = newId("Café à l'atelier"), b = newId("Café à l'atelier");
  assert.match(a, /^[a-z0-9-]+$/); assert.notEqual(a, b);
});
