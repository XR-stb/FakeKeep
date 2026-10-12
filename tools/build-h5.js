/**
 * 用 uni-app CLI 把仓库源码编译成 H5 产物（不需要 HBuilderX）
 *
 * 用法：
 *   node tools/build-h5.js                 # 输出到 unpackage/dist/build/h5
 *   node tools/build-h5.js --install       # 先自动装 tools/uni-cli 的依赖再编译
 *   node tools/build-h5.js --out <目录>
 *
 * 背景（踩过的坑，改之前先看）：
 *   1. uni-app CLI 要求工程是 src/ 布局，而本仓库是 HBuilderX 布局（配置在根目录）。
 *      直接把 UNI_INPUT_DIR 指向仓库根目录是不行的，会报「缺少平台 h5 插件」。
 *      所以这里把源码拷进 tools/uni-cli/.build/src 再编译，仓库结构保持不动。
 *   2. 必须显式设置 UNI_CLI_CONTEXT。插件在加载时会 path.resolve(UNI_CLI_CONTEXT, 'package.json')，
 *      没设置的话会抛 ERR_INVALID_ARG_TYPE；更坑的是这个异常是异步抛的，
 *      vue-cli-service 会「零输出、退出码 0」地静默失败，非常难查。
 *   3. @dcloudio/uni-cli-i18n 和 @dcloudio/uni-migration 没被声明成依赖，得自己装。
 */

'use strict';

var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..');
var CLI_DIR = path.join(__dirname, 'uni-cli');
var BUILD_DIR = path.join(CLI_DIR, '.build');

/** 需要拷进 src/ 的项目源码 */
var SOURCE_ENTRIES = [
	'App.vue',
	'main.js',
	'manifest.json',
	'pages.json',
	'uni.scss',
	'pages',
	'common',
	'static'
];

function parseArgs(argv) {
	var out = { out: null, install: false };
	for (var i = 2; i < argv.length; i++) {
		if (argv[i] === '--out') out.out = argv[++i];
		else if (argv[i] === '--install') out.install = true;
		else if (argv[i] === '--help' || argv[i] === '-h') out.help = true;
	}
	return out;
}

var args = parseArgs(process.argv);
if (args.help) {
	console.log('用法: node tools/build-h5.js [--out <目录>] [--install]');
	process.exit(0);
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

function run(exe, exeArgs, opts) {
	opts = opts || {};
	console.log('\n$ ' + path.basename(exe) + ' ' + exeArgs.join(' '));
	var spawnOpts = {
		cwd: opts.cwd || ROOT,
		stdio: 'inherit',
		env: opts.env || process.env
	};
	// Windows 上 Node 不允许直接 spawn .cmd/.bat（EINVAL），得交给 shell
	var res = /\.(cmd|bat)$/i.test(exe)
		? cp.spawnSync([exe].concat(exeArgs).map(function (a) {
			return /[\s"]/.test(a) ? '"' + a.replace(/"/g, '\\"') + '"' : a;
		}).join(' '), Object.assign({ shell: true }, spawnOpts))
		: cp.spawnSync(exe, exeArgs, spawnOpts);
	if (res.error) throw res.error;
	if (res.status !== 0) throw new Error(path.basename(exe) + ' 退出码 ' + res.status);
}

function main() {
	// 1. 依赖
	var pluginDir = path.join(CLI_DIR, 'node_modules', '@dcloudio', 'vue-cli-plugin-uni');
	if (!fs.existsSync(pluginDir)) {
		if (!args.install) {
			console.error('还没装 uni-app CLI 依赖。先执行：');
			console.error('    npm install --prefix tools/uni-cli');
			console.error('或者加 --install 让本脚本代劳（大约 1400 个包 / 数百 MB）。');
			process.exit(2);
		}
		console.log('安装 uni-app CLI 依赖（首次会比较慢）...');
		run(process.platform === 'win32' ? 'npm.cmd' : 'npm',
			['install', '--no-audit', '--no-fund', '--legacy-peer-deps'],
			{ cwd: CLI_DIR });
	}

	// 2. 准备 .build 工程
	fs.rmSync(BUILD_DIR, { recursive: true, force: true });
	var srcDir = path.join(BUILD_DIR, 'src');
	fs.mkdirSync(srcDir, { recursive: true });

	SOURCE_ENTRIES.forEach(function (entry) {
		var from = path.join(ROOT, entry);
		if (!fs.existsSync(from)) return;
		var to = path.join(srcDir, entry);
		if (fs.statSync(from).isDirectory()) copyDir(from, to);
		else fs.copyFileSync(from, to);
	});

	// 脚手架：babel / postcss / public/index.html / package.json
	['babel.config.js', 'postcss.config.js', 'package.json'].forEach(function (f) {
		fs.copyFileSync(path.join(CLI_DIR, f), path.join(BUILD_DIR, f));
	});
	copyDir(path.join(CLI_DIR, 'public'), path.join(BUILD_DIR, 'public'));

	console.log('已把项目源码拷到 ' + path.relative(ROOT, srcDir));

	// 3. 编译
	var cliService = path.join(CLI_DIR, 'node_modules', '@vue', 'cli-service', 'bin', 'vue-cli-service.js');
	if (!fs.existsSync(cliService)) {
		console.error('找不到 vue-cli-service，依赖可能没装完整。');
		process.exit(2);
	}
	run(process.execPath, [cliService, 'uni-build'], {
		cwd: BUILD_DIR,
		env: Object.assign({}, process.env, {
			// 不设置它就会静默失败，见文件头注释
			UNI_CLI_CONTEXT: CLI_DIR,
			NODE_OPTIONS: '--openssl-legacy-provider',
			NODE_ENV: 'production',
			UNI_PLATFORM: 'h5'
		})
	});

	// 4. 产物搬到 unpackage/dist/build/h5（build-apk.js 会自动在这里找）
	var built = path.join(BUILD_DIR, 'dist', 'build', 'h5');
	if (!fs.existsSync(path.join(built, 'index.html'))) {
		console.error('编译似乎没有产出 index.html: ' + built);
		process.exit(3);
	}
	var target = args.out ? path.resolve(args.out) : path.join(ROOT, 'unpackage', 'dist', 'build', 'h5');
	fs.rmSync(target, { recursive: true, force: true });
	copyDir(built, target);

	var count = 0;
	var size = 0;
	(function walk(d) {
		fs.readdirSync(d, { withFileTypes: true }).forEach(function (e) {
			var p = path.join(d, e.name);
			if (e.isDirectory()) walk(p);
			else { count++; size += fs.statSync(p).size; }
		});
	})(target);

	console.log('\n' + '='.repeat(60));
	console.log('H5 产物: ' + target);
	console.log('文件数 : ' + count + '   大小: ' + (size / 1024 / 1024).toFixed(2) + ' MB');
	console.log('下一步 : node tools/build-apk.js');
	console.log('='.repeat(60));
}

try {
	main();
} catch (e) {
	console.error('\n构建失败: ' + (e && e.message));
	process.exit(1);
}
