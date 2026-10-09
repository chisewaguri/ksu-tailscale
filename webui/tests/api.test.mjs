import assert from 'node:assert/strict'
import { test } from 'node:test'
import { authURL, command, copyText, openLogin, parseStatus, shellQuote } from '../src/api.ts'

test('bridge errors, status parsing, and sign-in quoting', async () => {
  globalThis.window = globalThis
  assert.equal(shellQuote("a'b"), "'a'\\''b'")
  assert.throws(() => parseStatus('{}'), /invalid status/)
  assert.throws(() => parseStatus('null'), /invalid status/)
  assert.equal(parseStatus('{"BackendState":"Stopped","Peer":null,"Health":null}').BackendState, 'Stopped')
  assert.throws(() => parseStatus('{"BackendState":"Running","Peer":{"a":null}}'), /invalid status/)
  assert.throws(() => parseStatus('{"BackendState":"Running","Self":{"HostName":7}}'), /invalid status/)
  assert.throws(() => parseStatus('{"BackendState":"Running","Health":[{}]}'), /invalid status/)
  assert.throws(() => authURL('javascript:alert(1)'), /Invalid sign-in/)
  assert.throws(() => authURL('https://user:password@example.com/'), /Invalid sign-in/)
  await assert.rejects(command('status'), /Open this WebUI/)
  globalThis.ksu = { exec: () => { throw new Error('Bridge failed') } }
  await assert.rejects(command('status'), /Bridge failed/)
  globalThis.ksu.exec = (_, __, callback) => globalThis[callback](1, '', 'Daemon failed')
  await assert.rejects(command('start'), /Daemon failed/)
  let invoked = ''
  globalThis.ksu.exec = (cmd, _, callback) => {
    invoked = cmd
    globalThis[callback](0, '{"BackendState":"Running"}', '')
  }
  assert.equal(parseStatus(await command('status')).BackendState, 'Running')
  await openLogin("https://login.tailscale.com/a/test?name=a'b")
  assert.ok(invoked.endsWith(shellQuote(authURL("https://login.tailscale.com/a/test?name=a'b"))))
  delete globalThis.ksu
  delete globalThis.window
})

test('copy uses the WebView fallback when clipboard permission is denied', async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const originalDocument = globalThis.document
  const originalHTMLElement = globalThis.HTMLElement
  let selected = false
  let removed = false
  let focused = false
  let copied = ''
  globalThis.HTMLElement = class { focus() { focused = true } }
  const field = { value: '', style: {}, setAttribute() {}, select() { selected = true }, remove() { removed = true } }
  globalThis.document = {
    activeElement: new globalThis.HTMLElement(),
    createElement: () => field,
    body: { append() {} },
    execCommand: (name) => {
      assert.equal(name, 'copy')
      assert.ok(selected)
      copied = field.value
      return true
    },
  }
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async () => { throw new Error('Permission denied') } } } })
  try {
    await copyText('100.64.0.7')
    assert.equal(copied, '100.64.0.7')
    assert.ok(removed && focused)
    removed = focused = false
    globalThis.document.execCommand = () => false
    await assert.rejects(copyText('100.64.0.7'), /copy/i)
    assert.ok(removed && focused)
  } finally {
    Object.defineProperty(globalThis, 'navigator', originalNavigator)
    globalThis.document = originalDocument
    globalThis.HTMLElement = originalHTMLElement
  }
})
