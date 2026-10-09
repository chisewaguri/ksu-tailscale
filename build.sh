#!/bin/sh
set -eu
cd "$(dirname "$0")"
VERSION=1.104.1
REVISION=9a522a9786c97eb7910c01ccb7bd66557b04c910
SOURCE="$PWD/build/source"
mkdir -p build
if [ ! -d "$SOURCE" ]; then
    git clone --depth 1 --branch "v$VERSION" https://github.com/tailscale/tailscale.git "$SOURCE"
fi
[ "$(git -C "$SOURCE" rev-parse HEAD)" = "$REVISION" ] || { printf 'Unexpected Tailscale revision\n' >&2; exit 1; }
PATCH=$(cat <<'DIFF'
diff --git a/wgengine/router/osrouter/router_linux.go b/wgengine/router/osrouter/router_linux.go
index c8b31d0..8fbc591 100644
--- a/wgengine/router/osrouter/router_linux.go
+++ b/wgengine/router/osrouter/router_linux.go
@@ -1651,0 +1652,4 @@ func ipRules() []netlink.Rule {
+	// Android keeps default routes in per-network tables, not main or default.
+	if _, err := os.Stat("/dev/__properties__"); err == nil {
+		return ubntIPRules
+	}
@@ -1702,0 +1707,3 @@ func (r *linuxRouter) addIPRulesWithIPCommand() error {
+			if rule.Invert {
+				args = append(args, "not")
+			}
DIFF
)
if [ -z "$(git -C "$SOURCE" status --porcelain)" ]; then
    printf '%s\n' "$PATCH" | git -C "$SOURCE" apply --unidiff-zero
else
    [ "$(git -C "$SOURCE" status --porcelain)" = ' M wgengine/router/osrouter/router_linux.go' ] &&
        [ "$(git -C "$SOURCE" diff --unified=0)" = "$PATCH" ] || { printf 'Tailscale source has unexpected local changes\n' >&2; exit 1; }
fi

# Linux builds include the kernel router and upstream's Android DNS and CA-root fallbacks.
for arch in arm arm64; do
    mkdir -p "build/bin/$arch"
    (cd "$SOURCE" && CGO_ENABLED=0 GOOS=linux GOARCH="$arch" GOARM=7 \
        TAGS=ts_include_cli,ts_omit_ssh,ts_omit_systray,ts_omit_webclient \
        sh ./build_dist.sh --strip -o "../bin/$arch/tailscaled" ./cmd/tailscaled)
done
pnpm --dir webui install --frozen-lockfile
pnpm --dir webui test
pnpm --dir webui build
python -I - <<'PY'
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path.cwd()
with ZipFile(root / 'ksu-tailscale-1.0.0.zip', 'w', ZIP_DEFLATED) as archive:
    for directory in (root / 'module', root / 'build/bin'):
        for path in sorted(directory.rglob('*')):
            if path.is_file():
                base = directory.parent if directory.name == 'bin' else directory
                archive.write(path, path.relative_to(base))
    archive.write(root / 'LICENSE', 'LICENSE')
    archive.write(root / 'build/source/LICENSE', 'LICENSE.tailscale')
PY
