/**
 * 应用锁与安全服务：PIN 口令、口令加固主密钥、自动锁定、失败冷却
 */
import { reactive } from 'vue'
import * as crypto from './crypto'

const LOCK_KEY = 'gitgreen_lock'

interface LockPersist {
  enabled: boolean
  pinHash: string
  harden: boolean
  idleMinutes: number
  lockOnBackground: boolean
  failLimit: number
  cooldownSeconds: number
}

export const lockState = reactive({
  enabled: false,
  locked: false,
  pinSet: false,
  hardenMasterKey: false,
  autoLockIdleMinutes: 0,
  autoLockOnBackground: true,
  failLimit: 5,
  cooldownSeconds: 30,
  cooldownUntil: 0,
  failCount: 0
})

let loaded = false

function persist() {
  const data: LockPersist = {
    enabled: lockState.enabled,
    pinHash: localStorage.getItem('gitgreen_pin_hash') || '',
    harden: crypto.isHardened(),
    idleMinutes: lockState.autoLockIdleMinutes,
    lockOnBackground: lockState.autoLockOnBackground,
    failLimit: lockState.failLimit,
    cooldownSeconds: lockState.cooldownSeconds
  }
  localStorage.setItem(LOCK_KEY, JSON.stringify(data))
}

function readPersist(): Partial<LockPersist> {
  try {
    return JSON.parse(localStorage.getItem(LOCK_KEY) || '{}')
  } catch {
    return {}
  }
}

async function verifyPin(pin: string): Promise<boolean> {
  const hash = localStorage.getItem('gitgreen_pin_hash')
  if (!hash) return false
  return (await crypto.derivePinHash(pin)) === hash
}

/** 启动初始化：读取锁定配置，启用应用锁则进入锁定态 */
export async function initLock(): Promise<void> {
  if (loaded) return
  loaded = true
  const p = readPersist()
  lockState.enabled = !!p.enabled
  lockState.pinSet = !!p.pinHash
  lockState.hardenMasterKey = !!p.harden
  lockState.autoLockIdleMinutes = p.idleMinutes ?? 0
  lockState.autoLockOnBackground = p.lockOnBackground ?? true
  lockState.failLimit = p.failLimit ?? 5
  lockState.cooldownSeconds = p.cooldownSeconds ?? 30
  if (lockState.enabled) {
    if (lockState.hardenMasterKey) crypto.purgeMasterKey()
    lockState.locked = true
  }
  startWatchers()
}

/** 启用应用锁（首次设置口令） */
export async function enableLock(pin: string): Promise<void> {
  localStorage.setItem('gitgreen_pin_hash', await crypto.derivePinHash(pin))
  lockState.enabled = true
  lockState.pinSet = true
  lockState.locked = false
  persist()
}

/** 关闭应用锁（需当前口令） */
export async function disableLock(pin: string): Promise<void> {
  if (!(await verifyPin(pin))) throw new Error('口令错误')
  if (crypto.isHardened()) await crypto.clearHardened(pin)
  localStorage.removeItem('gitgreen_pin_hash')
  lockState.enabled = false
  lockState.pinSet = false
  lockState.hardenMasterKey = false
  lockState.locked = false
  persist()
}

/** 修改口令 */
export async function changePin(oldPin: string, newPin: string): Promise<void> {
  if (!(await verifyPin(oldPin))) throw new Error('原口令错误')
  if (crypto.isHardened()) await crypto.rewrapWithNewPin(oldPin, newPin)
  localStorage.setItem('gitgreen_pin_hash', await crypto.derivePinHash(newPin))
  persist()
}

/** 开启/关闭口令加固主密钥（需口令） */
export async function setHardenMasterKey(enable: boolean, pin: string): Promise<void> {
  if (!(await verifyPin(pin))) throw new Error('口令错误')
  if (enable) await crypto.setHardened(pin)
  else await crypto.clearHardened(pin)
  lockState.hardenMasterKey = enable
  persist()
}

/** 解锁 */
export async function unlock(pin: string): Promise<void> {
  const now = Date.now()
  if (lockState.cooldownUntil > now) {
    throw new Error(`尝试次数过多，请 ${Math.ceil((lockState.cooldownUntil - now) / 1000)} 秒后重试`)
  }
  const ok = await verifyPin(pin)
  if (ok && lockState.hardenMasterKey) {
    const keyOk = await crypto.unlockWithPin(pin)
    if (!keyOk) throw new Error('主密钥解包失败，请确认口令或从备份还原')
  }
  if (!ok) {
    lockState.failCount++
    if (lockState.failCount >= lockState.failLimit) {
      lockState.cooldownUntil = Date.now() + lockState.cooldownSeconds * 1000
      lockState.failCount = 0
      throw new Error(`失败次数达到上限，冷却 ${lockState.cooldownSeconds} 秒`)
    }
    throw new Error(`口令错误（剩余 ${lockState.failLimit - lockState.failCount} 次）`)
  }
  lockState.failCount = 0
  lockState.locked = false
}

/** 立即锁定 */
export function lock(): void {
  if (!lockState.enabled || lockState.locked) return
  lockState.locked = true
  if (lockState.hardenMasterKey) crypto.purgeMasterKey()
}

/** 更新自动锁定规则 */
export function updateLockRules(patch: Partial<Pick<typeof lockState, 'autoLockIdleMinutes' | 'autoLockOnBackground' | 'failLimit' | 'cooldownSeconds'>>): void {
  Object.assign(lockState, patch)
  persist()
}

/** 导出含密钥备份时验证口令 */
export async function confirmPin(pin: string): Promise<boolean> {
  return await verifyPin(pin)
}

/* ---------- 忘记口令（邮箱验证码重置） ---------- */

const OTP_KEY = 'gitgreen_pin_otp'
const OTP_TTL_MS = 10 * 60 * 1000

function maskEmail(email: string): string {
  const idx = email.indexOf('@')
  if (idx <= 1) return email
  return `${email.slice(0, 1)}${'*'.repeat(Math.min(4, idx - 1))}${email.slice(idx)}`
}

/** 向配置邮箱发送一次性验证码（10 分钟有效） */
export async function requestPinResetEmail(): Promise<{ ok: boolean; message: string; to?: string }> {
  if (!lockState.pinSet) return { ok: false, message: '尚未设置口令' }
  const { isEmailConfigured, getEmailSettings, sendOtpEmail } = await import('./emailService')
  if (!isEmailConfigured()) {
    return { ok: false, message: '未配置邮箱提醒，无法通过邮箱重置口令（请在设置中开启并填写完整）' }
  }
  const code = String(Math.floor(100000 + Math.random() * 900000))
  localStorage.setItem(OTP_KEY, JSON.stringify({ code, expiresAt: Date.now() + OTP_TTL_MS }))
  try {
    await sendOtpEmail(code)
  } catch (e: any) {
    localStorage.removeItem(OTP_KEY)
    return { ok: false, message: `验证码邮件发送失败：${e?.message || e}` }
  }
  return { ok: true, message: '验证码已发送', to: maskEmail(getEmailSettings().recipient) }
}

/** 凭验证码重置口令；口令加固模式下会重建主密钥（旧加密凭据需重新配置） */
export async function submitPinReset(otp: string, newPin: string): Promise<{ ok: boolean; message: string }> {
  if (newPin.trim().length < 4) return { ok: false, message: '口令至少 4 位' }
  let record: { code: string; expiresAt: number } | null = null
  try {
    record = JSON.parse(localStorage.getItem(OTP_KEY) || 'null')
  } catch {
    record = null
  }
  if (!record || record.code !== otp.trim() || Date.now() > record.expiresAt) {
    return { ok: false, message: '验证码错误或已过期，请重新获取' }
  }
  localStorage.removeItem(OTP_KEY)

  localStorage.setItem('gitgreen_pin_hash', await crypto.derivePinHash(newPin.trim()))
  lockState.cooldownUntil = 0
  lockState.failCount = 0

  if (lockState.hardenMasterKey) {
    // 旧主密钥随口令丢失：重建主密钥，清空全部账号密文凭证
    await crypto.resetMasterKey(newPin.trim())
    invalidateCredentials()
  }

  lockState.locked = false
  const { writeLog } = await import('./db')
  await writeLog({
    module: 'lock',
    action: '重置口令',
    detail: lockState.hardenMasterKey ? '通过邮箱验证码重置口令，主密钥已重建，账号凭据需重新配置' : '通过邮箱验证码重置口令',
    level: 'warning'
  })
  return { ok: true, message: lockState.hardenMasterKey ? '口令已重置；主密钥已重建，请重新配置各账号 PAT' : '口令已重置，已自动解锁' }
}

/** 加固重置后使所有账号密文凭证失效（需重新绑定 PAT） */
function invalidateCredentials(): void {
  try {
    const accounts = JSON.parse(localStorage.getItem('gitgreen_accounts') || '[]')
    let changed = false
    for (const acc of accounts) {
      if (acc.encryptedPat) {
        delete acc.encryptedPat
        acc.status = 'invalid'
        changed = true
      }
    }
    if (changed) localStorage.setItem('gitgreen_accounts', JSON.stringify(accounts))
  } catch {
    /* ignore */
  }
  import('@/stores/useAccountStore')
    .then(m => m.useAccountStore().reload())
    .catch(() => undefined)
}

/* ---------- 空闲 / 失焦自动锁定 ---------- */
let lastActivity = Date.now()
let started = false

function startWatchers() {
  if (started) return
  started = true
  const bump = () => (lastActivity = Date.now())
  ;['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(ev =>
    window.addEventListener(ev, bump, { passive: true })
  )
  window.setInterval(() => {
    if (!lockState.enabled || lockState.locked) return
    if (lockState.autoLockIdleMinutes > 0 && Date.now() - lastActivity > lockState.autoLockIdleMinutes * 60 * 1000) {
      lock()
    }
  }, 15 * 1000)
  window.addEventListener('blur', () => {
    if (lockState.autoLockOnBackground) lock()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && lockState.autoLockOnBackground) lock()
  })
}
