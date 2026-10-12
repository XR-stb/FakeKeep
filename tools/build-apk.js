/**
 * 把 uni-app 编译出来的 H5 产物打成可以直接安装的 Android APK
 *
 * 用法：
 *   node tools/build-apk.js --www <H5 产物目录> [--out <输出 apk>]
 *
 * 为什么不用 Gradle：
 *   这个外壳只用到 Android 框架 API（没有 AndroidX / 三方库），
 *   所以 aapt2 + javac + d8 + zipalign + apksigner 这一条流水线就够了，
 *   不需要下载 Gradle 和 Maven 依赖，构建只要十几秒。
 *
 * 依赖（自动探测，也可以用环境变量指定）：
 *   ANDROID_HOME / ANDROID_SDK_ROOT  或 %LOCALAPPDATA%\Android\Sdk
 *   JAVA_HOME                       或 Android Studio 自带的 jbr / Program Files\Android\openjdk
 */

'use strict';

var fs = require('fs');
var path = require('path');
var cp = require('child_process');
var zip = require('./zip.js');

var ROOT = path.join(__dirname, '..');
var SHELL_DIR = path.join(__dirname, 'android-webview');
var BUILD_DIR = path.join(ROOT, 'unpackage', 'apk-build');

var VERSION_CODE = '110';
var VERSION_NAME = '1.1.0';
var MIN_SDK = '21';
var TARGET_SDK = '34';
// 签名参数：想用正式证书就从环境变量覆盖（CI 里从 Secrets 注入），
// 不配的话现场生成一个 demo 证书，仅供安装测试
var KEYSTORE_PASS = process.env.FAKEKEEP_KS_PASS || 'fakekeep';
var KEY_ALIAS = process.env.FAKEKEEP_KEY_ALIAS || 'fakekeep';
var KEY_PASS = process.env.FAKEKEEP_KEY_PASS || KEYSTORE_PASS;

/* ------------------------------ 参数 ------------------------------ */

function parseArgs(argv) {
	var out = { www: null, out: null, keystore: null, keep: false };
	for (var i = 2; i < argv.length; i++) {
		var a = argv[i];
		if (a === '--www') out.www = argv[++i];
		else if (a === '--out') out.out = argv[++i];
		else if (a === '--keystore') out.keystore = argv[++i];
		else if (a === '--keep') out.keep = true;
		else if (a === '-h' || a === '--help') out.help = true;
	}
	return out;
}

var args = parseArgs(process.argv);

if (args.help) {
	console.log('用法: node tools/build-apk.js --www <H5产物目录> [--out <apk>] [--keystore <jks>]');
	process.exit(0);
}

/* --------------------------- 工具链探测 --------------------------- */

function firstExisting(list) {
	for (var i = 0; i < list.length; i++) {
		if (list[i] && fs.existsSync(list[i])) return list[i];
	}
	return null;
}

/** 按版本号从高到低排列目录名（如 35.0.1 / android-34） */
function sortDirsDesc(dirs) {
	return dirs.slice().sort(function (a, b) {
		var pa = a.split('.').map(Number);
		var pb = b.split('.').map(Number);
		for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
			var d = (pb[i] || 0) - (pa[i] || 0);
			if (d) return d;
		}
		return 0;
	});
}

function findSdk() {
	var candidates = [
		process.env.ANDROID_HOME,
		process.env.ANDROID_SDK_ROOT,
		process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : null,
		process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Local', 'Android', 'Sdk') : null,
		'C:\\Android\\Sdk'
	];
	var sdk = firstExisting(candidates);
	if (!sdk) return null;

	var btRoot = path.join(sdk, 'build-tools');
	if (!fs.existsSync(btRoot)) return null;
	var versions = sortDirsDesc(fs.readdirSync(btRoot));
	for (var i = 0; i < versions.length; i++) {
		var bt = path.join(btRoot, versions[i]);
		var exe = function (n) {
			return firstExisting([path.join(bt, n + '.exe'), path.join(bt, n + '.bat'), path.join(bt, n)]);
		};
		var tools = { aapt2: exe('aapt2'), zipalign: exe('zipalign'), apksigner: exe('apksigner') };
		if (tools.aapt2 && tools.zipalign && tools.apksigner) {
			var platRoot = path.join(sdk, 'platforms');
			var androidJar = null;
			if (fs.existsSync(platRoot)) {
				var plats = sortDirsDesc(fs.readdirSync(platRoot).filter(function (d) {
					return /^android-\d+$/.test(d);
				}));
				for (var j = 0; j < plats.length; j++) {
					var jar = path.join(platRoot, plats[j], 'android.jar');
					if (fs.existsSync(jar)) {
						androidJar = jar;
						break;
					}
				}
			}
			if (androidJar) {
				var lib = path.join(bt, 'lib');
				return {
					sdk: sdk,
					buildTools: bt,
					buildToolsVersion: versions[i],
					androidJar: androidJar,
					aapt2: tools.aapt2,
					zipalign: tools.zipalign,
					apksigner: tools.apksigner,
					aapt: exe('aapt'),
					d8: exe('d8'),
					// 直接调 jar 比调 .bat 稳：Windows 上 Node 不能直接 spawn .bat
					d8Jar: firstExisting([path.join(lib, 'd8.jar')]),
					apksignerJar: firstExisting([path.join(lib, 'apksigner.jar')])
				};
			}
		}
	}
	return null;
}

function findJdk() {
	var candidates = [process.env.JAVA_HOME];
	if (process.env['ProgramFiles']) {
		candidates.push(path.join(process.env['ProgramFiles'], 'Android', 'Android Studio', 'jbr'));
		candidates.push(path.join(process.env['ProgramFiles'], 'Android', 'openjdk'));
		candidates.push(path.join(process.env['ProgramFiles'], 'Java'));
		candidates.push(path.join(process.env['ProgramFiles'], 'Eclipse Adoptium'));
	}
	// openjdk 目录下有时还会嵌一层 jdk-xx
	var expanded = [];
	candidates.forEach(function (c) {
		if (!c) return;
		expanded.push(c);
		if (fs.existsSync(c)) {
			try {
				fs.readdirSync(c).forEach(function (name) {
					if (/^jdk/i.test(name)) expanded.push(path.join(c, name));
				});
			} catch (e) { /* ignore */ }
		}
	});
	for (var i = 0; i < expanded.length; i++) {
		var home = expanded[i];
		if (!home) continue;
		var java = path.join(home, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
		if (fs.existsSync(java)) return home;
	}
	return null;
}

function tool(jdkHome, name) {
	var p = path.join(jdkHome, 'bin', name + (process.platform === 'win32' ? '.exe' : ''));
	return fs.existsSync(p) ? p : null;
}

/* ------------------------------ 执行 ------------------------------ */

/**
 * 给 cmd.exe 用的参数加引号。
 * Node 18.20/20.12 起，出于安全考虑 spawnSync 不能再直接执行 .bat/.cmd
 * （会抛 EINVAL），必须交给 cmd.exe /c，于是这里得自己处理引号。
 */
function winQuote(arg) {
	var s = String(arg);
	if (s === '') return '""';
	if (!/[\s"&|<>^()]/.test(s)) return s;
	return '"' + s.replace(/"/g, '\\"') + '"';
}

function run(exe, cmdArgs, opts) {
	opts = opts || {};
	console.log('\n$ ' + path.basename(exe) + ' ' + cmdArgs.join(' ').slice(0, 220));
	var spawnOpts = {
		cwd: opts.cwd || BUILD_DIR,
		stdio: 'inherit',
		env: opts.env || process.env
	};
	var res;
	if (/\.(bat|cmd)$/i.test(exe)) {
		// Windows 上 Node 不允许直接 spawn .bat（EINVAL），交给 shell 执行
		var line = winQuote(exe) + ' ' + cmdArgs.map(winQuote).join(' ');
		res = cp.spawnSync(line, Object.assign({ shell: true }, spawnOpts));
	} else {
		res = cp.spawnSync(exe, cmdArgs, spawnOpts);
	}
	if (res.error) throw res.error;
	if (res.status !== 0) {
		throw new Error(path.basename(exe) + ' 失败，退出码 ' + res.status);
	}
}

/**
 * 构建后自检：直接解析 ZIP 中央目录，用**未经规范化的原始条目名**比对。
 *
 * 这一步是被两次翻车教出来的：
 *   1. `aapt add` 把给它的绝对路径当条目名 -> APK 根目录没有 classes.dex -> 装上闪退
 *   2. `aapt2 link -A` 在 Windows 上把 assets 写成 `assets\www\index.html`（反斜杠）
 *      -> Android 的 AssetManager 找不到 -> 打开就是 ERR_FILE_NOT_FOUND
 * 而 Python 的 zipfile 在 Windows 上会把 `\` 规范化成 `/`，用它校验会被骗过，
 * 所以这里必须自己读原始字节。
 */
function assertApkLayout(apk, WWW_DIR) {
	var info = zip.readEntries(fs.readFileSync(apk));
	var names = info.entries.map(function (e) { return e.name; });

	console.log('\n条目自检: 共 ' + names.length + ' 项');

	var wrongSep = names.filter(function (n) { return n.indexOf('\\') !== -1; });
	if (wrongSep.length) {
		console.error('有 ' + wrongSep.length + ' 个条目名用了反斜杠，Android 会找不到这些资源：');
		wrongSep.slice(0, 5).forEach(function (n) { console.error('   ' + JSON.stringify(n)); });
		process.exit(6);
	}

	var required = ['AndroidManifest.xml', 'resources.arsc', 'classes.dex', 'assets/www/index.html'];
	var missing = required.filter(function (n) { return names.indexOf(n) === -1; });
	if (missing.length) {
		console.error('APK 缺少必需条目: ' + missing.join(', '));
		console.error('（classes.dex 必须在 APK 根目录，否则安装后无法运行）');
		process.exit(6);
	}

	var arsc = info.entries.filter(function (e) { return e.name === 'resources.arsc'; })[0];
	if (arsc.method !== 0) {
		console.error('resources.arsc 必须是未压缩(stored)的，否则 Android 11+ 装不上');
		process.exit(6);
	}

	var assetCount = names.filter(function (n) { return n.indexOf('assets/www/') === 0; }).length;
	console.log('条目自检通过: ' + required.join(' / '));
	console.log('            assets/www 下 ' + assetCount + ' 个文件，resources.arsc 未压缩，条目名全为正斜杠');

	// 再从 APK 里把入口页和轨迹页 chunk 抽出来，跟磁盘上的产物逐字节比对。
	// 这一步证明"Android 从这个 APK 里读到的字节"就是我们编译出来的那份页面。
	var apkBuf = fs.readFileSync(apk);
	var checks = [
		['assets/www/index.html', path.join(WWW_DIR, 'index.html')]
	];
	var trackChunk = fs.readdirSync(path.join(WWW_DIR, 'static', 'js')).filter(function (f) {
		return /^pages-track-track\..*\.js$/.test(f);
	})[0];
	if (trackChunk) {
		checks.push(['assets/www/static/js/' + trackChunk, path.join(WWW_DIR, 'static', 'js', trackChunk)]);
	}
	checks.forEach(function (pair) {
		var inside = zip.readEntry(apkBuf, pair[0]);
		var outside = fs.readFileSync(pair[1]);
		if (!inside) {
			console.error('APK 里读不出 ' + pair[0]);
			process.exit(6);
		}
		if (!inside.equals(outside)) {
			console.error('APK 里的 ' + pair[0] + ' 与磁盘产物不一致（' + inside.length + ' vs ' + outside.length + ' 字节）');
			process.exit(6);
		}
		console.log('            已校验 ' + pair[0] + ' 与源文件逐字节一致 (' + inside.length + ' 字节)');
	});
}

function copyDir(src, dest) {
	fs.mkdirSync(dest, { recursive: true });
	fs.readdirSync(src, { withFileTypes: true }).forEach(function (e) {
		var s = path.join(src, e.name);
		var d = path.join(dest, e.name);
		if (e.isDirectory()) copyDir(s, d);
		else fs.copyFileSync(s, d);
	});
}

function listFiles(dir, filter, out) {
	out = out || [];
	fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
		var p = path.join(dir, e.name);
		if (e.isDirectory()) listFiles(p, filter, out);
		else if (!filter || filter(p)) out.push(p);
	});
	return out;
}

function dirSize(dir) {
	var total = 0;
	listFiles(dir, null, []).forEach(function (f) {
		try { total += fs.statSync(f).size; } catch (e) { /* ignore */ }
	});
	return total;
}

/* ------------------------------ 主流程 ------------------------------ */

function main() {
	// 1. 找到 H5 产物
	var www = args.www ? path.resolve(args.www) : null;
	if (!www) {
		var guesses = [
			path.join(ROOT, 'unpackage', 'dist', 'build', 'h5'),
			path.join(ROOT, 'dist', 'build', 'h5'),
			path.join(ROOT, 'unpackage', 'dist', 'build', 'web')
		];
		www = firstExisting(guesses);
	}
	if (!www || !fs.existsSync(path.join(www, 'index.html'))) {
		console.error('找不到 H5 产物（需要目录里有 index.html）。请先构建 H5，再用 --www 指定目录。');
		console.error('参考 docs/打包APK说明.md');
		process.exit(2);
	}
	console.log('H5 产物: ' + www + '  (' + (dirSize(www) / 1024 / 1024).toFixed(2) + ' MB)');

	// 2. 工具链
	var sdk = findSdk();
	if (!sdk) {
		console.error('找不到可用的 Android SDK（需要 build-tools 的 aapt2/zipalign/apksigner 和 platforms/android-XX/android.jar）。');
		console.error('请设置 ANDROID_HOME，或安装 Android SDK 的 build-tools 与 platform。');
		process.exit(3);
	}
	var jdk = findJdk();
	if (!jdk) {
		console.error('找不到 JDK（需要 javac / jar / keytool）。请设置 JAVA_HOME。');
		process.exit(4);
	}
	console.log('Android SDK : ' + sdk.sdk + '  (build-tools ' + sdk.buildToolsVersion + ')');
	console.log('android.jar : ' + sdk.androidJar);
	console.log('JDK         : ' + jdk);

	var javac = tool(jdk, 'javac');
	var jar = tool(jdk, 'jar');
	var keytool = tool(jdk, 'keytool');
	var javaExe = tool(jdk, 'java');
	['javac', 'jar', 'keytool', 'java'].forEach(function (n) {
		if (!tool(jdk, n)) {
			console.error('JDK 里缺少 ' + n);
			process.exit(4);
		}
	});

	/** 优先用 java -cp <tool>.jar 调工具，回退到官方 .bat 包装 */
	function runTool(toolArgs, jarPath, mainClass, batPath, opts) {
		if (jarPath && javaExe) {
			run(javaExe, ['-cp', jarPath, mainClass].concat(toolArgs), opts);
		} else if (batPath) {
			run(batPath, toolArgs, opts);
		} else {
			throw new Error('既没有 ' + mainClass + ' 对应的 jar，也没有可用的包装脚本');
		}
	}

	// 3. 准备中间目录
	fs.rmSync(BUILD_DIR, { recursive: true, force: true });
	var assetsWww = path.join(BUILD_DIR, 'assets', 'www');
	copyDir(www, assetsWww);
	fs.mkdirSync(path.join(BUILD_DIR, 'classes'), { recursive: true });
	fs.mkdirSync(path.join(BUILD_DIR, 'dex'), { recursive: true });

	// 4. 编译资源
	run(sdk.aapt2, ['compile', '--dir', path.join(SHELL_DIR, 'res'), '-o', path.join(BUILD_DIR, 'res.zip')]);

	// 5. 链接资源，得到不含 assets / dex 的 APK
	//    注意：这里刻意不用 `-A assets` —— 见 tools/zip.js 顶部说明，
	//    aapt2 在 Windows 上会把 assets 的条目名写成反斜杠。
	run(sdk.aapt2, [
		'link',
		'-o', path.join(BUILD_DIR, 'base.apk'),
		'-I', sdk.androidJar,
		'--manifest', path.join(SHELL_DIR, 'AndroidManifest.xml'),
		'-R', path.join(BUILD_DIR, 'res.zip'),
		'--auto-add-overlay',
		'--min-sdk-version', MIN_SDK,
		'--target-sdk-version', TARGET_SDK,
		'--version-code', VERSION_CODE,
		'--version-name', VERSION_NAME
	]);

	// 6. 编译 Java
	var javaFiles = listFiles(path.join(SHELL_DIR, 'java'), function (f) { return /\.java$/.test(f); });
	run(javac, [
		'-encoding', 'UTF-8',
		'-source', '8',
		'-target', '8',
		'-nowarn',
		'-cp', sdk.androidJar,
		'-d', path.join(BUILD_DIR, 'classes')
	].concat(javaFiles));

	// 7. 转成 dex
	var classJar = path.join(BUILD_DIR, 'classes.jar');
	run(jar, ['cf', classJar, '-C', path.join(BUILD_DIR, 'classes'), '.']);
	runTool(
		['--lib', sdk.androidJar, '--min-api', MIN_SDK, '--output', path.join(BUILD_DIR, 'dex'), classJar],
		sdk.d8Jar,
		'com.android.tools.r8.D8',
		sdk.d8
	);

	// 8. 用 Node 自己把 classes.dex 和 assets 追加进 APK
	//    条目名完全由我们控制（正斜杠），不再受 aapt / aapt2 在 Windows 上的分隔符影响。
	//    追加不会重压缩已有条目，所以 resources.arsc 的 stored 状态保持不变。
	var dexFile = path.join(BUILD_DIR, 'dex', 'classes.dex');
	if (!fs.existsSync(dexFile)) {
		console.error('d8 没有产出 classes.dex');
		process.exit(5);
	}

	var added = [{ name: 'classes.dex', data: fs.readFileSync(dexFile), store: true }];
	listFiles(assetsWww, null, []).forEach(function (f) {
		var rel = path.relative(assetsWww, f).split(path.sep).join('/');
		added.push({ name: 'assets/www/' + rel, data: fs.readFileSync(f), store: false });
	});

	var mergedApk = path.join(BUILD_DIR, 'merged.apk');
	fs.writeFileSync(mergedApk,
		zip.appendEntries(fs.readFileSync(path.join(BUILD_DIR, 'base.apk')), added));
	console.log('\n已追加 ' + added.length + ' 个条目：classes.dex + assets/www 下 ' +
		(added.length - 1) + ' 个文件');

	// 9. 对齐
	run(sdk.zipalign, ['-f', '-p', '4', mergedApk, path.join(BUILD_DIR, 'aligned.apk')]);

	// 10. 签名（没有 keystore 就现场生成一个 demo keystore）
	var keystore = args.keystore
		? path.resolve(args.keystore)
		: path.join(BUILD_DIR, 'fakekeep-demo.jks');
	if (!fs.existsSync(keystore)) {
		console.log('\n生成 demo 签名证书（仅供本地安装测试，不要用于上架）');
		run(keytool, [
			'-genkeypair', '-v',
			'-keystore', keystore,
			'-alias', KEY_ALIAS,
			'-keyalg', 'RSA',
			'-keysize', '2048',
			'-validity', '10000',
			'-storepass', KEYSTORE_PASS,
			'-keypass', KEY_PASS,
			'-dname', 'CN=FakeKeep,OU=Demo,O=FakeKeep,C=CN'
		], { cwd: BUILD_DIR });
	}

	var outApk = args.out
		? path.resolve(args.out)
		: path.join(ROOT, 'unpackage', 'release', 'apk', 'FakeKeep-' + VERSION_NAME + '-webview.apk');
	fs.mkdirSync(path.dirname(outApk), { recursive: true });

	// apksigner 直接走 jar，不依赖 JAVA_HOME
	runTool([
		'sign',
		'--ks', keystore,
		'--ks-key-alias', KEY_ALIAS,
		'--ks-pass', 'pass:' + KEYSTORE_PASS,
		'--key-pass', 'pass:' + KEY_PASS,
		'--v1-signing-enabled', 'true',
		'--v2-signing-enabled', 'true',
		'--v3-signing-enabled', 'true',
		'--out', outApk,
		path.join(BUILD_DIR, 'aligned.apk')
	], sdk.apksignerJar, 'com.android.apksigner.ApkSignerTool', sdk.apksigner);

	// 11. 校验
	runTool(['verify', '--verbose', outApk],
		sdk.apksignerJar, 'com.android.apksigner.ApkSignerTool', sdk.apksigner);
	run(sdk.aapt2, ['dump', 'badging', outApk]);
	assertApkLayout(outApk, www);

	var size = fs.statSync(outApk).size;
	console.log('\n' + '='.repeat(60));
	console.log('APK  : ' + outApk);
	console.log('大小 : ' + (size / 1024 / 1024).toFixed(2) + ' MB');
	console.log('包名 : com.fakekeep.app   versionCode ' + VERSION_CODE + ' / ' + VERSION_NAME);
	console.log('安装 : adb install -r "' + outApk + '"');
	console.log('='.repeat(60));
}

try {
	main();
} catch (e) {
	console.error('\n构建失败: ' + (e && e.message));
	if (e && e.stack) console.error(e.stack);
	process.exit(1);
}
