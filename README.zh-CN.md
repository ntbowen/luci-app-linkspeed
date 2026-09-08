# luci-app-linkspeed

中文 | [English](README.md)

运行在 OpenWrt/ImmortalWrt 路由器端的 LuCI 公网测速插件。

## 功能

- 中国内地、国外两套预设，可在 WebUI 中切换
- 单节点下载、五节点并发下载、三路上传、上下行同时测速
- WAN 接口每秒采样，实时绘制上下行曲线
- 持久化测速历史，每条记录包含一次完整测速的全部秒级点
- 历史曲线支持点击取点并显示准确速度
- 可设置最长时间、流量上限及历史数量；流量填 `0` 表示无限制
- 每次开始前确认，支持立即停止
- 后台任务避免 LuCI XHR 超时；流式上传带单进程内存保护

## 编译

将本目录放入 OpenWrt SDK 或源码树的 `package/` 目录：

```sh
./scripts/feeds update -a
./scripts/feeds install -a
make menuconfig
make package/luci-app-linkspeed/compile V=s
```

在 `LuCI -> Applications -> luci-app-linkspeed` 中选中，产物位于 `bin/packages/`。

## 配置

配置文件为 `/etc/config/linkspeed`。`cn_url`、`global_url` 可重复添加下载节点；`cn_upload_url`、`global_upload_url` 是上传端点。`duration` 范围为 3–86400 秒，`max_megabytes=0` 表示每方向不限流量，`history_limit` 保留 1–200 次完整测速。

测试期间历史点缓存在 `/tmp`，结束后一次性写入 `/overlay/linkspeed-history`，减少闪存磨损。第三方预设可能改址或限速，用户可自行替换。

## 安全提示

无限测试会消耗大量移动数据。更换端点后请先进行短时间、有限流量测试。上传固定三路并设置内存保护，以免嵌入式设备内存耗尽。

## 许可证

MIT
