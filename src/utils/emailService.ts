/**
 * 邮箱提醒（口令备份）：通过 EmailJS 直发，用户显式触发，无自建后端
 */

const EMAIL_KEY = 'gitgreen_email'

export interface EmailSettings {
  enabled: boolean
  recipient: string
  serviceId: string
  templateId: string
  publicKey: string
  paramTo: string
  paramSubject: string
  paramMessage: string
}

const DEFAULTS: EmailSettings = {
  enabled: false,
  recipient: '',
  serviceId: '',
  templateId: '',
  publicKey: '',
  paramTo: 'to_email',
  paramSubject: 'subject',
  paramMessage: 'message'
}

export function getEmailSettings(): EmailSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(EMAIL_KEY) || '{}') }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveEmailSettings(patch: Partial<EmailSettings>): EmailSettings {
  const next = { ...getEmailSettings(), ...patch }
  localStorage.setItem(EMAIL_KEY, JSON.stringify(next))
  return next
}

/** EmailJS 公开 REST 接口发送 */
export async function sendEmail(subject: string, message: string): Promise<void> {
  const s = getEmailSettings()
  if (!s.recipient || !s.serviceId || !s.templateId || !s.publicKey) {
    throw new Error('请先完整填写 EmailJS 配置与收件邮箱')
  }
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: s.serviceId,
      template_id: s.templateId,
      user_id: s.publicKey,
      template_params: {
        [s.paramTo || 'to_email']: s.recipient,
        [s.paramSubject || 'subject']: subject,
        [s.paramMessage || 'message']: message
      }
    })
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`邮件发送失败（HTTP ${res.status}）${text ? '：' + text.slice(0, 120) : ''}`)
  }
}

/** 设置/修改口令时发送提醒邮件 */
export async function sendPinReminder(pin: string): Promise<void> {
  const s = getEmailSettings()
  if (!s.enabled) return
  await sendEmail(
    'GitGreen 应用锁口令提醒',
    `你的 GitGreen 应用锁口令为：${pin}\n\n请妥善保管，忘记口令且开启口令加固时，本机加密数据将无法恢复。`
  )
}

/** 邮箱是否已完整配置（忘记口令重置的前置条件） */
export function isEmailConfigured(): boolean {
  const s = getEmailSettings()
  return s.enabled && !!s.recipient && !!s.serviceId && !!s.templateId && !!s.publicKey
}

/** 忘记口令：发送一次性验证码邮件 */
export async function sendOtpEmail(code: string): Promise<void> {
  await sendEmail(
    'GitGreen 重置口令验证码',
    `你的重置口令验证码为：${code}\n\n验证码 10 分钟内有效。如非本人操作，请忽略本邮件。`
  )
}
