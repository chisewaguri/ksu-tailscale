import { exec, isKsuWebui } from 'kernelsu-alt'

const ctl = '/data/adb/modules/ksu-tailscale/ctl.sh'
export const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`

export interface Peer {
  HostName: string
  DNSName?: string
  TailscaleIPs?: string[]
  Online?: boolean
  OS?: string
  ExitNode?: boolean
}

export interface Status {
  BackendState: string
  Version?: string
  AuthURL?: string
  Self?: Peer
  Peer?: Record<string, Peer>
  Health?: string[]
}

export async function command(action: 'status' | 'start' | 'stop' | 'connect' | 'disconnect' | 'log'): Promise<string> {
  if (!isKsuWebui()) throw new Error('Open this WebUI in KernelSU or APatch Manager.')
  const { errno, stdout, stderr } = await exec(`sh ${ctl} ${action}`)
  if (errno !== 0) throw new Error(stderr.trim() || stdout.trim() || `Command failed with exit code ${errno}.`)
  return stdout
}

function isPeer(value: unknown): value is Peer {
  if (!value || typeof value !== 'object') return false
  const peer = value as Record<string, unknown>
  return typeof peer.HostName === 'string' &&
    ['DNSName', 'OS'].every((key) => peer[key] == null || typeof peer[key] === 'string') &&
    ['Online', 'ExitNode'].every((key) => peer[key] == null || typeof peer[key] === 'boolean') &&
    (peer.TailscaleIPs == null || Array.isArray(peer.TailscaleIPs) && peer.TailscaleIPs.every((ip) => typeof ip === 'string'))
}

export function parseStatus(output: string): Status {
  const value: unknown = JSON.parse(output)
  if (!value || typeof value !== 'object') throw new Error('Tailscale returned an invalid status.')
  const status = value as Record<string, unknown>
  if (typeof status.BackendState !== 'string' ||
    ['Version', 'AuthURL'].some((key) => status[key] != null && typeof status[key] !== 'string') ||
    status.Self != null && !isPeer(status.Self) ||
    status.Peer != null && (typeof status.Peer !== 'object' || Array.isArray(status.Peer) || !Object.values(status.Peer).every(isPeer)) ||
    status.Health != null && (!Array.isArray(status.Health) || !status.Health.every((message) => typeof message === 'string'))) {
    throw new Error('Tailscale returned an invalid status.')
  }
  return value as Status
}

export function authURL(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid sign-in URL.')
  return url.href
}

export async function openLogin(value: string): Promise<void> {
  const url = authURL(value)
  const { errno, stderr } = await exec(`am start -a android.intent.action.VIEW -d ${shellQuote(url)}`)
  if (errno !== 0) throw new Error(stderr.trim() || 'Could not open the sign-in page.')
}

export async function copyText(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value)
    return
  } catch {}
  const focused = document.activeElement
  const field = document.createElement('textarea')
  field.value = value
  field.setAttribute('readonly', '')
  field.setAttribute('aria-hidden', 'true')
  field.style.position = 'fixed'
  field.style.opacity = '0'
  document.body.append(field)
  try {
    field.select()
    if (!document.execCommand('copy')) throw new Error('Could not copy. Touch and hold the text to copy it.')
  } finally {
    field.remove()
    if (focused instanceof HTMLElement) focused.focus({ preventScroll: true })
  }
}
