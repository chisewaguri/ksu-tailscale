# KSU Tailscale

Runs Tailscale on rooted Android without mounting files into the system partition.

> [!NOTE]
> Connect to peers by their Tailscale IP addresses. MagicDNS stays off because Android keeps its own DNS configuration.

## Requirements

One of these:

- [KernelSU](https://github.com/tiann/KernelSU)
- [APatch](https://github.com/bmax121/APatch)

Also needed:

- An arm or arm64 device.
- A kernel with a TUN device.

## Install

Install the ZIP from the module page in KernelSU or APatch, then reboot. The module starts the daemon after boot unless you disable it.

Open the WebUI from the module page and press **Connect**. On first use, finish signing in through the browser. If your tailnet requires approval, approve the device in the Tailscale admin console.

## WebUI

The Overview page shows connection status, device name and addresses, and the daemon version. Press **Disconnect** to pause the connection, or **Stop** in the Daemon row to stop the background process.

The Devices page lists peers on your tailnet, with a search box and an online count. Press an address to copy it. Status refreshes every five seconds while the WebUI is open.

The Log page shows the last 100 lines of daemon output, with a button to copy them.

## Command line

The installer links `tailscale` into the root manager's bin directory, which KernelSU and APatch add to `PATH` for root shells.

```sh
tailscale status
```

Service controls:

```sh
sh /data/adb/modules/ksu-tailscale/ctl.sh status
sh /data/adb/modules/ksu-tailscale/ctl.sh connect
sh /data/adb/modules/ksu-tailscale/ctl.sh disconnect
sh /data/adb/modules/ksu-tailscale/ctl.sh start
sh /data/adb/modules/ksu-tailscale/ctl.sh stop
sh /data/adb/modules/ksu-tailscale/ctl.sh log
```

Connecting changes only the running and DNS preferences. Other preferences set through the Tailscale CLI stay as they are.

State, binaries, the socket, and logs live in `/data/adb/tailscale`. Uninstall stops the daemon and removes the binaries, then keeps the state directory so a reinstall reuses the device identity.

## Features

- No system mounts. The installer sets `skip_mount` and leaves the system partition untouched.
- The daemon starts after boot, and the WebUI can stop or start it.
- One daemon serves both the WebUI and the CLI, over a socket in the state directory.
- Uninstall keeps the device identity, so reinstalling does not enroll the device again.

## Build

Requires a POSIX shell, Git, Go, pnpm, Python 3, and Node.js `^22.18.0` or `>=24.0.0`.

```sh
sh build.sh
```

The script fetches Tailscale 1.104.1 at a pinned revision and patches routing for the per-network route tables Android uses. It builds arm and arm64 binaries, runs the WebUI tests, builds the WebUI, and writes `ksu-tailscale-1.0.0.zip`.

The build leaves out Tailscale SSH, the system tray, and the upstream web client.

For WebUI work:

```sh
pnpm --dir webui install --frozen-lockfile
pnpm --dir webui test
pnpm --dir webui dev
```

Open `/tests/ui.html` on the development server to run browser checks against a mocked root-manager bridge. These checks cover the WebUI only, not device networking or the manager WebView.

## Credits

- [Tailscale](https://github.com/tailscale/tailscale) for the daemon and CLI, licensed BSD-3-Clause.
- [System App Nuker](https://github.com/chisewaguri/systemapp_nuker) and [Tricky Addon](https://github.com/KOWX712/Tricky-Addon-Update-Target-List) for the WebUI layout and colors.

## Links

[![Issue](https://custom-icon-badges.demolab.com/badge/-Open%20Issue-palegreen?style=for-the-badge&logoColor=black&logo=issue-opened)](https://github.com/chisewaguri/ksu-tailscale/issues)

Licensed under [BSD-3-Clause](LICENSE). Module ZIPs also carry Tailscale's license and the WebUI dependency licenses.
