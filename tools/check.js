/**
 * 静态检查（离线，不需要 HBuilderX）
 *
 *   1. pages.json / manifest.json 能否解析（两者都允许 // 与 /* *\/ 注释）
 *   2. pages.json 里声明的页面文件是否都存在
 *   3. 代码里 uni.navigateTo / redirectTo / reLaunch / switchTab 的 url 是否都已注册
 *   4. <template> 能否编译通过（vue-template-compiler）
 *   5. <script> 能否通过 JS 语法检查
 *   6. 模板里引用的字段是否在 data / computed / methods 中声明过
 *      （Vue2 里给未声明的字段赋值不是响应式的，界面不会更新）
 *   7. 页面里是否误用了 onLaunch（那是 App.vue 的生命周期）
 *
 * 用法： node tools/check.js    （或 npm run lint）
 */

'use strict';

var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var problems = [];
var notes = [];

var compiler = null;
try {
	compiler = require('vue-template-compiler');
} catch (e) {
	notes.push('未安装 vue-template-compiler，已跳过模板编译检查（执行 npm install 后重跑即可）');
}

/* ============================ 工具 ============================ */

function read(file) {
	return fs.readFileSync(file, 'utf8');
}

/** 去掉 JSON 里的 // 与 /* *\/ 注释（HBuilderX 的配置文件允许注释） */
function stripJsonComments(text) {
	var out = '';
	var inString = false;
	var inLine = false;
	var inBlock = false;
	for (var i = 0; i < text.length; i++) {
		var c = text.charAt(i);
		var next = text.charAt(i + 1);
		if (inLine) {
			if (c === '\n') {
				inLine = false;
				out += c;
			}
			continue;
		}
		if (inBlock) {
			if (c === '*' && next === '/') {
				inBlock = false;
				i++;
			}
			continue;
		}
		if (inString) {
			out += c;
			if (c === '\\') {
				out += next;
				i++;
			} else if (c === '"') {
				inString = false;
			}
			continue;
		}
		if (c === '"') {
			inString = true;
			out += c;
			continue;
		}
		if (c === '/' && next === '/') {
			inLine = true;
			i++;
			continue;
		}
		if (c === '/' && next === '*') {
			inBlock = true;
			i++;
			continue;
		}
		out += c;
	}
	return out;
}

function walk(dir, out) {
	out = out || [];
	if (!fs.existsSync(dir)) return out;
	fs.readdirSync(dir).forEach(function (name) {
		if (name === 'node_modules' || name === '.git' || name === 'unpackage') return;
		var full = path.join(dir, name);
		var stat = fs.statSync(full);
		if (stat.isDirectory()) walk(full, out);
		else if (/\.(vue|js)$/.test(name)) out.push(full);
	});
	return out;
}

function blockOf(source, tag) {
	var open = new RegExp('<' + tag + '(\\s[^>]*)?>', 'i');
	var m = open.exec(source);
	if (!m) return null;
	var start = m.index + m[0].length;
	var end = source.toLowerCase().indexOf('</' + tag + '>', start);
	if (end === -1) return null;
	return { content: source.slice(start, end), start: start };
}

/** 把 ESM 的 import / export 改写成可被 new Function 编译的形式 */
function toCheckableScript(script) {
	return script
		.replace(/^\s*import\s+[^;]*;?\s*$/gm, '')
		.replace(/\bexport\s+default\b/, 'var __default__ =')
		.replace(/\bexport\s+(const|let|var|function|class)\b/g, '$1');
}

/* ======================= 1&2. 配置文件与页面 ======================= */

var pagesJson = null;
try {
	var pagesRaw = read(path.join(root, 'pages.json'));
	pagesJson = JSON.parse(stripJsonComments(pagesRaw));
} catch (e) {
	problems.push('pages.json 解析失败: ' + e.message);
}

try {
	var manifestRaw = read(path.join(root, 'manifest.json'));
	var manifest = JSON.parse(stripJsonComments(manifestRaw));
	if (manifest.vueVersion !== '2') {
		problems.push('manifest.json 的 vueVersion 应为 "2"（当前代码是 Vue2 写法），实际为 ' + manifest.vueVersion);
	}
} catch (e) {
	problems.push('manifest.json 解析失败: ' + e.message);
}

var registered = [];
if (pagesJson && Array.isArray(pagesJson.pages)) {
	pagesJson.pages.forEach(function (page) {
		registered.push(page.path);
		var file = path.join(root, page.path + '.vue');
		if (!fs.existsSync(file)) {
			problems.push('pages.json 声明了 ' + page.path + '，但找不到 ' + page.path + '.vue');
		}
	});
} else if (pagesJson) {
	problems.push('pages.json 缺少 pages 数组');
}

/* ======================= 3. 路由跳转是否已注册 ======================= */

/** 把 '../track/track' 这种相对路径按所在页面目录解析成 'pages/track/track' */
function resolveRoute(url, fromPage) {
	if (!url) return null;
	var clean = String(url).split('?')[0].split('#')[0];
	if (clean.charAt(0) === '/') return clean.replace(/^\//, '');
	var dir = path.posix.dirname(fromPage);
	return path.posix.normalize(path.posix.join(dir, clean));
}

var routeRe = /uni\.(?:navigateTo|redirectTo|reLaunch|switchTab)\s*\(\s*\{[^}]*?url\s*:\s*['"]([^'"]+)['"]/g;

function checkRoutes(code, relFile, fromPage) {
	var m;
	routeRe.lastIndex = 0;
	while ((m = routeRe.exec(code))) {
		// common/ 下的模块没有"所在页面"，只校验绝对路径
		if (!fromPage && m[1].charAt(0) !== '/') continue;
		var resolved = resolveRoute(m[1], fromPage);
		if (resolved && registered.indexOf(resolved) === -1) {
			problems.push(relFile + ': 跳转目标 "' + m[1] + '"（解析为 ' + resolved + '）未在 pages.json 中注册');
		}
	}
}

// 公共模块里也可能写死跳转地址（例如 common/launch.js）
walk(path.join(root, 'common')).forEach(function (file) {
	if (!/\.js$/.test(file)) return;
	checkRoutes(read(file), path.relative(root, file).replace(/\\/g, '/'), '');
});

/* ======================= 4~7. .vue 检查 ======================= */

/** 收集 data 返回的键、computed / methods 的名字 */
function collectDeclarations(script) {
	var members = [];
	['data', 'computed', 'methods'].forEach(function (section) {
		var idx = script.indexOf(section + '(');
		if (idx === -1) idx = script.indexOf(section + ':');
		if (idx === -1) return;
		var slice = script.slice(idx, idx + 16000);
		var re = /(?:^|[\s,{])([A-Za-z_$][\w$]*)\s*[:(]/g;
		var m;
		while ((m = re.exec(slice))) members.push(m[1]);
	});
	return members;
}

/** 模板里 v-for / {{ }} / :prop / @event 用到的顶层标识符 */
function collectTemplateRefs(template) {
	var names = Object.create(null);
	var aliases = Object.create(null);
	var aliasRe = /^\s*\(?\s*([\w$]+)\s*(?:,\s*([\w$]+))?\s*\)?\s+in\s+/;
	// 正则必须在循环外创建，否则 lastIndex 每次归零会死循环
	var forRe = /v-for\s*=\s*"([^"]*)"/g;
	var m;
	while ((m = forRe.exec(template))) {
		var am = aliasRe.exec(m[1]);
		if (am) {
			if (am[1]) aliases[am[1]] = 1;
			if (am[2]) aliases[am[2]] = 1;
		}
	}

	var patterns = [
		/\{\{([^}]*)\}\}/g,
		/(?::|v-bind:)[\w-]+\s*=\s*"([^"]*)"/g,
		/@[\w.-]+\s*=\s*"([^"]*)"/g,
		/v-if\s*=\s*"([^"]*)"/g,
		/v-show\s*=\s*"([^"]*)"/g
	];
	patterns.forEach(function (re) {
		var match;
		while ((match = re.exec(template))) {
			// 去掉对象字面量的键（:style="{ paddingTop: ... }"）
			var expr = (match[1] || '').replace(/([{,]\s*)[A-Za-z_$][\w$]*\s*:/g, '$1');
			var idRe = /(?:^|[^.\w$'"])([A-Za-z_$][\w$]*)/g;
			var idm;
			while ((idm = idRe.exec(expr))) {
				var name = idm[1];
				if (name.charAt(0) === '$' || name.charAt(0) === '_') continue;
				if (aliases[name]) continue;
				if (/^(in|of|true|false|null|undefined|typeof|new|return)$/.test(name)) continue;
				names[name] = 1;
			}
		}
	});
	return Object.keys(names);
}

var vueFiles = walk(path.join(root, 'pages'));
var appVue = path.join(root, 'App.vue');
if (fs.existsSync(appVue)) vueFiles.push(appVue);

vueFiles.forEach(function (file) {
	var rel = path.relative(root, file).replace(/\\/g, '/');
	var source = read(file);
	var isAppShell = rel === 'App.vue';
	var template = blockOf(source, 'template');
	var script = blockOf(source, 'script');
	var pagePath = rel.replace(/\.vue$/, '');

	if (!template && !isAppShell) problems.push(rel + ': 缺少 <template>');
	if (!script) {
		problems.push(rel + ': 缺少 <script>');
		return;
	}

	if (template && compiler) {
		var result = compiler.compile(template.content);
		(result.errors || []).forEach(function (err) {
			problems.push(rel + ': 模板错误 -> ' + err);
		});
		(result.tips || []).forEach(function (tip) {
			notes.push(rel + ': 模板提示 -> ' + (tip.msg || tip));
		});

		var declared = collectDeclarations(script.content);
		collectTemplateRefs(template.content).forEach(function (name) {
			if (declared.indexOf(name) === -1) {
				problems.push(rel + ': 模板使用了未在 data / computed / methods 中声明的 "' + name + '"');
			}
		});
	}

	try {
		/* eslint-disable no-new-func */
		new Function(toCheckableScript(script.content));
	} catch (e) {
		problems.push(rel + ': 脚本语法错误 -> ' + e.message);
	}

	if (registered.indexOf(pagePath) !== -1 && /\bonLaunch\s*[:(]/.test(script.content)) {
		problems.push(rel + ': 页面中不应使用 onLaunch（那是 App.vue 的生命周期，页面请用 onLoad / onShow）');
	}

	checkRoutes(source, rel, pagePath);
	console.log('  · ' + rel.padEnd(28) + (isAppShell ? '应用外壳' : template ? '模板✓' : '模板✗'));
});

/* ============================ 汇总 ============================ */

console.log('');
notes.forEach(function (n) { console.log('  提示: ' + n); });
if (problems.length) {
	console.log('发现 ' + problems.length + ' 个问题：');
	problems.forEach(function (p) { console.log('  ✗ ' + p); });
	process.exit(1);
} else {
	console.log('检查通过：' + registered.length + ' 个页面 / ' + vueFiles.length + ' 个 .vue 文件全部正常。');
}
