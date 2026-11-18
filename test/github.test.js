import test from "node:test";
import assert from "node:assert/strict";
import { load, commit, AuthError, SyncError } from "../github.js";
import { encodeB64, decodeB64 } from "../core.js";

const doc = () => ({ version: 1, sections: [{ id: "a", title: "A", tag: "", groups: [{ title: "", items: [
  { id: "x", text: "X", note: "", done: false }, { id: "y", text: "Y", note: "", done: false }] }] }] });

// Faux serveur GitHub : un fichier, un sha qui change à chaque écriture.
function fakeRemote({ data = doc(), conflicts = 0, beforeConflict } = {}) {
  const r = { data, sha: "s0", n: 0, puts: [], gets: 0 };
  r.fetch = async (url, opt = {}) => {
    assert.match(url, /\/repos\/StashWorkshop\/checklist-data\/contents\/checklist\.json/);
    assert.equal(opt.headers.Authorization, "Bearer tok");
    if (!opt.method || opt.method === "GET") {
      r.gets++;
      return { ok: true, status: 200, json: async () => ({ sha: r.sha, content: encodeB64(JSON.stringify(r.data)) }) };
    }
    const body = JSON.parse(opt.body); r.puts.push(body);
    if (conflicts > 0 || body.sha !== r.sha) {
      conflicts--; beforeConflict?.(r); r.sha = "s" + ++r.n;
      return { ok: false, status: 409, json: async () => ({}) };
    }
    r.data = JSON.parse(decodeB64(body.content)); r.sha = "s" + ++r.n;
    return { ok: true, status: 200, json: async () => ({ content: { sha: r.sha } }) };
  };
  return r;
}

test("load décode le contenu et renvoie le sha", async () => {
  const r = fakeRemote();
  assert.deepEqual(await load("tok", r.fetch), { data: doc(), sha: "s0" });
});
test("commit envoie le sha lu et le contenu modifié", async () => {
  const r = fakeRemote();
  const res = await commit("tok", { type: "toggle", id: "x", done: true }, r.fetch);
  assert.equal(r.puts[0].sha, "s0");
  assert.equal(r.puts[0].message, "checklist: toggle");
  assert.equal(r.data.sections[0].groups[0].items[0].done, true);
  assert.deepEqual(res, { data: r.data, sha: "s1" });
});
test("commit après 409 relit et rejoue : une coche faite par un autre appareil entre-temps est conservée", async () => {
  const r = fakeRemote({ conflicts: 1, beforeConflict: r => { r.data.sections[0].groups[0].items[1].done = true; } });
  await commit("tok", { type: "toggle", id: "x", done: true }, r.fetch);
  assert.deepEqual(r.data.sections[0].groups[0].items.map(i => i.done), [true, true]);
  assert.equal(r.gets, 2);
});
test("commit abandonne après 3 conflits avec SyncError", async () => {
  const r = fakeRemote({ conflicts: 99 });
  await assert.rejects(commit("tok", { type: "toggle", id: "x", done: true }, r.fetch), SyncError);
  assert.equal(r.puts.length, 3);
});
test("401 lève AuthError, sans nouvel essai", async () => {
  let calls = 0;
  const f = async () => { calls++; return { ok: false, status: 401, json: async () => ({}) }; };
  await assert.rejects(load("tok", f), AuthError);
  await assert.rejects(commit("tok", { type: "remove", id: "x" }, f), AuthError);
  assert.equal(calls, 2);
});
test("500 ou fetch qui rejette lève SyncError", async () => {
  await assert.rejects(load("tok", async () => ({ ok: false, status: 500, json: async () => ({}) })), SyncError);
  await assert.rejects(load("tok", async () => { throw new TypeError("Failed to fetch"); }), SyncError);
});
test("403 (limite de requêtes) lève SyncError, pas AuthError", async () => {
  const f = async () => ({ ok: false, status: 403, json: async () => ({}) });
  await assert.rejects(load("tok", f), e => e instanceof SyncError && !(e instanceof AuthError));
});
