# 自己打一个能装的 APK

这个仓库提供了**不依赖 HBuilderX** 的打包链路：

```
仓库源码 (HBuilderX 布局)
   │  node tools/build-h5.js      ← uni-app CLI 编译
   ▼
H5 产物 (unpackage/dist/build/h5)
   │  node tools/build-apk.js     ← aapt2 + javac + d8 + zipalign + apksigner
   ▼
FakeKeep-1.1.0-webview.apk  (约 2 MB)
```

一条命令搞定（首次会自动装编译依赖）：

```bash
npm install
node tools/build-h5.js --install
node tools/build-apk.js
```

产物：`unpackage/release/apk/FakeKeep-1.1.0-webview.apk`

安装：

```bash
adb install -r unpackage/release/apk/FakeKeep-1.1.0-webview.apk
```

或者把 APK 拷到手机上点开安装（需要在系统设置里允许「安装未知来源应用」）。

> 这个 APK 用的是**自动生成的 demo 签名**，和任何已发布的 FakeKeep 签名都不同，
> 所以如果手机上装过旧版，要**先卸载旧版**再装这个。

---

## 它是怎么做的，以及和官方打包的区别

| | HBuilderX 云打包 / 离线打包 | 本仓库的 H5 + WebView 方案 |
| --- | --- | --- |
| 运行时 | DCloud 5+ 原生运行时 | 系统 WebView |
| 相册写入 | `uni.saveImageToPhotosAlbum` 原生能力 | 长按图片 → 原生 MediaStore 写入 |
| 选图片 | 原生相册/相机 | `WebChromeClient.onShowFileChooser` |
| 需要什么 | HBuilderX + DCloud 账号（云打包）或 离线 SDK + Android Studio | 只要有 Android SDK 的 build-tools + 一个 JDK |
| 产物 | 官方 App APK | 外壳 APK，内含编译好的 H5 |

**取舍**：这条路胜在**可复现、无需账号、构建十几秒**，适合"我就想装到手机上看看效果"；
如果是要正式发布上架，仍然建议走 HBuilderX 云打包 / 离线打包，那样才有 5+ 原生的
启动图、原生相册权限、更好的性能和兼容性。两者用的是**同一份源码**，功能一致。

外壳代码在 `tools/android-webview/`，只有两个文件：

- `AndroidManifest.xml` —— 包名 `com.fakekeep.app`，minSdk 21 / targetSdk 34
- `java/com/fakekeep/app/MainActivity.java` —— 一个 WebView + 两处原生补强：
  1. `onShowFileChooser`：让页面里的「选照片」能打开相册/相机
  2. 长按 `data:image/...` 图片 → 确认后写入系统相册（`Pictures/FakeKeep`）

之所以不用 Gradle：外壳只用到 Android 框架 API（没有 AndroidX、没有三方库），
`aapt2 + javac + d8 + zipalign + apksigner` 这一条流水线就够，省掉 Gradle 和 Maven 下载。

---

## 环境要求

脚本会自动探测，找不到会明确告诉你要配哪个环境变量：

- **Android SDK**：需要 `build-tools`（含 aapt2 / zipalign / d8 / apksigner）和
  `platforms/android-XX/android.jar`。
  依次找 `ANDROID_HOME`、`ANDROID_SDK_ROOT`、`%LOCALAPPDATA%\Android\Sdk`。
- **JDK**（需要 javac / jar / keytool / java）。
  依次找 `JAVA_HOME`、Android Studio 自带的 `jbr`、`C:\Program Files\Android\openjdk`。

实测用的组合：Android SDK build-tools 36.1.0 + Android Studio 自带 JBR(OpenJDK 21)。

---

## 踩过的坑（改脚本前先看）

1. **`UNI_CLI_CONTEXT` 不设就会静默失败。**
   `@dcloudio/uni-cli-shared/lib/plugin.js` 会执行
   `require(path.resolve(process.env.UNI_CLI_CONTEXT, 'package.json'))`。
   没设这个变量就抛 `ERR_INVALID_ARG_TYPE`，而这个异常是**异步抛出**的，
   `vue-cli-service` 会「一行输出都没有、退出码 0」地结束，看起来像什么都没发生。
   排查方法是直接调 Service API 并把 `uncaughtException` 打出来
   （本仓库历史上就是这么定位的）。现在 `tools/build-h5.js` 里显式设置了它。

2. **CLI 要求 `src/` 布局。**
   把 `UNI_INPUT_DIR` 直接指向仓库根目录（HBuilderX 布局）会报「缺少平台 h5 插件」。
   所以脚本把源码拷进 `tools/uni-cli/.build/src` 再编译，仓库结构保持不变。

3. **两个包没被声明成依赖**：`@dcloudio/uni-cli-i18n`、`@dcloudio/uni-migration`
   是运行时 `require` 的，不装就报 `MODULE_NOT_FOUND`（同样是静默失败）。

4. **APK 条目名这件事，别交给 aapt/aapt2，也别用 Python 校验。**（最坑的一条，前后翻车两次）

   - `aapt add` 会把**传给它的路径原样**当条目名。传 `classes.dex` 的绝对路径，
     APK 里就会出现一条叫 `C:\Users\...\classes.dex` 的条目，根目录下根本没有 dex——
     签名正常、体积正常、**装上去直接闪退**。
   - `aapt2 link -A assets` 在 Windows 上写的条目名用的是平台分隔符，
     实际存成 `assets\www\index.html`。Android 的 AssetManager 按
     `assets/www/index.html` 精确查找，找不到就 `net::ERR_FILE_NOT_FOUND`，
     打开 App 就是一张"网页无法打开"的错误页。
   - 更坑的是**校验手段本身**：Python 的 `zipfile` 在 Windows 上会把读到的 `\`
     规范化成 `/`（`ZipInfo.__init__` 里有 `filename.replace(os.sep, '/')`），
     所以用它复核会显示"一切正常"，把人骗过去。而 PowerShell 的
     `ZipArchiveEntry.FullName` 和 `jar tf` 显示的才是真名（反斜杠）。

   现在的做法：assets 和 dex 都不再交给 aapt，改成 `tools/zip.js` 里自己实现的
   ZIP 追加（条目名强制正斜杠，且不重压缩已有条目，`resources.arsc` 的 stored 状态不受影响），
   构建最后用**自己写的中央目录解析器**读原始字节做条目自检：出现反斜杠、缺关键条目、
   `resources.arsc` 被压缩，都直接报错退出；还会把 APK 里的 `index.html` 和轨迹页 chunk
   抽出来跟磁盘产物**逐字节比对**。

5. **Windows 上不能直接 spawn `.bat`/`.cmd`**（Node 18.20/20.12 起会抛 `EINVAL`）。
   所以 d8 和 apksigner 都改成 `java -cp <build-tools>/lib/xxx.jar <主类>` 直接调 jar。

6. **`aapt2 link -R` 需要 `--auto-add-overlay`**，否则报
   "resource string/app_name does not override an existing resource"。

7. **`resources.arsc` 必须不压缩。** targetSdk ≥ 30 时 Android 要求它 stored + 4 字节对齐，
   否则装不上。这里 `resources.arsc` 由 aapt2 直接产出（本来就是 stored），
   我们只是往里追加 dex 和 assets，没有重新压缩，最后 `zipalign -f -p 4` 对齐。

8. **Canvas 字号在 uni-app 里的坑**（和打包无关，但也是这轮发现的）：
   `uni` 的 `CanvasContext` 里 `setFontSize()` 才是真正生效的接口，
   `ctx.font` 只是个普通属性。详见 `common/trackCard.js` 里 `applyFont` 的注释。

---

## 验证到什么程度

已经验证的：

- 构建链路端到端可复现（`build-h5.js --install` → `build-apk.js` 全绿）
- APK 签名：`apksigner verify` 通过 **v1 + v2 + v3** 三种方案
- `aapt2 dump badging`：包名 `com.fakekeep.app`、minSdk 21、targetSdk 34、
  启动 Activity `com.fakekeep.app.MainActivity`、五种密度的图标都在
- APK 条目自检（读 ZIP 中央目录的**原始字节**，不经任何库规范化）：
  `AndroidManifest.xml` / `resources.arsc`(未压缩) / `classes.dex`(根目录) /
  `assets/www/index.html` 齐全，且**所有条目名都是正斜杠**
- APK 里的 `index.html` 与轨迹页 chunk 已抽出并与磁盘产物**逐字节比对一致**
- dex 里包含 `file:///android_asset/www/index.html`、`onShowFileChooser`、
  `saveBitmapToGallery`、`dumpAssetTree` 等关键符号
- **APK 里那份 H5 产物被真的跑起来看过**：用无头 Chrome 加载同一份产物，
  逐页截图 + 导出 canvas 出的分享卡（`common/trackCard.js` 的字号 bug 就是这么发现的）

**没有验证的**：APK 没有在真机或模拟器上安装运行过。
本机虽然装了 Android SDK 和 AVD，但模拟器一启动就崩溃
（`emulator.exe` 无任何输出即退出，`VirtualizationFirmwareEnabled=False`），
所以「WebView 外壳 + 页面交互」这一段只有静态检查和同源代码的浏览器验证，
没有真机运行证据。

> 历史教训：`err_file_not_found` 那次就是**只靠静态检查、而且校验工具本身有偏差**
> 造成的漏网。现在自检直接读原始字节，并且比对 APK 内文件的字节内容，
> 但真机验证仍然是最后一道必须由人来走的关卡。
> 如果装到手机上还有问题，先跑 `adb logcat -s FakeKeep`：
> 外壳在页面加载失败时会自动把 `assets/` 的真实目录结构打到日志里，
> 一眼就能看出是不是路径/资源问题。

---

## 正式发布怎么做

如果是要出正式包，用 HBuilderX：

1. HBuilderX 打开本仓库 → 发行 → 原生 App 云打包
2. 用自己的 `.jks` 签名证书（不要用仓库里生成的 demo 证书）
3. `manifest.json` 里把 appid、图标、启动图配好

本仓库的 `tools/build-h5.js` 产出的 H5 目录也可以直接部署成网页版
（`unpackage/dist/build/h5` 是一个纯静态站点，扔到任何静态托管都能跑）。
