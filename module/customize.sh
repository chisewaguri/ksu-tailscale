#!/system/bin/sh
# shellcheck disable=SC2034
SKIPUNZIP=1
TS=/data/adb/tailscale

[ "$BOOTMODE" = true ] || abort "Install from KernelSU or APatch Manager"
if [ "$KSU" = true ]; then
    BINDIR=/data/adb/ksu/bin
elif [ "$APATCH" = true ]; then
    BINDIR=/data/adb/ap/bin
else
    abort "This module requires KernelSU or APatch"
fi
case "$ARCH" in
    arm|arm64) ;;
    *) abort "Unsupported architecture: $ARCH" ;;
esac
[ ! -d /data/adb/modules/magisk-tailscaled ] || abort "Remove magisk-tailscaled before installing this module"

unzip -o "$ZIPFILE" module.prop service.sh uninstall.sh ctl.sh tailscale 'webroot/*' -d "$MODPATH" >&2 || abort "Could not extract module"
unzip -jo "$ZIPFILE" "bin/$ARCH/tailscaled" -d "$TMPDIR" >&2 || abort "Could not extract daemon"
mkdir -p "$TS/bin" "$BINDIR" || abort "Could not create directories"
chmod 700 "$TS" "$TS/bin"
# Replacing the inode allows upgrades while the old daemon is running.
mv -f "$TMPDIR/tailscaled" "$TS/bin/tailscaled" || abort "Could not install daemon"
cp "$MODPATH/tailscale" "$TS/bin/tailscale" || abort "Could not install CLI"
chmod 755 "$TS/bin/tailscaled" "$TS/bin/tailscale" "$MODPATH/ctl.sh" "$MODPATH/service.sh" "$MODPATH/uninstall.sh"
# KernelSU and APatch add this directory to PATH for root shells. Link only the
# CLI, so a bare tailscaled cannot start a second daemon on default state.
ln -sf "$TS/bin/tailscale" "$BINDIR/tailscale" || abort "Could not link tailscale"
touch "$MODPATH/skip_mount"
ui_print "- Tailscale installed without system mounts"
ui_print "- Open the WebUI after reboot to connect"
