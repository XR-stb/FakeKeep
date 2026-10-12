# FakeKeep

[![Build APK](https://github.com/XR-stb/FakeKeep/actions/workflows/apk.yml/badge.svg)](https://github.com/XR-stb/FakeKeep/actions/workflows/apk.yml)

Keep 风格的跑步记录生成器（uni-app / Vue2）。可以自定义跑步主页数据，也可以直接生成一张
**运动轨迹分享卡**——改完参数点保存，图片进相册。

> ⚠️ **仅供学习与娱乐**。请勿用来伪造证明材料、骗取活动奖励或做任何欺骗他人的事情。
> 内置的"地图"是程序生成的示意图形，不是真实地理数据。

![主页](https://user-images.githubusercontent.com/56108982/233516469-204d8844-c083-4349-892d-11422d733312.png)

---

## 功能

### 1. 跑步主页（`pages/index`）

- 累计跑步距离、跑步等级、跑力值、最远距离、本周排名，点击即可修改
- 点头像新增一条跑步记录（轨迹图、日期、时长、配速、卡路里随机生成且互相自洽）
- 记录列表、头像自定义、数据本地持久化

### 2. 轨迹截图页（`pages/track`）—— 对应 [Issue #1](https://github.com/XR-stb/FakeKeep/issues/1)

一张可直接保存到相册的运动轨迹分享卡，**所有参数和背景地图都能改**：

| 能力 | 说明 |
| --- | --- |
| 参数全可改 | 距离、用时、平均配速、卡路里、平均心率、步频、步数、运动类型、地点、日期、时间 |
| 智能联动 | 改「距离 + 用时」自动算配速；改配速反推用时；步数 = 步频 × 时长；卡路里按体重估算。手动改过的字段会标记为"自动"关闭，不再被覆盖 |
| 轨迹可换 | 7 种轨迹形状（操场环线 / 城市环线 / 街区矩形 / 折返 / 蜿蜒 / 8 字 / 往复锯齿），支持"换一条"重新生成 |
| 轨迹配色 | 6 种配色方案 |
| 背景可换 | 6 张内置示意地图 + 3 种纯色底 + **从相册选任意照片当底图** |
| 视觉开关 | 起终点标记、底部水印 |
| 保存 | App / 小程序一键存相册；H5 生成长按可保存的图片 |

轨迹是**矢量绘制**在底图上的（不是贴一张现成的图），所以换成任意照片底图后轨迹依然清晰，
并且自带"深色外描边 + 白色内描边"的双层 casing，明暗底图上都看得清。

### 3. 离线工具链（`tools/`）

不需要 HBuilderX 也能验证这个项目：

```bash
npm install
npm run verify      # 静态检查 + 单元测试
npm run preview     # 渲染排版预览图到 tools/out/
npm run gen:maps    # 重新生成 static/maps/*.png 背景地图
```

### 4. 自己打一个 APK（不需要 HBuilderX）

```bash
node tools/build-h5.js --install   # 编译 H5（首次会装编译依赖）
node tools/build-apk.js            # 打成可安装的 APK
```

产物 `unpackage/release/apk/FakeKeep-1.1.0-webview.apk`（约 2 MB），
`adb install -r` 即可。原理是「uni-app 编译出的 H5 + 一个原生 WebView 外壳」，
外壳额外补上了选图片（`onShowFileChooser`）和长按存相册（MediaStore）两处原生能力。

这条路胜在**无需 DCloud 账号、可复现、十几秒出包**；正式上架仍建议用 HBuilderX 云打包，
两者用的是同一份源码。完整说明、环境要求和踩坑记录见
[`docs/打包APK说明.md`](docs/打包APK说明.md)。

CI 里也已经接上（`.github/workflows/apk.yml`）：每次推 `main` / 提 PR 会自动跑
静态检查 + 单元测试，然后编译 H5 并打出 APK，在 Actions 的 Artifacts 里可以直接下载
`FakeKeep-APK` 和 `FakeKeep-H5`。

---

## 目录结构

```
FakeKeep/
├── App.vue                     应用入口（只保留生命周期，不再做跳转）
├── main.js                     Vue2 挂载入口
├── pages.json                  页面注册（init -> guide -> index -> track）
├── manifest.json               应用配置（已补充相册写入权限）
├── pages/
│   ├── init/init.vue           启动中转页：判断进引导页还是首页
│   ├── guide/guide.vue         首次启动的引导轮播
│   ├── index/index.vue         跑步主页
│   └── track/track.vue         轨迹截图页（Issue #1）
├── common/                     纯逻辑模块（uni-app 与 Node 都能用）
│   ├── format.js               数值/时间/配速解析与换算
│   ├── route.js                轨迹生成（7 种形状，同 seed 结果可复现）
│   ├── backgrounds.js          内置地图 / 纯色底 / 轨迹配色清单
│   ├── trackCard.js            ★ 轨迹卡 canvas 渲染器 + 全部布局常量
│   ├── trackState.js           轨迹页的数据状态与联动规则
│   ├── launch.js               首次启动路由判断
│   └── getdateTime.js          日期时间格式化
├── static/
│   ├── maps/map1..6.png        程序生成的示意地图（750×1120）
│   └── path/path1..7.png       跑步主页用的轨迹缩略图
└── tools/                      离线工具（不参与 App 运行）
    ├── raster.js               极简软件光栅化 + PNG 编码
    ├── map-art.js              6 种示意地图的画法
    ├── gen-maps.js             生成 static/maps/*.png
    ├── gen-icon.js             生成 Android 启动图标
    ├── preview.js              用 canvas 桩渲染排版预览图并做排版体检
    ├── test-core.js            41 项单元测试
    ├── check.js                项目静态检查
    ├── build-h5.js             用 uni-app CLI 编译出 H5 产物
    ├── build-apk.js            把 H5 产物 + WebView 外壳打成可安装的 APK
    ├── uni-cli/                uni-app CLI 构建壳（只放工具链，不放源码）
    └── android-webview/        APK 原生外壳（一个 Activity + manifest + 图标）
└── docs/
    ├── ISSUE-1-轨迹截图页.md    Issue #1 的处理说明
    └── 打包APK说明.md           不用 HBuilderX 自己出 APK 的完整说明
```

**设计原则**：页面只负责交互和调用 uni API，所有能出错的算法都放在 `common/` 下的纯模块里，
这样它们就能被 Node 直接测试，不必上真机反复手点。

---

## 快速开始

### 方式一：HBuilderX（推荐，也是原项目的方式）

1. 安装 [HBuilderX](https://www.dcloud.io/hbuilderx.html)（App 开发版）
2. `git clone https://github.com/XR-stb/FakeKeep.git`，然后「文件 → 打开目录」选中项目
3. 运行 → 运行到浏览器 / 运行到手机或模拟器
4. 真机打包：发行 → 原生 App 云打包

### 方式二：只跑校验与预览（不需要 HBuilderX）

```bash
git clone https://github.com/XR-stb/FakeKeep.git
cd FakeKeep
npm install
npm run verify
```

---

## 使用轨迹截图页

1. 首页中部点击绿色卡片 **「轨迹截图」**
2. 上方就是最终截图（所见即所得），下方任选一项修改
3. 「轨迹」里换形状和颜色，「背景地图」里左右滑动换底图，或点「选照片」用自己的照片
4. 右上角 **保存** → App / 小程序直接进相册；H5 会弹出大图，长按保存

几个细节：

- **改了不会变？** 卡路里 / 步数默认是自动算的，手动改一次后那个字段旁的「自动」标记会消失，
  之后就以你填的为准。想恢复自动联动，点「随机生成一条记录」或「恢复默认」。
- **输入格式很宽松**：用时可以写 `00:32:15`、`32:15`、`32分15秒`；配速可以写 `5'30"`、`5:30`、`5.5`；
  距离写 `5.2公里` 也行，失焦时会自动规整。
- **数据会记住**：填过的内容存在本地，下次进来还在。

---

## 关于内置地图

`static/maps/map1..6.png` 是用 `tools/gen-maps.js` **程序生成**的示意地图：路网是样条曲线、
街区里是随机矩形建筑、水系和绿地是多边形团块，**不包含任何真实地理数据**，
因此可以随仓库自由分发，也不涉及地图服务商的版权与配额问题。

想换风格就改 `tools/map-art.js` 里的 `STYLES`，然后：

```bash
npm run gen:maps
```

生成结果与 `common/backgrounds.js` 里的 `BUILTIN_MAPS` 一一对应（新增地图记得两处都加）。

---

## 这次更新做了什么

### 实现 Issue #1：把"轨迹截图页面"做出来

Issue #1 原文（xy3xy3，2024-04-11）：

> 有没有考虑在在轨迹截图页面做个fake的，可以改各个参数和背景跑步图

对照实现：

| Issue 诉求 | 实现 |
| --- | --- |
| 轨迹截图页面 | 新增 `pages/track/track.vue`，首页新增入口卡片 |
| 可以改各个参数 | 10 个可编辑项 + 7 种轨迹 + 6 种配色 + 2 个显示开关，全部实时预览 |
| 可以改背景跑步图 | 6 张内置示意地图 + 3 种纯色底 + 相册自选照片，轨迹矢量绘制因此不会被底图绑架 |

详见 [`docs/ISSUE-1-轨迹截图页.md`](docs/ISSUE-1-轨迹截图页.md)。

### 顺手修掉的问题

| 问题 | 说明 |
| --- | --- |
| `run_val` 不是响应式的 | 跑力值在 `onLoad` 里赋值，但没在 `data` 里声明，Vue2 下界面不会刷新（新增的静态检查会直接报出来） |
| 页面里用了 `onLaunch` | `guide.vue` 里写了 `onLaunch` 做跳转——那是 `App.vue` 的生命周期，页面里不生效。改为独立的启动中转页 `pages/init/init` |
| `App.vue` 在 `onLaunch` 里 `redirectTo` | 此时页面栈还没准备好，跳转不稳定；改由启动页在 `onLoad` 里 `reLaunch` |
| `hideDiv()` 只关一个弹窗 | 四个弹窗共用一层遮罩，点遮罩后其余弹窗还开着。改为 `closeAllPopups()` |
| 弹窗不校验输入 | 距离/等级/最远距离都能存进 `NaN`，现在会解析 + 规整 + 提示 |
| 轨迹编号靠下标硬取 | `this.items[0].path_url[22]` 一改路径就崩，改为正则匹配 `path(\d+).png` |
| 日期默认值不可靠 | `timeStr.substr(5, 6)` 取日期，改用 `splitDateTime` |
| `getdateTime.js` 连续 `replace` | 六次 `String.replace` 会互相干扰，改成正则一次性替换，并补了单元测试 |
| 记录列表无限增长 | 限制最多 60 条，并提供"清空" |
| 头像临时路径会失效 | 改用 `uni.saveFile` 落到本地永久目录 |
| `h1/h2/h3/h4/p` 标签 | 这些不是 uni-app 组件，小程序端不渲染。全部换成 `text` / `view` + class |
| 保存到相册缺权限 | `manifest.json` 补上 `WRITE_EXTERNAL_STORAGE` / `READ_EXTERNAL_STORAGE` |
| 仓库里塞了 23 MB 构建产物 | 新增 `.gitignore`，`unpackage/` 与两个 APK 不再跟踪（**本地文件不会被删**） |
| README 的 `npm run` 是错的 | 重写构建说明 |

### 又发现并修掉的一个"看不见"的 bug

用无头 Chrome 把 H5 产物真正渲染出来之后，发现轨迹卡上的文字字号是错的：
「公里」跟距离数字一样大，三列数值跟标签一样小。

根因在 `common/trackCard.js` 的 `applyFont`：它原本用「赋值 `ctx.font` 再读回来」来判断
平台是否支持粗体。但 uni-app 的 `CanvasContext` 里 **`setFontSize()` 才是真正生效的接口，
`ctx.font` 只是个普通属性**——于是当 `Math.round(字号)` 恰好是字号字符串的子串时会误判成功、
跳过 `setFontSize`，这段文字就沿用了上一段的字号。哪一段中招完全取决于字号数值，
所以肉眼看像是"随机"的排版错乱。

现在改成：有 `setFontSize` 就只用它（粗体统一用叠加模拟，各端一致），
没有它（原生 2D 上下文，例如 WebView 里直接跑 H5）才用 `ctx.font`。
并补了回归测试，逐条钉死每个元素的字号。

这个 bug 在真机、小程序上同样存在——只做单元测试和静态检查是发现不了的，
必须真的把图渲染出来看。这也是为什么这个仓库现在带上了浏览器渲染验证。

### 新增的离线工具链

- `tools/test-core.js`：41 项单元测试，覆盖参数解析、配速换算、轨迹生成的不变式
  （点都在 [0,1] 内、同 seed 可复现、相邻点不突变、轨迹不越界）、布局常量自洽、
  绘制指令无 `NaN`、状态联动规则
- `tools/check.js`：解析 `pages.json` / `manifest.json`、校验页面文件存在、
  校验 `navigateTo` 等跳转的目标都已注册、编译 `<template>`、检查 `<script>` 语法、
  检查模板引用的字段是否真的在 `data` 里声明过
- `tools/preview.js`：自己实现一个 CanvasContext 桩，把真实的绘制逻辑跑一遍，
  输出排版预览图并自动体检（文字越界 / 相互重叠 / 数值列溢出）

`npm run verify` 一条命令跑完前两项；`npm run preview` 看排版。
