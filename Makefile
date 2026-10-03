include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI selectable multi-node WAN speed test
LUCI_DESCRIPTION:=Router-side WAN speed test with live charts, persistent history and CN/global presets
LUCI_DEPENDS:=+luci-base +curl +ca-bundle
LUCI_PKGARCH:=all
PKG_VERSION:=1.5.0
PKG_RELEASE:=1
PKG_LICENSE:=MIT

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
