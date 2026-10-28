# GitHub 发布 APK 方案（学习打卡表）

> 收藏于 2026-10-28。需要时可随时按此方案执行。

## 结论

GitHub 可以直接发布 .apk：通过 **Releases** 挂附件，无应用商店审核。但应用目前是网页，APK 需要把网页包进安卓 WebView 壳再编译；本机无安卓编译环境，**编译交给 GitHub Actions 云端完成**。

## 流程

```
推送代码 → GitHub Actions 自动构建 APK → 挂到 Releases → 手机浏览器下载安装
```

## 路线 A：WebView 套壳 APK（推荐）

- 极简安卓工程，WebView 加载打包进去的 `index.html`，申请网络权限（打卡码云同步可用）
- GitHub Actions 的 ubuntu 服务器自带安卓 SDK + JDK，本机零安装
- 应用名「学习打卡表」，图标用皮卡丘（180×180，`checkin-app/apple-touch-icon.png`）
- Actions 配置示例要点：
  - 触发：`on: push: tags: ['v*']` 或 workflow_dispatch 手动
  - 步骤：checkout → setup-java (temurin 17) → android-actions/setup-android（或直接用 gradle wrapper）→ `gradle assembleRelease` → 上传 artifact / 创建 Release 并附 .apk
  - 签名：debug 签名即可自装；正式发布可配置 keystore（存 GitHub Secrets）
- **缺点**：每次更新要重新构建并重新下载安装；网页版刷新即最新

## 路线 B：不打包（零成本，先试）

- 安卓/iPhone 均可「添加到主屏幕」：全屏运行、有图标、数据本地保存，效果接近原生
- iPhone 已修复主屏幕图标（2026-10-28 加了 `apple-touch-icon`，v2.2 起 180×180 皮卡丘）

## 安装前提（用户侧）

- Android 手机下载 .apk 后需允许「安装未知来源应用」
- 安装后数据存于 App 本地；卸载即清空（云端打卡码同步的勾选进度不受影响）

## 状态

- 未实施，等用户明确说「做 APK」再启动
- 仓库：github.com/diorninger/checkin-app（已就绪，PAT 有 Actions 权限即可）
