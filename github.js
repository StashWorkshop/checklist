// Lecture/écriture de checklist.json dans le dépôt privé, via l'API contents de GitHub.
import { applyOp, encodeB64, decodeB64 } from "./core.js";

const URL_FILE = "https://api.github.com/repos/StashWorkshop/checklist-data/contents/checklist.json";

export class AuthError extends Error {}
export class SyncError extends Error {}

async function call(token, fetchFn, opt = {}) {
  let res;
  try {
    res = await fetchFn(URL_FILE, { ...opt, cache: "no-store", headers: {
      Authorization: "Bearer " + token, Accept: "application/vnd.github+json" } });
  } catch (e) { throw new SyncError("Réseau indisponible"); }
  if (res.status === 401) throw new AuthError("Jeton refusé (401)");
  // 403 = aussi limite de requêtes : on garde le jeton.
  if (res.status === 403) throw new SyncError("Accès refusé ou limite atteinte (403)");
  return res;
}

export async function load(token, fetchFn = fetch) {
  const res = await call(token, fetchFn);
  if (!res.ok) throw new SyncError("GitHub a répondu " + res.status);
  const j = await res.json();
  return { data: JSON.parse(decodeB64(j.content)), sha: j.sha };
}

export async function commit(token, op, fetchFn = fetch) {
  for (let essai = 0; essai < 3; essai++) {
    const { data, sha } = await load(token, fetchFn);
    const next = applyOp(data, op);
    const res = await call(token, fetchFn, { method: "PUT", body: JSON.stringify({
      message: "checklist: " + op.type, sha, content: encodeB64(JSON.stringify(next, null, 2) + "\n") }) });
    if (res.ok) return { data: next, sha: (await res.json()).content.sha };
    if (res.status !== 409 && res.status !== 422) throw new SyncError("GitHub a répondu " + res.status);
  }
  throw new SyncError("Conflit répété, réessaie");
}
