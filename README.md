# luci-app-linkspeed

[中文](README.zh-CN.md) | English

Router-side WAN speed testing for OpenWrt/ImmortalWrt LuCI.

## Features

- Switchable Mainland China and global endpoint groups
- Single-node and five-node downloads, three-stream upload, full duplex
- One-second live RX/TX chart and persistent run history
- Clickable historical charts with exact sample values
- Configurable duration, traffic ceiling (`0` = unlimited), and retained runs
- Confirmation before every run and immediate stop
- Detached jobs, streaming upload, and per-process memory protection

## Build

Put this directory under `package/` in an OpenWrt SDK/buildroot:

```sh
./scripts/feeds update -a
./scripts/feeds install -a
make menuconfig
make package/luci-app-linkspeed/compile V=s
```

Select `LuCI -> Applications -> luci-app-linkspeed`. Packages are generated under `bin/packages/`.

## Configuration

Edit `/etc/config/linkspeed`. `cn_url` and `global_url` are repeatable download endpoints. `cn_upload_url` and `global_upload_url` select upload receivers. `duration` accepts 3–86400 seconds, `max_megabytes=0` means unlimited per-direction traffic, and `history_limit` retains 1–200 complete runs.

History is buffered in `/tmp` and written once to `/overlay/linkspeed-history` after a run, reducing flash wear. Third-party preset endpoints may change or rate-limit traffic.

## Safety

Unlimited tests can consume significant mobile data. Start with a short finite test after changing endpoints. Upload uses three streams and a memory guard to protect embedded devices.

## License

MIT
