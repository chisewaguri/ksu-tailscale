import { useEffect, useRef, useState } from 'react'
import type { DetailedHTMLProps, HTMLAttributes } from 'react'
import { createRoot } from 'react-dom/client'
import '@material/web/button/filled-button.js'
import '@material/web/button/text-button.js'
import '@material/web/progress/circular-progress.js'
import { command, copyText, openLogin, parseStatus } from './api'
import type { Status } from './api'
import './style.css'

type MaterialElement = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & { disabled?: boolean; indeterminate?: boolean }
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'md-filled-button': MaterialElement
      'md-text-button': MaterialElement
      'md-circular-progress': MaterialElement
    }
  }
}

const icons = {
  overview: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
  devices: 'M4 6h18V4H4c-1.1 0-2 .9-2 2v11H0v3h14v-3H4V6zm19 2h-6c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h6c.55 0 1-.45 1-1V9c0-.55-.45-1-1-1zm-1 9h-4v-7h4v7z',
  log: 'M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z',
}

function App() {
  const [page, setPage] = useState<'overview' | 'devices' | 'log'>('overview')
  const [status, setStatus] = useState<Status>()
  const [log, setLog] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [refreshError, setRefreshError] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const locked = useRef(false)
  const polling = useRef<Promise<unknown> | undefined>(undefined)

  async function run(task: () => Promise<unknown>, quiet = false) {
    if (locked.current || quiet && polling.current) return
    if (!quiet) {
      locked.current = true
      setBusy(true)
      setError('')
      setNotice('')
    }
    try {
      if (!quiet) await polling.current?.catch(() => {})
      const operation = task()
      if (quiet) polling.current = operation
      await operation
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (quiet) polling.current = undefined
      else {
        locked.current = false
        setBusy(false)
      }
    }
  }

  async function refresh() {
    let next: Status
    try {
      next = parseStatus(await command('status'))
      setStatus(next)
    } catch (cause) {
      setStatus(undefined)
      setRefreshError(cause instanceof Error ? cause.message : String(cause))
      return
    }
    try {
      if (page === 'log') setLog(await command('log'))
      setRefreshError('')
    } catch (cause) {
      setRefreshError(cause instanceof Error ? cause.message : String(cause))
    }
    return next
  }

  useEffect(() => {
    const update = () => {
      if (document.visibilityState === 'visible') void run(refresh, true)
    }
    update()
    const interval = window.setInterval(update, 5000)
    document.addEventListener('visibilitychange', update)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', update)
    }
  }, [page])

  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(''), 4000)
    return () => window.clearTimeout(timeout)
  }, [notice])

  const problem = error || refreshError
  const state = status?.BackendState
  const running = state === 'Running'
  const stopped = state === 'DaemonStopped'
  const self = status?.Self
  const signingIn = state === 'NeedsLogin' && Boolean(status?.AuthURL)
  const waiting = state === 'Starting' || state === 'NeedsMachineAuth' || state === 'NoState'
  const title = {
    Running: 'Connected',
    DaemonStopped: 'Disconnected',
    Stopped: 'Disconnected',
    NeedsLogin: 'Sign in required',
    NeedsMachineAuth: 'Awaiting approval',
    Starting: 'Connecting',
    NoState: 'Starting',
  }[state ?? ''] ?? (status ? state : problem ? 'Status unavailable' : 'Checking…')
  const peers = Object.entries(status?.Peer ?? {}).sort(([, a], [, b]) =>
    Number(Boolean(b.Online)) - Number(Boolean(a.Online)) || a.HostName.localeCompare(b.HostName))
  const filteredPeers = peers.filter(([, peer]) =>
    [peer.HostName, peer.DNSName, peer.OS, ...(peer.TailscaleIPs ?? [])].some((value) => value?.toLowerCase().includes(query.trim().toLowerCase())))
  const online = peers.filter(([, peer]) => peer.Online).length

  function action(name: 'start' | 'stop' | 'connect' | 'disconnect') {
    void run(async () => {
      await command(name)
      const next = await refresh()
      if (!next) return
      if (name === 'connect' && next.BackendState === 'NeedsLogin' && next.AuthURL) {
        await openLogin(next.AuthURL)
        setNotice('Finish signing in in your browser.')
      } else {
        setNotice(name === 'stop' ? 'Daemon stopped.' : name === 'start' ? 'Daemon started.' : '')
      }
    })
  }

  function copy(value: string, label = 'Address') {
    void run(async () => {
      await copyText(value)
      setNotice(`${label} copied.`)
    })
  }

  return (
    <>
      <header><h1>Tailscale</h1></header>
      <main aria-busy={busy}>
        {problem && <div className="error" role="alert">{problem}<md-text-button disabled={busy} onClick={() => void run(refresh)}>Retry</md-text-button></div>}
        {(busy || !status && !problem) && <div className="progress" role="status"><md-circular-progress indeterminate aria-label="Working" /></div>}
        {page === 'overview' && <>
          <section aria-labelledby="device-heading">
            <h2 id="device-heading">This device</h2>
            <dl className="rows">
              <div><dt>Status</dt><dd className="status" aria-live="polite">{title}</dd></div>
              <div><dt>Name</dt><dd>{self?.HostName || '–'}</dd></div>
              <div><dt>Addresses</dt><dd className="addresses">{self?.TailscaleIPs?.length ? self.TailscaleIPs.map((ip) => <button key={ip} className="address" disabled={busy} onClick={() => copy(ip)} aria-label={`Copy your address ${ip}`}><span className="mono">{ip}</span><span className="copy-label" aria-hidden="true">Copy</span></button>) : '–'}</dd></div>
              {self?.DNSName && <div><dt>DNS name</dt><dd>{self.DNSName.replace(/\.$/, '')}</dd></div>}
              <div><dt>Version</dt><dd>{status?.Version?.split('-')[0] ?? '–'}</dd></div>
              <div><dt>Daemon</dt><dd><md-text-button disabled={busy || !status} onClick={() => action(stopped ? 'start' : 'stop')}>{stopped ? 'Start' : 'Stop'}</md-text-button></dd></div>
            </dl>
            <md-filled-button disabled={busy || !status || waiting} onClick={() => {
              const url = status?.AuthURL
              if (signingIn && url) void run(() => openLogin(url))
              else action(running ? 'disconnect' : 'connect')
            }}>{signingIn ? 'Sign in' : running ? 'Disconnect' : 'Connect'}</md-filled-button>
          </section>
          {status?.Health?.length ? <section aria-labelledby="health-heading"><h2 id="health-heading">Health</h2><ul className="health">{status.Health.map((message) => <li key={message}>{message}</li>)}</ul></section> : null}
        </>}
        {page === 'devices' && <section aria-labelledby="peers-heading">
          <div className="section-heading"><h2 id="peers-heading">Devices</h2><span>{online}/{peers.length} online</span></div>
          <input className="search" type="search" aria-label="Search devices" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search devices" />
          {filteredPeers.length ? <ul className="peers">{filteredPeers.map(([id, peer]) => <li key={id}>
            <span className={`avatar ${peer.Online ? 'online' : ''}`} aria-hidden="true">{peer.HostName.slice(0, 1).toUpperCase()}</span>
            <div className="peer"><strong>{peer.HostName || peer.DNSName || 'Unnamed device'}</strong><small>{peer.OS || 'Unknown OS'}{peer.ExitNode ? ' · Exit node' : ''}</small><div className="addresses">{peer.TailscaleIPs?.map((ip) => <button key={ip} className="address" disabled={busy} onClick={() => copy(ip)} aria-label={`Copy ${peer.HostName || 'device'} address ${ip}`}><span className="mono">{ip}</span><span className="copy-label" aria-hidden="true">Copy</span></button>)}</div></div>
            <span className="peer-state">{peer.Online ? 'Online' : 'Offline'}</span>
          </li>)}</ul> : <p className="empty">{peers.length ? 'No matches' : 'No devices'}</p>}
        </section>}
        {page === 'log' && <section aria-labelledby="log-heading"><div className="section-heading"><h2 id="log-heading">Log</h2><md-text-button disabled={busy || !log} onClick={() => { if (log) copy(log, 'Log') }}>Copy</md-text-button></div><pre tabIndex={0} aria-label="Daemon log">{log === undefined ? 'Loading…' : log || 'Empty'}</pre></section>}
      </main>
      <nav aria-label="Main navigation">{(['overview', 'devices', 'log'] as const).map((tab) => <button key={tab} aria-current={page === tab ? 'page' : undefined} onClick={() => {
        setPage(tab)
      }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d={icons[tab]} /></svg>{tab === 'overview' ? 'Overview' : tab === 'devices' ? 'Devices' : 'Log'}</button>)}</nav>
      <div className="notice" role="status" aria-live="polite">{notice}</div>
    </>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
