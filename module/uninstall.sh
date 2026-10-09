#!/system/bin/sh
MODDIR=${0%/*}
sh "$MODDIR/ctl.sh" stop || exit 1
for dir in /data/adb/ksu/bin /data/adb/ap/bin; do
    [ "$(readlink "$dir/tailscale")" != "/data/adb/tailscale/bin/tailscale" ] || rm -f "$dir/tailscale"
done
# Keep the device identity so reinstalling does not require enrolling again.
rm -rf /data/adb/tailscale/bin
