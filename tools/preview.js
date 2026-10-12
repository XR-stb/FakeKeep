/**
 * 离线排版预览（不需要真机 / HBuilderX）
 *
 * 用 tools/raster.js 实现一个"足够像"的 CanvasContext 桩，
 * 把 common/trackCard.js 的真实绘制逻辑跑一遍，输出：
 *   1. tools/out/preview-*.png —— 排版效果图
 *      （文字用与真实字宽比例一致的色块代替，用于检查对齐/居中/溢出）
 *   2. 控制台文本报告 —— 每一项文字的坐标、宽度、是否越界
 *
 * 用法： node tools/preview.js
 */

'use strict';

var fs = require('fs');
var path = require('path');
var raster = require('./raster.js');
var mapArt = require('./map-art.js');
var trackCard = require('../common/trackCard.js');
var routeUtil = require('../common/route.js');
var backgrounds = require('../common/backgrounds.js');
var format = require('../common/format.js');

var SCALE = 2; // 预览用 2 倍超采样，缩小后即得到抗锯齿效果

/* ---------------------- 文本宽度估算 ---------------------- */

var CJK = /[\u2e80-\u9fff\u3000-\u303f\uff00-\uffef\u2018\u2019\u201c\u201d]/;

/** 与常见无衬线字体比例近似的字宽估算 */
function textWidth(text, size, bold) {
	var w = 0;
	var s = String(text);
	for (var i = 0; i < s.length; i++) {
		w += CJK.test(s.charAt(i)) ? size : size * 0.552;
	}
	return w * (bold ? 1.03 : 1);
}

/* ---------------------- CanvasContext 桩 ---------------------- */

/**
 * @param {Object} canvas  tools/raster.js 的 canvas
 * @param {Object} opts    { mapResolver: (src)=>rgb, report: Array }
 */
function createContextStub(canvas, opts) {
	var state = {
		fill: '#000',
		stroke: '#000',
		lineWidth: 1,
		lineCap: 'butt',
		lineJoin: 'miter',
		alpha: 1,
		fontSize: 12,
		textAlign: 'left',
		textBaseline: 'top'
	};
	var stack = [];
	var path = [];       // 当前路径点
	var subpaths = [];   // 已完成子路径
	var current = null;
	var report = opts.report || [];

	function withAlpha(color) {
		if (state.alpha >= 1) return color;
		var c = raster.parseColor(color);
		return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (c[3] * state.alpha) + ')';
	}

	var ctx = {
		// --- 样式 ---
		setFillStyle: function (c) { state.fill = c; },
		setStrokeStyle: function (c) { state.stroke = c; },
		setLineWidth: function (w) { state.lineWidth = w; },
		setLineCap: function (v) { state.lineCap = v; },
		setLineJoin: function (v) { state.lineJoin = v; },
		setGlobalAlpha: function (a) { state.alpha = a; },
		// 刻意不提供 setFontSize：这里模拟的是原生 CanvasRenderingContext2D
		// （即 trackCard 的「无 setFontSize」分支，也是 WebView 里跑 H5 产物时的真实情况）
		setTextAlign: function (v) { state.textAlign = v; },
		setTextBaseline: function (v) { state.textBaseline = v; },

		get font() { return state.fontSize + 'px sans-serif'; },
		set font(v) {
			var m = /(\d+(?:\.\d+)?)px/.exec(String(v));
			if (m) state.fontSize = parseFloat(m[1]);
		},
		get fillStyle() { return state.fill; },
		set fillStyle(v) { state.fill = v; },
		get strokeStyle() { return state.stroke; },
		set strokeStyle(v) { state.stroke = v; },
		get lineWidth() { return state.lineWidth; },
		set lineWidth(v) { state.lineWidth = v; },
		get globalAlpha() { return state.alpha; },
		set globalAlpha(v) { state.alpha = v; },

		// --- 状态 ---
		save: function () { stack.push(JSON.parse(JSON.stringify(state))); },
		restore: function () { if (stack.length) state = stack.pop(); },

		// --- 矩形 ---
		fillRect: function (x, y, w, h) { canvas.fillRect(x, y, w, h, withAlpha(state.fill)); },

		// --- 路径 ---
		beginPath: function () { path = []; subpaths = []; current = null; },
		moveTo: function (x, y) { if (path.length) subpaths.push(path); path = [[x, y]]; current = [x, y]; },
		lineTo: function (x, y) { if (!path.length) path.push([x, y]); else path.push([x, y]); current = [x, y]; },
		closePath: function () { /* 填充时按多边形闭合处理 */ },
		arc: function (cx, cy, r, a0, a1) {
			var span = Math.abs(a1 - a0) || Math.PI * 2;
			var steps = Math.max(8, Math.ceil((span / (Math.PI * 2)) * 40));
			for (var i = 0; i <= steps; i++) {
				var a = a0 + (a1 - a0) * (i / steps);
				path.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
			}
			current = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
		},
		fill: function () {
			var polys = subpaths.concat(path.length ? [path] : []);
			for (var i = 0; i < polys.length; i++) {
				if (polys[i].length >= 3) canvas.fillPoly(polys[i], withAlpha(state.fill));
			}
			path = [];
			subpaths = [];
		},
		stroke: function () {
			var polys = subpaths.concat(path.length ? [path] : []);
			for (var i = 0; i < polys.length; i++) {
				canvas.strokePolyline(polys[i], state.lineWidth, withAlpha(state.stroke), state.lineCap);
			}
			path = [];
			subpaths = [];
		},

		// --- 文本 ---
		measureText: function (text) { return { width: textWidth(text, state.fontSize) }; },
		fillText: function (text, x, y) {
			var size = state.fontSize;
			var w = textWidth(text, size);
			var left = x;
			if (state.textAlign === 'center') left = x - w / 2;
			else if (state.textAlign === 'right') left = x - w;
			var top = y;
			if (state.textBaseline === 'middle') top = y - size / 2;
			else if (state.textBaseline === 'bottom' || state.textBaseline === 'alphabetic') top = y - size * 0.8;
			report.push({ text: String(text), left: left, top: top, width: w, size: size });
			// 用色块代替字形：外框 + 内部稍浅的横条，便于看清对齐关系
			canvas.fillRect(left, top + size * 0.14, w, size * 0.72, withAlpha(state.fill));
			canvas.fillRect(left + w * 0.06, top + size * 0.36, w * 0.88, size * 0.18, 'rgba(255,255,255,0.45)');
		},

		// --- 图像 ---
		drawImage: function () {
			var args = Array.prototype.slice.call(arguments);
			var src = args.shift();
			var dx;
			var dy;
			var dw;
			var dh;
			if (args.length >= 8) {
				dx = args[4];
				dy = args[5];
				dw = args[6];
				dh = args[7];
			} else {
				dx = args[0];
				dy = args[1];
				dw = args[2];
				dh = args[3];
			}
			var rgb = opts.mapResolver ? opts.mapResolver(src) : null;
			if (rgb) canvas.drawRGB(rgb, rgb.width, rgb.height, dx, dy, dw, dh);
			else report.push({ text: '[missing image] ' + src, left: dx, top: dy, width: dw, size: dh });
		},

		draw: function (reserve, cb) { if (typeof reserve === 'function') reserve(); else if (cb) cb(); }
	};

	return ctx;
}

/* ---------------------- 预览场景 ---------------------- */

/** 把 '/static/maps/mapX.png' 解析成现场生成的底图（避免引入 PNG 解码器） */
function createMapResolver(cssWidth, cssHeight) {
	var cache = Object.create(null);
	var styleFor = {
		map1: ['gridLight', 1101, false],
		map2: ['cityPark', 2202, false],
		map3: ['riverside', 3303, false],
		map4: ['gridDark', 4404, true],
		map5: ['lakeRural', 5505, false],
		map6: ['newTown', 6606, false]
	};
	return function (src) {
		var key = String(src).replace(/^.*\//, '').replace(/\.png$/, '');
		var def = styleFor[key];
		if (!def) return null;
		if (!cache[key]) {
			var c = mapArt.renderMap(def[0], cssWidth, cssHeight, def[1], { dark: def[2], supersample: 1 });
			var rgb = c.toRGB();
			rgb.width = cssWidth;
			rgb.height = cssHeight;
			cache[key] = rgb;
		}
		return cache[key];
	};
}

function renderScene(name, options) {
	var W = options.cssWidth;
	var H = options.cssHeight;
	var canvas = raster.createCanvas(W, H, SCALE);
	var report = [];
	var ctx = createContextStub(canvas, {
		mapResolver: options.mapResolver,
		report: report
	});

	var bg = options.background;
	var background = { type: bg.type, src: bg.src, color: bg.color, theme: bg.theme };
	if (bg.type === 'image') {
		background.image = { path: bg.src, width: W, height: H };
	}
	// 归一化到 canvas 尺寸的布局需要按目标像素计算
	trackCard.drawCard(ctx, {
		width: W,
		height: H,
		background: background,
		route: options.route,
		routeColor: options.routeColor,
		stats: options.stats,
		title: '户外跑步',
		datetimeText: options.datetimeText,
		locationText: options.locationText,
		showMarkers: true,
		showWatermark: true
	});

	var png = raster.encodePng(W, H, canvas.toRGB());
	var outDir = path.join(__dirname, 'out');
	if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
	var file = path.join(outDir, 'preview-' + name + '.png');
	fs.writeFileSync(file, png);

	return { file: file, report: report, png: png };
}

/** 检查排版：越界、文字互相重叠、数值列溢出 */
function audit(report, W, H) {
	var problems = [];
	var L = trackCard.LAYOUT;
	var k = W / trackCard.DESIGN.width;
	var i;
	var j;

	// 1. 所有文字必须落在画布内
	report.forEach(function (item) {
		if (item.left < -0.5 || item.left + item.width > W + 0.5) {
			problems.push('横向越界: "' + item.text + '" [' + item.left.toFixed(1) + ', ' +
				(item.left + item.width).toFixed(1) + '] 画布宽 ' + W);
		}
		if (item.top < 0 || item.top + item.size > H + 0.5) {
			problems.push('纵向越界: "' + item.text + '" [' + item.top.toFixed(1) + ', ' +
				(item.top + item.size).toFixed(1) + '] 画布高 ' + H);
		}
	});

	// 2. 任意两段文字都不应重叠
	for (i = 0; i < report.length; i++) {
		for (j = i + 1; j < report.length; j++) {
			var a = report[i];
			var b = report[j];
			var overlapX = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
			var overlapY = Math.min(a.top + a.size, b.top + b.size) - Math.max(a.top, b.top);
			if (overlapX > 0.5 && overlapY > 0.5) {
				problems.push('文字重叠: "' + a.text + '" 与 "' + b.text + '" 交叠 ' +
					overlapX.toFixed(1) + '×' + overlapY.toFixed(1) + 'px');
			}
		}
	}

	// 3. 三列数值不应超出各自的 250px 列宽
	var colHalf = 125 * k;
	report.forEach(function (item) {
		var inRows = item.top >= (L.row1LabelY - 2) * k && item.top <= (L.row2ValueY + 50) * k;
		if (!inRows) return;
		for (var c = 0; c < L.cols.length; c++) {
			var cx = L.cols[c] * k;
			if (Math.abs((item.left + item.width / 2) - cx) > 130 * k) continue; // 不属于该列
			if (item.left < cx - colHalf - 0.5 || item.left + item.width > cx + colHalf + 0.5) {
				problems.push('数值列溢出: "' + item.text + '" [' + item.left.toFixed(1) + ', ' +
					(item.left + item.width).toFixed(1) + '] 超出列 [' + (cx - colHalf).toFixed(1) + ', ' +
					(cx + colHalf).toFixed(1) + ']');
			}
		}
	});

	// 4. 大号距离数字 + 单位 不应超出数据卡
	report.forEach(function (item) {
		if (item.top < (L.distLabel.y - 2) * k) return;
		if (item.top > (L.divider.y + 2) * k) return;
		if (item.left + item.width > (L.card.w - 40) * k) {
			problems.push('距离数值过宽: "' + item.text + '" 右边界 ' +
				(item.left + item.width).toFixed(1) + ' > ' + ((L.card.w - 40) * k).toFixed(1));
		}
	});

	return problems;
}

function main() {
	// 直接按设计尺寸（750 × 1120）渲染，等同真机上 2 倍屏的清晰度
	var W = trackCard.DESIGN.width;
	var H = trackCard.DESIGN.height;
	var mapResolver = createMapResolver(W, H);
	var cssWidth = W;
	var cssHeight = H;

	var stats = format.buildConsistentStats({ km: 8.42, paceSec: 372, cadence: 178, heartRate: 151 });
	var routes = ['stadium', 'cityLoop', 'outAndBack', 'serpentine', 'figure8', 'zigzag', 'blockLoop'];
	var maps = ['map1', 'map3', 'map4', 'map5', 'map2', 'map6'];

	var allProblems = [];
	routes.forEach(function (style, i) {
		var bgKey = maps[i % maps.length];
		var mapDef = backgrounds.findMap(bgKey);
		var res = renderScene(style, {
			cssWidth: cssWidth,
			cssHeight: cssHeight,
			mapResolver: mapResolver,
			background: { type: 'image', src: mapDef.src, theme: mapDef.theme },
			route: routeUtil.buildRoute(style, 2000 + i * 37),
			routeColor: backgrounds.ROUTE_COLORS[i % backgrounds.ROUTE_COLORS.length].value,
			stats: {
				distance: format.toFixedStr(stats.km, 2),
				duration: format.formatDuration(stats.durationSec),
				pace: format.formatPace(stats.paceSec),
				calories: String(stats.calories),
				heartRate: String(stats.heartRate),
				cadence: String(stats.cadence),
				steps: String(stats.steps)
			},
			datetimeText: '8月9日 07:09',
			locationText: i % 2 === 0 ? '杭州·西湖区' : ''
		});
		var problems = audit(res.report, cssWidth, cssHeight);
		allProblems = allProblems.concat(problems.map(function (p) { return '[' + style + '] ' + p; }));
		console.log('  ' + style.padEnd(12) + '-> ' + path.relative(process.cwd(), res.file) +
			'  (' + Math.round(res.png.length / 1024) + ' KB, ' + res.report.length + ' 处文本)');
	});

	console.log('');
	if (allProblems.length) {
		console.log('排版告警 ' + allProblems.length + ' 条：');
		allProblems.forEach(function (p) { console.log('  ! ' + p); });
		process.exitCode = 1;
	} else {
		console.log('排版检查通过：所有文字均在画布/列宽范围内。');
	}
}

main();
