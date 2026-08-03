"use client";

/**
 * Encryption for anything this app persists locally.
 *
 * **What this actually protects, stated plainly.** AES-GCM with a key the
 * browser holds as **non-extractable** — `extractable: false` is enforced by the
 * engine, so no script, extension or devtools session can read the key material
 * out. That makes a copied `localStorage` dump, a synced profile folder or a
 * disk backup useless without that specific browser profile.
 *
 * **What it does not protect against, equally plainly:** anything running
 * JavaScript *in this page*. An XSS payload does not need the key — it calls
 * `open()` like everyone else. This is defence against **exfiltrated storage**,
 * not against code execution, and calling it more than that would be theatre.
 *
 * It is here because the moment a design partner walks the flow they type in
 * *their* customers' names, phone numbers and amounts. Building the habit before
 * that happens costs a day and means there is never a version of this product
 * that writes plaintext PII to a shared laptop.
 */

const DB_NAME = "obez-erp-keys";
const DB_VERSION = 1;
const KEY_STORE = "keys";
const KEY_ID = "local-store-key";

/**
 * Envelope version. Bumped when the *ciphertext format* changes — not when the
 * application schema does. A mismatch means "this browser holds data this build
 * cannot read", which is a wipe-and-reseed, never a guess.
 */
export const ENVELOPE_VERSION = 1;

export type Envelope = {
  v: number;
  /** Base64 initialisation vector. Fresh 12 bytes per write — never reused. */
  iv: string;
  /** Base64 ciphertext. */
  ct: string;
};

/** Why sealing or opening was not possible. Callers must handle, not ignore. */
export type CryptoUnavailable =
  | { reason: "no_window" }
  | { reason: "no_subtle" }
  | { reason: "no_indexeddb" }
  | { reason: "key_failed"; detail: string };

export type CryptoResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: CryptoUnavailable };

export function unavailableMessage(error: CryptoUnavailable): string {
  switch (error.reason) {
    case "no_window":
      return "Local storage is not available while rendering on the server.";
    case "no_subtle":
      // Web Crypto requires a secure context. http://localhost counts; a bare
      // LAN IP over http does not, which is exactly how a demo on a phone fails.
      return "This browser has no Web Crypto — the page must be served over HTTPS or localhost.";
    case "no_indexeddb":
      return "This browser has no IndexedDB, so an encryption key cannot be held.";
    case "key_failed":
      return `The encryption key could not be prepared: ${error.detail}`;
  }
}

/* ------------------------------------------------------------ key handling */

function openKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(KEY_STORE)) {
        db.createObjectStore(KEY_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb open failed"));
  });
}

function readKey(db: IDBDatabase): Promise<CryptoKey | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEY_STORE, "readonly");
    const request = tx.objectStore(KEY_STORE).get(KEY_ID);
    request.onsuccess = () => resolve(request.result as CryptoKey | undefined);
    request.onerror = () => reject(request.error ?? new Error("key read failed"));
  });
}

function writeKey(db: IDBDatabase, key: CryptoKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEY_STORE, "readwrite");
    tx.objectStore(KEY_STORE).put(key, KEY_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("key write failed"));
  });
}

let keyPromise: Promise<CryptoResult<CryptoKey>> | null = null;

/**
 * Get the browser's key, generating it on first use.
 *
 * Memoised because every write would otherwise reopen IndexedDB. Generated with
 * `extractable: false` — this is the single line that makes the whole scheme
 * worth more than obfuscation, so it is not a parameter and never will be.
 */
export function getKey(): Promise<CryptoResult<CryptoKey>> {
  if (keyPromise) return keyPromise;

  keyPromise = (async (): Promise<CryptoResult<CryptoKey>> => {
    if (typeof window === "undefined") {
      return { ok: false, error: { reason: "no_window" } };
    }
    if (!("indexedDB" in window)) {
      return { ok: false, error: { reason: "no_indexeddb" } };
    }
    if (!window.crypto?.subtle) {
      return { ok: false, error: { reason: "no_subtle" } };
    }

    try {
      const db = await openKeyDb();
      const existing = await readKey(db);
      if (existing) return { ok: true, value: existing };

      const key = await window.crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        // NOT extractable. The engine refuses to hand the bytes back to any
        // script, including this one.
        false,
        ["encrypt", "decrypt"],
      );
      await writeKey(db, key);
      return { ok: true, value: key };
    } catch (error) {
      return {
        ok: false,
        error: {
          reason: "key_failed",
          detail: error instanceof Error ? error.message : String(error),
        },
      };
    }
  })();

  return keyPromise;
}

/** Drop the memoised key handle. Used by the reset control and by tests. */
export function forgetKey(): void {
  keyPromise = null;
}

/**
 * Destroy the key outright, which renders every existing envelope permanently
 * unreadable. This is the real "wipe" — clearing `localStorage` alone leaves
 * ciphertext in backups that a retained key could still open.
 */
export async function destroyKey(): Promise<void> {
  forgetKey();
  if (typeof window === "undefined" || !("indexedDB" in window)) return;
  const db = await openKeyDb();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(KEY_STORE, "readwrite");
    tx.objectStore(KEY_STORE).delete(KEY_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/* ------------------------------------------------------------ seal / open */

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// `Uint8Array<ArrayBuffer>` rather than a bare `Uint8Array`: since TS 5.7 the
// typed arrays are generic over their backing buffer, and `BufferSource` will
// not accept one that might be backed by a `SharedArrayBuffer`.
function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Encrypt a JSON-serialisable value into a storable envelope. */
export async function seal(value: unknown): Promise<CryptoResult<Envelope>> {
  const key = await getKey();
  if (!key.ok) return key;

  // A fresh IV per write. Reusing one under AES-GCM is catastrophic — it leaks
  // the XOR of two plaintexts — so this is generated here and never cached.
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(value));

  try {
    const ct = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key.value,
      encoded,
    );
    return {
      ok: true,
      value: {
        v: ENVELOPE_VERSION,
        iv: toBase64(iv),
        ct: toBase64(new Uint8Array(ct)),
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        reason: "key_failed",
        detail: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

/**
 * The outcomes of trying to read stored data back.
 *
 * `stale_version` and `corrupt` are **separate** from a crypto failure on
 * purpose: the first two mean "wipe and re-seed, the user loses demo data",
 * while the third means "this browser cannot persist at all", and those deserve
 * different messages. Collapsing them into `null` is how a product ends up
 * silently discarding someone's work.
 */
export type OpenResult<T> =
  | { kind: "opened"; value: T }
  | { kind: "absent" }
  | { kind: "stale_version"; found: number }
  | { kind: "corrupt"; detail: string }
  | { kind: "unavailable"; error: CryptoUnavailable };

export async function open<T>(raw: string | null): Promise<OpenResult<T>> {
  if (raw === null) return { kind: "absent" };

  let envelope: Envelope;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as Envelope).v !== "number" ||
      typeof (parsed as Envelope).iv !== "string" ||
      typeof (parsed as Envelope).ct !== "string"
    ) {
      return { kind: "corrupt", detail: "not an envelope" };
    }
    envelope = parsed as Envelope;
  } catch {
    return { kind: "corrupt", detail: "not JSON" };
  }

  if (envelope.v !== ENVELOPE_VERSION) {
    return { kind: "stale_version", found: envelope.v };
  }

  const key = await getKey();
  if (!key.ok) return { kind: "unavailable", error: key.error };

  try {
    const plain = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(envelope.iv) },
      key.value,
      fromBase64(envelope.ct),
    );
    return { kind: "opened", value: JSON.parse(new TextDecoder().decode(plain)) as T };
  } catch (error) {
    // AES-GCM is authenticated: a failure here means the ciphertext was
    // truncated or tampered with, or the key is not the one that sealed it.
    // Either way the bytes are not trustworthy and are not guessed at.
    return {
      kind: "corrupt",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
