/**
 * 全局统一加密工具：Web Crypto AES-256-CBC
 * 所有 GitHub PAT 密钥采用 AES-256-CBC 加密存储，全程本地，永不外传。
 *
 * 密钥体系：
 *  - 主密钥 MK：随机 32 字节，密文包装后存本机（gitgreen_mk）
 *  - 设备密钥：PBKDF2(固定口令 + 本地随机盐) 派生，用于包装 MK（日常无感解锁）
 *  - PIN 密钥：PBKDF2(用户口令) 派生；开启「口令加固」后改用 PIN 密钥包装 MK，
 *    锁定状态下内存中无 MK，无法解密任何数据；忘记口令数据不可恢复。
 *  - 兼容迁移：旧版本直接用设备密钥加密 PAT，首次启动自动迁移为 MK 加密。
 */

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const SALT_KEY = 'gitgreen_crypto_salt'
const PIN_SALT_KEY = 'gitgreen_pin_salt'
const MK_KEY = 'gitgreen_mk'
const HARDEN_KEY = 'gitgreen_mk_hardened'
const MIGRATED_KEY = 'gitgreen_crypto_migrated'
const ACCOUNTS_KEY = 'gitgreen_accounts'

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

function randomSalt(key: string): Uint8Array {
  let salt = localStorage.getItem(key)
  if (!salt) {
    salt = toBase64(crypto.getRandomValues(new Uint8Array(16)))
    localStorage.setItem(key, salt)
  }
  return fromBase64(salt)
}

/** 设备密钥（兼容旧版：与旧实现同参数派生，可解密旧密文） */
let deviceKeyPromise: Promise<CryptoKey> | null = null
function getDeviceKey(): Promise<CryptoKey> {
  if (!deviceKeyPromise) {
    deviceKeyPromise = (async () => {
      const base = await crypto.subtle.importKey('raw', encoder.encode('GitGreen-PAT-Local-Key'), 'PBKDF2', false, ['deriveKey'])
      return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: randomSalt(SALT_KEY) as BufferSource, iterations: 100000, hash: 'SHA-256' },
        base,
        { name: 'AES-CBC', length: 256 },
        false,
        ['encrypt', 'decrypt']
      )
    })()
  }
  return deviceKeyPromise
}

/** PIN 派生密钥（加固包装用） */
async function getPinKey(pin: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: randomSalt(PIN_SALT_KEY) as BufferSource, iterations: 150000, hash: 'SHA-256' },
    base,
    { name: 'AES-CBC', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/** PIN 校验哈希（派生位，用于验证口令正确性） */
export async function derivePinHash(pin: string): Promise<string> {
  const base = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: randomSalt(PIN_SALT_KEY) as BufferSource, iterations: 150000, hash: 'SHA-256' },
    base,
    256
  )
  return toBase64(new Uint8Array(bits))
}

/** 读取 PIN 派生盐（备份还原口令校验用） */
export function getPinSalt(): string {
  return localStorage.getItem(PIN_SALT_KEY) || ''
}

/** 写入 PIN 派生盐（备份还原时同步，保证口令校验跨设备一致） */
export function importPinSalt(salt: string): void {
  if (salt) localStorage.setItem(PIN_SALT_KEY, salt)
}

async function aesEncrypt(key: CryptoKey, data: Uint8Array): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(16))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-CBC', iv: iv as BufferSource }, key, data as BufferSource)
  const merged = new Uint8Array(16 + cipher.byteLength)
  merged.set(iv, 0)
  merged.set(new Uint8Array(cipher), 16)
  return toBase64(merged)
}

async function aesDecrypt(key: CryptoKey, packed: string): Promise<Uint8Array> {
  const data = fromBase64(packed)
  const iv = data.slice(0, 16)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: iv as BufferSource },
    key,
    data.slice(16) as BufferSource
  )
  return new Uint8Array(plain)
}

/** 运行期内存中的主密钥，锁定/加固状态下为空 */
let sessionMk: Uint8Array | null = null
let mkKeyPromise: Promise<CryptoKey> | null = null

function mkKeyFromSession(): Promise<CryptoKey> {
  if (!sessionMk) throw new Error('应用已锁定：主密钥不可用，请先解锁')
  if (!mkKeyPromise) {
    mkKeyPromise = crypto.subtle.importKey('raw', sessionMk as BufferSource, { name: 'AES-CBC' }, false, [
      'encrypt',
      'decrypt'
    ])
  }
  return mkKeyPromise
}

export function isHardened(): boolean {
  return localStorage.getItem(HARDEN_KEY) === '1'
}

export function isMasterKeyReady(): boolean {
  return sessionMk !== null
}

/** 清空内存主密钥（锁定） */
export function purgeMasterKey(): void {
  sessionMk = null
  mkKeyPromise = null
}

async function wrapMkWithDevice(mk: Uint8Array): Promise<void> {
  const key = await getDeviceKey()
  localStorage.setItem(MK_KEY, await aesEncrypt(key, mk))
}

/** 初始化：确保盐与主密钥存在，并完成旧密文迁移 */
let initPromise: Promise<void> | null = null
export function initCrypto(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      randomSalt(SALT_KEY)
      const deviceKey = await getDeviceKey()
      if (!localStorage.getItem(MK_KEY)) {
        sessionMk = crypto.getRandomValues(new Uint8Array(32))
        await wrapMkWithDevice(sessionMk)
      } else if (isHardened()) {
        // 加固模式：必须通过 PIN 解锁，启动时内存无主密钥
        sessionMk = null
      } else {
        try {
          sessionMk = await aesDecrypt(deviceKey, localStorage.getItem(MK_KEY)!)
        } catch {
          // 包装数据损坏：重建主密钥（旧PAT将无法解密，需重新绑定）
          sessionMk = crypto.getRandomValues(new Uint8Array(32))
          await wrapMkWithDevice(sessionMk)
        }
      }
      mkKeyPromise = null
      // 旧版本数据迁移：设备密钥加密的 PAT → 主密钥加密
      if (!localStorage.getItem(MIGRATED_KEY)) {
        localStorage.setItem(MIGRATED_KEY, '1')
        try {
          const accounts = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]')
          const mkKey = await mkKeyFromSession()
          let changed = false
          for (const acc of accounts) {
            if (!acc.encryptedPat) continue
            try {
              const plain = decoder.decode(await aesDecrypt(deviceKey, acc.encryptedPat))
              acc.encryptedPat = await aesEncrypt(mkKey, encoder.encode(plain))
              changed = true
            } catch {
              /* 已是新密文或不可解密，跳过 */
            }
          }
          if (changed) localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
        } catch {
          /* ignore */
        }
      }
    })()
  }
  return initPromise
}

/** AES-256-CBC 加密 PAT（主密钥），输出 Base64(IV + CipherText) */
export async function encryptPAT(plain: string): Promise<string> {
  await initCrypto()
  const key = await mkKeyFromSession()
  return aesEncrypt(key, encoder.encode(plain))
}

/** AES-256-CBC 解密 PAT（主密钥） */
export async function decryptPAT(encrypted: string): Promise<string> {
  await initCrypto()
  const key = await mkKeyFromSession()
  return decoder.decode(await aesDecrypt(key, encrypted))
}

/** PIN 解锁：用 PIN 派生密钥解包主密钥 */
export async function unlockWithPin(pin: string): Promise<boolean> {
  const pinKey = await getPinKey(pin)
  try {
    sessionMk = await aesDecrypt(pinKey, localStorage.getItem(MK_KEY) || '')
    mkKeyPromise = null
    return true
  } catch {
    return false
  }
}

/** 开启口令加固：MK 改用 PIN 密钥包装 */
export async function setHardened(pin: string): Promise<void> {
  await initCrypto()
  const mk = sessionMk || (await unlockWithPinThenGet(pin))
  if (!mk) throw new Error('口令错误')
  const pinKey = await getPinKey(pin)
  localStorage.setItem(MK_KEY, await aesEncrypt(pinKey, mk))
  localStorage.setItem(HARDEN_KEY, '1')
}

async function unlockWithPinThenGet(pin: string): Promise<Uint8Array | null> {
  const ok = await unlockWithPin(pin)
  return ok ? sessionMk : null
}

/** 关闭口令加固：MK 恢复设备密钥包装 */
export async function clearHardened(pin: string): Promise<void> {
  await initCrypto()
  const mk = sessionMk || (await unlockWithPinThenGet(pin))
  if (!mk) throw new Error('口令错误')
  await wrapMkWithDevice(mk)
  localStorage.setItem(HARDEN_KEY, '0')
}

/** 修改口令：加固模式下用新 PIN 重新包装 MK */
export async function rewrapWithNewPin(oldPin: string, newPin: string): Promise<void> {
  if (!isHardened()) return
  const oldKey = await getPinKey(oldPin)
  let mk: Uint8Array
  try {
    mk = await aesDecrypt(oldKey, localStorage.getItem(MK_KEY) || '')
  } catch {
    throw new Error('原口令错误')
  }
  const newKey = await getPinKey(newPin)
  localStorage.setItem(MK_KEY, await aesEncrypt(newKey, mk))
  sessionMk = mk
  mkKeyPromise = null
}

/** 忘记口令重置（加固模式）：旧主密钥不可恢复，重建全新主密钥并用新 PIN 包装 */
export async function resetMasterKey(newPin: string): Promise<void> {
  const mk = crypto.getRandomValues(new Uint8Array(32))
  const pinKey = await getPinKey(newPin)
  localStorage.setItem(MK_KEY, await aesEncrypt(pinKey, mk))
  localStorage.setItem(HARDEN_KEY, '1')
  sessionMk = mk
  mkKeyPromise = null
}

/** 备份导出：返回盐 + 设备密钥包装的 MK（含密钥备份可跨设备还原） */
export async function exportKeyMaterial(pin?: string): Promise<{ salt: string; mkWrapped: string }> {
  await initCrypto()
  let mk = sessionMk
  if (!mk) {
    if (!pin) throw new Error('需要口令解锁后才能导出含密钥备份')
    mk = await unlockWithPinThenGet(pin)
  }
  if (!mk) throw new Error('口令错误')
  const deviceKey = await getDeviceKey()
  return {
    salt: localStorage.getItem(SALT_KEY) || '',
    mkWrapped: await aesEncrypt(deviceKey, mk)
  }
}

/** 备份还原：写入盐与 MK 包装数据（还原后默认非加固状态） */
export async function importKeyMaterial(salt: string, mkWrapped: string): Promise<void> {
  localStorage.setItem(SALT_KEY, salt)
  localStorage.setItem(MK_KEY, mkWrapped)
  localStorage.setItem(HARDEN_KEY, '0')
  localStorage.setItem(MIGRATED_KEY, '1')
  deviceKeyPromise = null
  initPromise = null
  sessionMk = null
  mkKeyPromise = null
  await initCrypto()
}

/** 清空全部密钥材料 */
export function purgeAllKeyMaterial(): void {
  ;[SALT_KEY, PIN_SALT_KEY, MK_KEY, HARDEN_KEY, MIGRATED_KEY].forEach(k => localStorage.removeItem(k))
  deviceKeyPromise = null
  initPromise = null
  sessionMk = null
  mkKeyPromise = null
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
