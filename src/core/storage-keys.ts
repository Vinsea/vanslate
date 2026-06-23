export const STORAGE_KEY_PREFIX = "vv_vanslate_";
const CRYPTO_SECRET_KEY = "cryptoSecret";
const ENCRYPTED_PREFIX = "vvenc1:";

export function storageKey(key: string): string {
  return key.startsWith(STORAGE_KEY_PREFIX) ? key : `${STORAGE_KEY_PREFIX}${key}`;
}

export function storageKeys(keys: string[]): string[] {
  return keys.map(storageKey);
}

export async function readStorageValues(area: any, keys: string[]): Promise<Record<string, unknown>> {
  const stored = await area.get(storageKeys(keys));
  const output: Record<string, unknown> = {};
  for (const key of keys) {
    const prefixedKey = storageKey(key);
    if (stored[prefixedKey] !== undefined) output[key] = await decryptStorageValue(area, key, stored[prefixedKey]);
  }
  return output;
}

export async function writeStorageValues(area: any, values: Record<string, unknown>): Promise<void> {
  const prefixed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    prefixed[storageKey(key)] = await encryptStorageValue(area, key, value);
  }
  await area.set(prefixed);
}

export function maskSecret(value: unknown): string {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= 12) return `${text.slice(0, Math.min(4, text.length))}••••`;
  return `${text.slice(0, 8)}••••${text.slice(-4)}`;
}

function shouldEncryptStorageKey(key: string): boolean {
  return key === "apiKey";
}

async function encryptStorageValue(area: any, key: string, value: unknown): Promise<unknown> {
  if (shouldEncryptStorageKey(key)) return encryptSecretString(area, String(value || ""));
  if (key === "selectionTools" && Array.isArray(value)) {
    return Promise.all(value.map(async (tool) => {
      if (!tool || typeof tool !== "object") return tool;
      const record = { ...(tool as Record<string, unknown>) };
      record.apiKey = await encryptSecretString(area, String(record.apiKey || ""));
      return record;
    }));
  }
  return value;
}

async function decryptStorageValue(area: any, key: string, value: unknown): Promise<unknown> {
  if (shouldEncryptStorageKey(key)) return decryptSecretString(area, value);
  if (key === "selectionTools" && Array.isArray(value)) {
    return Promise.all(value.map(async (tool) => {
      if (!tool || typeof tool !== "object") return tool;
      const record = { ...(tool as Record<string, unknown>) };
      record.apiKey = await decryptSecretString(area, record.apiKey);
      return record;
    }));
  }
  return value;
}

async function encryptSecretString(area: any, value: string): Promise<string> {
  const text = String(value || "");
  if (!text) return "";
  const crypto = globalThis.crypto;
  if (!crypto?.subtle) throw new Error("Web Crypto is required to encrypt API keys.");
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const key = await importCryptoKey(area);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(new TextEncoder().encode(text))
  );
  return `${ENCRYPTED_PREFIX}${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

async function decryptSecretString(area: any, value: unknown): Promise<string> {
  const text = String(value || "");
  if (!text || !text.startsWith(ENCRYPTED_PREFIX)) return text;
  const crypto = globalThis.crypto;
  if (!crypto?.subtle) return "";
  try {
    const [ivText, payloadText] = text.slice(ENCRYPTED_PREFIX.length).split(".");
    if (!ivText || !payloadText) return "";
    const key = await importCryptoKey(area);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(base64ToBytes(ivText)) },
      key,
      toArrayBuffer(base64ToBytes(payloadText))
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return "";
  }
}

async function importCryptoKey(area: any): Promise<CryptoKey> {
  const crypto = globalThis.crypto;
  if (!crypto?.subtle) throw new Error("Web Crypto is required to encrypt API keys.");
  const secret = await getOrCreateSecret(area);
  return crypto.subtle.importKey("raw", toArrayBuffer(base64ToBytes(secret)), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function getOrCreateSecret(area: any): Promise<string> {
  const key = storageKey(CRYPTO_SECRET_KEY);
  const stored = await area.get([key]);
  const existing = String(stored?.[key] || "");
  if (existing) return existing;
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  const secret = bytesToBase64(bytes);
  await area.set({ [key]: secret });
  return secret;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === "function") {
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }
  const buffer = (globalThis as typeof globalThis & { Buffer?: { from(value: Uint8Array | string, encoding?: string): { toString(encoding: string): string } } }).Buffer;
  if (!buffer) throw new Error("Base64 encoding is unavailable.");
  return buffer.from(bytes).toString("base64");
}

function base64ToBytes(value: string): Uint8Array {
  if (typeof atob === "function") {
    return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  }
  const buffer = (globalThis as typeof globalThis & { Buffer?: { from(value: string, encoding: string): Uint8Array } }).Buffer;
  if (!buffer) throw new Error("Base64 decoding is unavailable.");
  return new Uint8Array(buffer.from(value, "base64"));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
