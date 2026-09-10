/**
 * 全局统一加密工具：Web Crypto AES-256-CBC
 * 所有 GitHub PAT 密钥采用 AES-256-CBC 加密存储，全程本地，永不外传。
 */

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const SALT_KEY = 'gitgreen_crypto_salt'

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/** 本地随机盐（仅存于本机 LocalStorage，永不上传） */
function getLocalSalt(): Uint8Array {
  let salt = localStorage.getItem(SALT_KEY)
  if (!salt) {
    salt = toBase64(crypto.getRandomValues(new Uint8Array(16)))
    localStorage.setItem(SALT_KEY, salt)
  }
  return fromBase64(salt)
}

let keyPromise: Promise<CryptoKey> | null = null

/** PBKDF2-SHA256 派生 AES-256 密钥（仅本地） */
function getAesKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = (async () => {
      const baseKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode('GitGreen-PAT-Local-Key'),
        'PBKDF2',
        false,
        ['deriveKey']
      )
      return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: getLocalSalt() as BufferSource, iterations: 100000, hash: 'SHA-256' },
        baseKey,
        { name: 'AES-CBC', length: 256 },
        false,
        ['encrypt', 'decrypt']
      )
    })()
  }
  return keyPromise
}

/** AES-256-CBC 加密 PAT，输出 Base64(IV + CipherText) */
export async function encryptPAT(plain: string): Promise<string> {
  const key = await getAesKey()
  const iv = crypto.getRandomValues(new Uint8Array(16))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-CBC', iv: iv as BufferSource }, key, encoder.encode(plain))
  const merged = new Uint8Array(16 + cipher.byteLength)
  merged.set(iv, 0)
  merged.set(new Uint8Array(cipher), 16)
  return toBase64(merged)
}

/** AES-256-CBC 解密 PAT */
export async function decryptPAT(encrypted: string): Promise<string> {
  const key = await getAesKey()
  const data = fromBase64(encrypted)
  const iv = data.slice(0, 16)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: iv as BufferSource },
    key,
    data.slice(16) as BufferSource
  )
  return decoder.decode(plain)
}

/** UTF-8 字符串 -> Base64（GitHub Contents API 需要） */
export function utf8ToBase64(str: string): string {
  const bytes = encoder.encode(str)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

/** Base64 -> UTF-8 字符串 */
export function base64ToUtf8(b64: string): string {
  const bytes = fromBase64(b64.replace(/\s/g, ''))
  return decoder.decode(bytes)
}
