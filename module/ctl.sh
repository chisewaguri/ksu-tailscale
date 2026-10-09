#!/system/bin/sh
TS=/data/adb/tailscale
PIDFILE=$TS/tailscaled.pid
export HOME=$TS
export TS_LOGS_DIR=$TS
export PATH="/data/adb/ksu/bin:/data/adb/ap/bin:/system/bin:$PATH"
umask 077

fail() { printf '%s\n' "$*" >&2; exit 1; }
running() {
    [ -f "$PIDFILE" ] || return 1
    read -r pid < "$PIDFILE"
    case "$pid" in ''|*[!0-9]*) return 1 ;; esac
    [ "$pid" -gt 1 ] || return 1
    case "$(readlink "/proc/$pid/exe")" in
        "$TS/bin/tailscaled"|"$TS/bin/tailscaled (deleted)") kill -0 "$pid" 2>/dev/null ;;
        *) return 1 ;;
    esac
}

start() {
    running && return 0
    if [ ! -e /dev/net/tun ] && [ -c /dev/tun ]; then
        mkdir -p /dev/net || fail "Could not create the TUN directory"
        ln -s /dev/tun /dev/net/tun || fail "Could not expose the TUN device"
    fi
    [ -c /dev/net/tun ] || fail "Kernel TUN device is unavailable"
    nohup "$TS/bin/tailscaled" --statedir="$TS" --socket="$TS/tailscaled.sock" --tun=tailscale0 </dev/null >"$TS/tailscaled.log" 2>&1 9>&- &
    pid=$!
    printf '%s\n' "$pid" > "$PIDFILE" || { kill "$pid"; fail "Could not record daemon PID"; }
    for _ in 1 2 3 4 5 6 7 8 9 10; do
        sleep 1
        running || { tail -n 30 "$TS/tailscaled.log" >&2; return 1; }
        "$TS/bin/tailscale" status --json >/dev/null 2>&1 && return 0
    done
    fail "Daemon did not become ready. Check its log."
}

stop() {
    if running; then
        kill "$pid" || return 1
        for _ in 1 2 3 4 5 6 7 8 9 10; do
            running || break
            sleep 1
        done
        running && fail "Daemon is still stopping. Its PID file has been kept."
    fi
    rm -f "$PIDFILE"
}

case "$1" in
    status)
        if running; then
            exec "$TS/bin/tailscale" status --json
        fi
        printf '{"BackendState":"DaemonStopped"}\n'
        exit 0
        ;;
    log) [ ! -f "$TS/tailscaled.log" ] || tail -n 100 "$TS/tailscaled.log"; exit 0 ;;
    start|stop|connect|disconnect) ;;
    *) fail "Usage: $0 start|stop|status|connect|disconnect|log" ;;
esac
mkdir -p "$TS" || fail "Could not create state directory"
chmod 700 "$TS"
exec 9>"$TS/control.lock" || fail "Could not open service lock"
BB=/data/adb/ksu/bin/busybox
[ -x "$BB" ] || BB=/data/adb/ap/bin/busybox
[ -x "$BB" ] || fail "Root manager BusyBox is unavailable"
"$BB" flock -n 9 || fail "Another service operation is running"
case "$1" in
    start) start ;;
    stop) stop ;;
    connect)
        start || exit 1
        # Edit only these preferences so reconnecting keeps settings changed through the CLI.
        "$TS/bin/tailscale" debug localapi PATCH /localapi/v0/prefs \
            '{"WantRunning":true,"WantRunningSet":true,"CorpDNS":false,"CorpDNSSet":true}' >/dev/null || exit 1
        state=$("$TS/bin/tailscale" status --json) || exit 1
        if printf '%s\n' "$state" | grep -q '"BackendState"[[:space:]]*:[[:space:]]*"NeedsLogin"'; then
            "$TS/bin/tailscale" debug localapi POST /localapi/v0/login-interactive >/dev/null || exit 1
            for _ in 1 2 3 4 5 6 7 8 9 10; do
                state=$("$TS/bin/tailscale" status --json) || exit 1
                printf '%s\n' "$state" | grep -q '"AuthURL"[[:space:]]*:[[:space:]]*"https://' && exit 0
                sleep 1
            done
            fail "Sign-in URL is not ready. Refresh to check again."
        fi
        ;;
    disconnect) "$TS/bin/tailscale" down ;;
esac
