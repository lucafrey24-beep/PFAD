// Nachweis-Dateien liegen in IndexedDB dieses Browsers (nicht auf einem Server, nicht in der JSON-Sicherung).
const NAME = "pfad-files", ST = "f";
let dbp;
const db = () => dbp || (dbp = new Promise((res, rej) => { const q = indexedDB.open(NAME, 1); q.onupgradeneeded = () => q.result.createObjectStore(ST); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }));
async function tx(mode, fn) { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(ST, mode), r = fn(t.objectStore(ST)); t.oncomplete = () => res(r.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); }
export const putFile = (id, blob) => tx("readwrite", s => s.put(blob, id));
export const getFile = id => tx("readonly", s => s.get(id));
export const delFile = id => tx("readwrite", s => s.delete(id));
export async function sha256(blob) { const h = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()); return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, "0")).join(""); }
export const MAX = 25 * 1024 * 1024;
export const fmtSize = n => n < 1024 ? n + " B" : n < 1048576 ? Math.round(n / 1024) + " KB" : (n / 1048576).toFixed(1).replace(".", ",") + " MB";
