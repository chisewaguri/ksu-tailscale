#!/system/bin/sh
MODDIR=${0%/*}
until [ "$(getprop sys.boot_completed)" = 1 ]; do sleep 1; done
[ -f "$MODDIR/disable" ] || sh "$MODDIR/ctl.sh" start
