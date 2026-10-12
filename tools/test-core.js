/**
 * 核心逻辑单元测试（零依赖，直接 node tools/test-core.js）
 *
 * 覆盖：参数解析 / 配速换算 / 轨迹生成 / 卡片布局 / 绘制指令合法性
 * 这些是最容易出 bug 又最难在真机上逐一验证的部分，所以全部离线测掉。
 */

'use strict';

var assert = require('assert');
var format = require('../common/format.js');
var routeUtil = require('../common/route.js');
var trackCard = require('../common/trackCard.js');
var backgrounds = require('../common/backgrounds.js');
var mapArt = require('./map-art.js');
var raster = require('./raster.js');

var passed = 0;
var failures = [];

function test(name, fn) {
	try {
		fn();
		passed++;
		console.log('  ✓ ' + name);
	} catch (e) {
		failures.push({ name: name, error: e });
		console.log('  ✗ ' + name);
		console.log('      ' + (e && e.message));
	}
}

function group(title) {
	console.log('\n' + title);
}

function isFinitePoint(p) {
	return p && isFinite(p.x) && isFinite(p.y);
}

/* ============================ format.js ============================ */

group('common/format.js');

test('pad2 补零', function () {
	assert.strictEqual(format.pad2(3), '03');
	assert.strictEqual(format.pad2(12), '12');
	assert.strictEqual(format.pad2('7'), '07');
	assert.strictEqual(format.pad2('x'), '00');
});

test('toNumber 容忍单位与全角数字', function () {
	assert.strictEqual(format.toNumber('5.20公里'), 5.2);
	assert.strictEqual(format.toNumber('１２'), 12);
	assert.strictEqual(format.toNumber(' 8 '), 8);
	assert.strictEqual(format.toNumber('1.2.3'), 1.23);
	assert.strictEqual(format.toNumber(''), null);
	assert.strictEqual(format.toNumber('abc'), null);
	assert.strictEqual(format.toNumber(null), null);
});

test('parseDuration 支持多种写法', function () {
	assert.strictEqual(format.parseDuration('00:32:15'), 1935);
	assert.strictEqual(format.parseDuration('32:15'), 1935);
	assert.strictEqual(format.parseDuration('32分15秒'), 1935);
	assert.strictEqual(format.parseDuration('32.5'), 1950);
	assert.strictEqual(format.parseDuration('325'), 325);
	assert.strictEqual(format.parseDuration(''), null);
	assert.strictEqual(format.parseDuration('abc'), null);
});

test('formatDuration 按需显示小时位', function () {
	assert.strictEqual(format.formatDuration(1935), '32:15');
	assert.strictEqual(format.formatDuration(3935), '01:05:35');
	assert.strictEqual(format.formatDuration(3935, true), '01:05:35');
	assert.strictEqual(format.formatDuration(0), '00:00');
});

test('parsePace / formatPace 互为逆运算', function () {
	assert.strictEqual(format.parsePace('5\'30"'), 330);
	assert.strictEqual(format.parsePace('5:30'), 330);
	assert.strictEqual(format.parsePace('5.5'), 330);
	assert.strictEqual(format.parsePace(''), null);
	assert.strictEqual(format.formatPace(330), '5\'30"');
	assert.strictEqual(format.formatPace(359.6), '6\'00"'); // 四舍五入后不能出现 59.6"
	assert.strictEqual(format.formatPace(0), '--\'--"');
});

test('配速与用时互相换算', function () {
	assert.strictEqual(format.durationFromPace(330, 5.2), 1716);
	assert.ok(Math.abs(format.paceFromDuration(1716, 5.2) - 330) < 1e-9);
	assert.strictEqual(format.paceFromDuration(1716, 0), null);
	assert.strictEqual(format.durationFromPace(0, 5), null);
});

test('步数与卡路里推算', function () {
	assert.strictEqual(format.stepsFromCadence(180, 1800), 5400);
	assert.strictEqual(format.caloriesFromDistance(10, 60), 622);
	assert.strictEqual(format.stepsFromCadence(0, 100), 0);
});

test('splitDateTime 解析为「x月x日 + 星期」', function () {
	var r = format.splitDateTime('2026-02-03', '07:09');
	assert.strictEqual(r.date, '2月3日');
	assert.strictEqual(r.time, '07:09');
	assert.strictEqual(r.weekday, '周二');
	assert.strictEqual(format.splitDateTime('随便写的').date, '随便写的');
});

test('buildConsistentStats 生成的数据自洽', function () {
	for (var i = 0; i < 200; i++) {
		var s = format.buildConsistentStats();
		assert.ok(s.km > 0, '距离应为正');
		assert.ok(s.durationSec > 0 || s.km === 0, '用时应为正');
		// 配速 × 距离 ≈ 用时（允许四舍五入误差）
		assert.ok(Math.abs(s.paceSec * s.km - s.durationSec) <= 60, '配速与用时不匹配');
		// 步数 = 步频 × 分钟数
		assert.strictEqual(s.steps, Math.round(s.cadence * (s.durationSec / 60)));
		assert.ok(s.heartRate >= 130 && s.heartRate <= 170, '心率区间异常');
		assert.ok(s.cadence >= 160 && s.cadence <= 190, '步频区间异常');
	}
});

/* ============================ route.js ============================ */

group('common/route.js');

test('每种轨迹样式都能生成 [0,1] 内的有限点', function () {
	routeUtil.ROUTE_STYLES.forEach(function (style) {
		for (var seed = 1; seed <= 20; seed++) {
			var pts = routeUtil.buildRoute(style.key, seed);
			assert.ok(pts.length >= 100, style.key + ' 点数过少');
			pts.forEach(function (p) {
				assert.ok(isFinitePoint(p), style.key + ' 出现非法坐标');
				assert.ok(p.x >= -1e-9 && p.x <= 1 + 1e-9, style.key + ' x 越界: ' + p.x);
				assert.ok(p.y >= -1e-9 && p.y <= 1 + 1e-9, style.key + ' y 越界: ' + p.y);
			});
			// 归一化后必须真的占满一个方向，否则说明形状退化了
			var xs = pts.map(function (p) { return p.x; });
			var ys = pts.map(function (p) { return p.y; });
			var span = Math.max(Math.max.apply(null, xs) - Math.min.apply(null, xs),
				Math.max.apply(null, ys) - Math.min.apply(null, ys));
			assert.ok(span > 0.9, style.key + ' 轨迹尺度过小: ' + span.toFixed(3));
		}
	});
});

test('同一个 seed 结果完全一致（可复现）', function () {
	routeUtil.ROUTE_STYLES.forEach(function (style) {
		var a = routeUtil.buildRoute(style.key, 777);
		var b = routeUtil.buildRoute(style.key, 777);
		var c = routeUtil.buildRoute(style.key, 778);
		assert.deepStrictEqual(a, b, style.key + ' 不可复现');
		assert.notDeepStrictEqual(a, c, style.key + ' 不同 seed 结果相同');
	});
});

test('非法样式名回退到操场环线', function () {
	var a = routeUtil.buildRoute('不存在的样式', 42);
	var b = routeUtil.buildRoute('stadium', 42);
	assert.deepStrictEqual(a, b);
});

test('轨迹平滑度合理（相邻点距离不应突变）', function () {
	routeUtil.ROUTE_STYLES.forEach(function (style) {
		var pts = routeUtil.buildRoute(style.key, 12345);
		var dists = [];
		for (var i = 1; i < pts.length; i++) {
			dists.push(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
		}
		var avg = dists.reduce(function (a, b) { return a + b; }, 0) / dists.length;
		var max = Math.max.apply(null, dists);
		assert.ok(max < avg * 6 + 0.02, style.key + ' 相邻点距离突变: max=' + max.toFixed(4) + ' avg=' + avg.toFixed(4));
	});
});

test('fitToBox 让轨迹完整落在目标矩形内', function () {
	var box = { x: 66, y: 148, w: 618, h: 452 };
	routeUtil.ROUTE_STYLES.forEach(function (style) {
		var mapped = routeUtil.fitToBox(routeUtil.buildRoute(style.key, 9), box);
		mapped.forEach(function (p) {
			assert.ok(p.x >= box.x - 1e-6 && p.x <= box.x + box.w + 1e-6, style.key + ' 超出横向范围');
			assert.ok(p.y >= box.y - 1e-6 && p.y <= box.y + box.h + 1e-6, style.key + ' 超出纵向范围');
		});
		// 水平/垂直居中
		var xs = mapped.map(function (p) { return p.x; });
		var ys = mapped.map(function (p) { return p.y; });
		var leftGap = Math.min.apply(null, xs) - box.x;
		var rightGap = box.x + box.w - Math.max.apply(null, xs);
		var topGap = Math.min.apply(null, ys) - box.y;
		var bottomGap = box.y + box.h - Math.max.apply(null, ys);
		assert.ok(Math.abs(leftGap - rightGap) < 1e-6, style.key + ' 未水平居中');
		assert.ok(topGap >= -1e-6 && bottomGap >= -1e-6);
	});
});

test('fitToBox 对空输入安全', function () {
	assert.deepStrictEqual(routeUtil.fitToBox([], { x: 0, y: 0, w: 10, h: 10 }), []);
	assert.deepStrictEqual(routeUtil.fitToBox(null, { x: 0, y: 0, w: 10, h: 10 }), []);
});

/* ========================== trackCard.js ========================== */

group('common/trackCard.js');

test('布局常量自洽（不重叠、不越界）', function () {
	var L = trackCard.LAYOUT;
	var D = trackCard.DESIGN;
	assert.ok(L.pill.x > 0 && L.pill.x + L.pill.w < D.width, '胶囊越界');
	assert.ok(L.pill.y > 0 && L.pill.y + L.pill.h < L.routeBox.y, '胶囊与轨迹区重叠');
	assert.ok(L.routeBox.y > 0 && L.routeBox.y + L.routeBox.h < L.card.y, '轨迹区与数据卡重叠');
	assert.strictEqual(L.card.y + L.card.h, D.height, '数据卡未贴到底部');
	assert.strictEqual(L.card.x, 0);
	assert.strictEqual(L.card.w, D.width);
	assert.ok(L.row1LabelY < L.row1ValueY, '第一行标签应在数值上方');
	assert.ok(L.row1ValueY < L.row2LabelY, '两行数据不应重叠');
	assert.ok(L.row2ValueY < L.watermark.y, '第二行数据与水印重叠');
	assert.ok(L.watermark.y + L.watermark.size < D.height, '水印越出画布');
	assert.ok(L.divider.y < L.row1LabelY && L.divider.y > L.distValue.y, '分隔线位置错误');
	// 三列居中且等距
	assert.strictEqual(L.cols.length, 3);
	assert.ok(Math.abs((L.cols[0] + L.cols[2]) / 2 - L.cols[1]) < 1e-9, '三列未居中');
	assert.ok(L.cols[0] - 125 >= 0 && L.cols[2] + 125 <= D.width, '列宽超出画布');
	// 两行 × 三列定义完整
	assert.strictEqual(L.statRows.length, 2);
	L.statRows.forEach(function (row) { assert.strictEqual(row.length, 3); });
});

test('scaledLayout(1) 与设计常量一致，缩放线性', function () {
	var a = trackCard.scaledLayout(1);
	assert.strictEqual(a.pill.x, trackCard.LAYOUT.pill.x);
	assert.strictEqual(a.routeBox.w, trackCard.LAYOUT.routeBox.w);
	assert.strictEqual(a.distValue.size, trackCard.LAYOUT.distValue.size);
	var b = trackCard.scaledLayout(0.5);
	assert.strictEqual(b.pill.x, trackCard.LAYOUT.pill.x * 0.5);
	assert.strictEqual(b.valueSize, trackCard.LAYOUT.valueSize * 0.5);
});

/**
 * 记录型 ctx：所有坐标都会被检查是否有限。
 *
 * 刻意只提供原生 CanvasRenderingContext2D 那套接口（属性赋值、没有 setFontSize），
 * 也就是 trackCard 里「无 setFontSize」的那条分支。uni-app CanvasContext
 * （只有 setFontSize 权威）的适配单独用 applyFont 的单元测试覆盖。
 */
function createRecordingContext() {
	var calls = [];
	function rec(name) {
		return function () {
			var args = Array.prototype.slice.call(arguments);
			args.forEach(function (v) {
				if (typeof v === 'number') {
					assert.ok(isFinite(v), name + ' 收到非法数值: ' + v);
				}
			});
			calls.push({ name: name, args: args, fontSize: state.fontSize });
		};
	}
	var state = { fontSize: 12 };
	var ctx = {
		calls: calls,
		state: state,
		setFillStyle: rec('setFillStyle'),
		setStrokeStyle: rec('setStrokeStyle'),
		setLineWidth: rec('setLineWidth'),
		setLineCap: rec('setLineCap'),
		setLineJoin: rec('setLineJoin'),
		setGlobalAlpha: rec('setGlobalAlpha'),
		setTextAlign: rec('setTextAlign'),
		setTextBaseline: rec('setTextBaseline'),
		fillRect: rec('fillRect'),
		beginPath: rec('beginPath'),
		moveTo: rec('moveTo'),
		lineTo: rec('lineTo'),
		arc: rec('arc'),
		closePath: rec('closePath'),
		fill: rec('fill'),
		stroke: rec('stroke'),
		drawImage: rec('drawImage'),
		fillText: function (text, x, y) {
			calls.push({ name: 'fillText', args: [text, x, y], fontSize: state.fontSize });
		},
		measureText: function (t) { return { width: String(t).length * state.fontSize * 0.55 }; }
	};
	Object.defineProperty(ctx, 'font', {
		get: function () { return state.fontSize + 'px sans-serif'; },
		set: function (v) {
			var m = /(\d+(?:\.\d+)?)px/.exec(String(v));
			if (m) state.fontSize = parseFloat(m[1]);
		}
	});
	return ctx;
}

function sampleStats() {
	var s = format.buildConsistentStats({ km: 8.42, paceSec: 372, cadence: 178, heartRate: 151 });
	return {
		distance: format.toFixedStr(s.km, 2),
		duration: format.formatDuration(s.durationSec),
		pace: format.formatPace(s.paceSec),
		calories: String(s.calories),
		heartRate: String(s.heartRate),
		cadence: String(s.cadence),
		steps: String(s.steps)
	};
}

test('drawCard 输出的绘制指令全部合法', function () {
	routeUtil.ROUTE_STYLES.forEach(function (style, i) {
		for (var seed = 1; seed <= 6; seed++) {
			var ctx = createRecordingContext();
			trackCard.drawCard(ctx, {
				width: 750,
				height: trackCard.DESIGN.height,
				background: { type: 'color', color: '#E9EBEE', theme: i % 2 ? 'dark' : 'light' },
				route: routeUtil.buildRoute(style.key, seed),
				routeColor: backgrounds.ROUTE_COLORS[i % backgrounds.ROUTE_COLORS.length].value,
				stats: sampleStats(),
				datetimeText: '8月9日 07:09'
			});
			assert.ok(ctx.calls.length > 40, style.key + ' 绘制指令过少');
			var names = ctx.calls.map(function (c) { return c.name; });
			assert.ok(names.indexOf('drawImage') === -1, '纯色底不应调用 drawImage');
			assert.ok(names.indexOf('fillText') !== -1, '未绘制任何文字');
			// 每条直线/圆弧坐标都必须是有限数（由 rec 内部断言保证）
		}
	});
});

test('drawCard 会把全部参数与标签画出来', function () {
	var ctx = createRecordingContext();
	var stats = sampleStats();
	trackCard.drawCard(ctx, {
		width: 750,
		height: trackCard.DESIGN.height,
		background: { type: 'color', color: '#FFFFFF', theme: 'light' },
		route: routeUtil.buildRoute('stadium', 3),
		stats: stats,
		title: '户外跑步',
		datetimeText: '8月9日 07:09',
		locationText: '西湖区',
		showWatermark: true
	});
	var texts = ctx.calls.filter(function (c) { return c.name === 'fillText'; })
		.map(function (c) { return String(c.args[0]); });
	['户外跑步', '8月9日 07:09', '距离', '公里', '西湖区', '用时', '平均配速', '卡路里',
		'平均心率', '步频', '步数'].forEach(function (label) {
			assert.ok(texts.indexOf(label) !== -1, '缺少标签: ' + label);
		});
	['distance', 'duration', 'pace', 'calories', 'heartRate', 'cadence', 'steps'].forEach(function (key) {
		assert.ok(texts.indexOf(stats[key]) !== -1, '缺少数值: ' + key + '=' + stats[key]);
	});
});

test('applyFont 同时适配 uni 的 CanvasContext 和原生 2D 上下文', function () {
	var applyFont = trackCard.__internals.applyFont;

	// uni-app 各端：setFontSize 才是权威接口，必须真的被调用，
	// 并且返回 false 表示"请用伪粗体"，保证各端字重表现一致
	var uniCtx = {
		size: 0,
		font: '',
		setFontSize: function (s) { this.size = s; }
	};
	assert.strictEqual(applyFont(uniCtx, 42, true), false);
	assert.strictEqual(uniCtx.size, 42, 'uni 上下文必须调用 setFontSize');

	// 原生 2D 上下文：只能靠 ctx.font，粗体真实生效
	var nativeCtx = {};
	Object.defineProperty(nativeCtx, 'font', {
		get: function () { return this._f; },
		set: function (v) { this._f = v; }
	});
	assert.strictEqual(applyFont(nativeCtx, 20.18, false), true);
	assert.strictEqual(nativeCtx.font, '20.18px sans-serif');
	applyFont(nativeCtx, 65.6, true);
	assert.strictEqual(nativeCtx.font, 'bold 65.6px sans-serif');
});

test('回归：每段文字都用自己该用的字号，不会被上一段污染', function () {
	// 曾经的 bug：applyFont 用"赋值 ctx.font 再读回来"来判断粗体支持，
	// 而 uni-app 的 CanvasContext 里 font 只是个普通属性，
	// 于是 Math.round(size) 恰好是字号子串时会误判成功、跳过 setFontSize，
	// 这段文字就沿用了上一段的字号（"公里"变成和距离数字一样大、
	// 三列数值变成和标签一样小）。这里逐条钉死每个元素的字号。
	var ctx = createRecordingContext();
	var W = 750;
	var stats = sampleStats();
	trackCard.drawCard(ctx, {
		width: W,
		height: trackCard.DESIGN.height,
		background: { type: 'color', color: '#FFFFFF' },
		route: routeUtil.buildRoute('stadium', 1),
		stats: stats,
		title: '户外跑步',
		datetimeText: '8月9日 07:09',
		locationText: '西湖区'
	});
	var k = W / trackCard.DESIGN.width;
	var L = trackCard.LAYOUT;

	function fontSizeOf(text) {
		var hits = ctx.calls.filter(function (c) {
			return c.name === 'fillText' && String(c.args[0]) === text;
		});
		assert.ok(hits.length, '没有绘制文字: ' + text);
		return hits[0].fontSize;
	}
	function assertSize(text, expected, label) {
		var actual = fontSizeOf(text);
		assert.ok(Math.abs(actual - expected) < 1e-6,
			label + ' "' + text + '" 字号应为 ' + expected.toFixed(2) + '，实际 ' + actual.toFixed(2));
	}

	assertSize('户外跑步', L.pillLeft.size * k, '顶部运动类型');
	assertSize('8月9日 07:09', L.pillRight.size * k, '顶部日期时间');
	assertSize('距离', L.distLabel.size * k, '距离标签');
	assertSize(stats.distance, L.distValue.size * k, '大号距离数字');
	assertSize('公里', L.distUnit.size * k, '距离单位');   // 曾经和数字一样大
	assertSize('西湖区', L.locationText.size * k, '地点');
	assertSize('用时', L.labelSize * k, '数据标签');
	assertSize(stats.duration, L.valueSize * k, '数据数值'); // 曾经和标签一样小
	assertSize('千卡', L.unitSize * k, '数据单位');
});

test('缺失字段显示占位符而不是 undefined', function () {
	var ctx = createRecordingContext();
	trackCard.drawCard(ctx, {
		width: 750,
		height: trackCard.DESIGN.height,
		background: { type: 'color', color: '#FFFFFF' },
		route: [],
		stats: { distance: '5.00' }
	});
	var texts = ctx.calls.filter(function (c) { return c.name === 'fillText'; })
		.map(function (c) { return String(c.args[0]); });
	texts.forEach(function (t) {
		assert.ok(t.indexOf('undefined') === -1, '出现 undefined 文本');
		assert.ok(t.indexOf('NaN') === -1, '出现 NaN 文本');
	});
	assert.strictEqual(texts.filter(function (t) { return t === '--'; }).length, 6, '缺失的 6 项应显示 --');
});

test('showMarkers=false 时不再绘制端点圆点', function () {
	function arcCount(showMarkers) {
		var ctx = createRecordingContext();
		trackCard.drawCard(ctx, {
			width: 750,
			height: trackCard.DESIGN.height,
			background: { type: 'color', color: '#FFFFFF' },
			route: routeUtil.buildRoute('serpentine', 5),
			stats: sampleStats(),
			showMarkers: showMarkers
		});
		// 只统计 drawMarker 画的那种"从 0 到 2π 的整圆"
		return ctx.calls.filter(function (c) {
			return c.name === 'arc' && c.args[3] === 0 && Math.abs(c.args[4] - Math.PI * 2) < 1e-9;
		}).length;
	}
	assert.strictEqual(arcCount(false), 0);
	// 起点（外圈 + 内核）+ 终点（外圈 + 内核）共 4 个整圆
	assert.strictEqual(arcCount(true), 4);
});

test('drawCover 在拿不到原始尺寸时退化为拉伸', function () {
	var ctx = createRecordingContext();
	trackCard.drawCover(ctx, { src: '/x.png' }, 100, 200);
	assert.strictEqual(ctx.calls.length, 1);
	assert.strictEqual(ctx.calls[0].args.length, 5);
});

test('drawCover 按 cover 裁剪，保持比例', function () {
	var ctx = createRecordingContext();
	trackCard.drawCover(ctx, { path: '/x.png', width: 1000, height: 500 }, 100, 200);
	var call = ctx.calls[0];
	assert.strictEqual(call.args.length, 9);
	var sx = call.args[1];
	var sy = call.args[2];
	var sw = call.args[3];
	var sh = call.args[4];
	assert.ok(Math.abs(sw / sh - 100 / 200) < 1e-9, '裁剪区域比例错误');
	assert.ok(sx >= 0 && sy >= 0 && sx + sw <= 1000 + 1e-9 && sy + sh <= 500 + 1e-9, '裁剪区域越界');
});

/* ==================== getdateTime / launch ==================== */

group('common/getdateTime.js');

test('dateTimeStr 支持旧格式且不再互相干扰', function () {
	var getDateTime = require('../common/getdateTime.js');
	var d = new Date(2026, 1, 3, 7, 9, 5); // 2026-02-03 07:09:05 周二
	assert.strictEqual(getDateTime.dateTimeStr('y年m月d日 h:i:s', d), '2026年2月3日 7:9:5');
	assert.strictEqual(getDateTime.dateTimeStr('yyyy-mm-dd hh:ii:ss', d), '2026-02-03 07:09:05');
	assert.strictEqual(getDateTime.dateTimeStr('yy/m/d w', d), '26/2/3 二');
	// 旧实现的问题场景：年份里含 'm' 不会发生，但连续 replace 会误伤后面的占位符
	assert.strictEqual(getDateTime.dateTimeStr('m月d日', d), '2月3日');
});

group('common/launch.js');

test('首次启动进引导页，之后进首页', function () {
	var storage = {};
	var calls = [];
	global.uni = {
		getStorageSync: function (k) { return storage[k]; },
		setStorageSync: function (k, v) { storage[k] = v; },
		removeStorageSync: function (k) { delete storage[k]; },
		reLaunch: function (o) { calls.push(o.url); }
	};
	delete require.cache[require.resolve('../common/launch.js')];
	var launch = require('../common/launch.js');

	assert.strictEqual(launch.isFirstLaunch(), true);
	launch.routeFromLaunch();
	assert.deepStrictEqual(calls, ['/pages/guide/guide']);
	assert.strictEqual(launch.isFirstLaunch(), false, '跳转后应写入标记');

	calls.length = 0;
	launch.routeFromLaunch();
	assert.deepStrictEqual(calls, ['/pages/index/index']);

	launch.resetLaunchFlag();
	assert.strictEqual(launch.isFirstLaunch(), true);

	// 存储不可用时不能抛异常
	global.uni.getStorageSync = function () { throw new Error('storage boom'); };
	assert.strictEqual(launch.isFirstLaunch(), false);
	delete global.uni;
});

/* ==================== trackState.js ==================== */

group('common/trackState.js');

var trackState = require('../common/trackState.js');

test('默认表单字段完整且合法', function () {
	var form = trackState.createDefaultForm(new Date(2026, 1, 3, 7, 9), 12345);
	assert.strictEqual(form.date, '2026-02-03');
	assert.strictEqual(form.time, '07:09');
	assert.strictEqual(form.routeSeed, 12345);
	assert.ok(format.toNumber(form.distance) > 0);
	assert.ok(format.parseDuration(form.duration) > 0);
	assert.ok(format.parsePace(form.pace) > 0);
	assert.ok(backgrounds.findMap(form.backgroundKey), '默认背景必须是内置地图');
	assert.strictEqual(form.showMarkers, true);
	// FIELDS 里每个 key 都要在表单里存在
	trackState.FIELDS.forEach(function (f) {
		assert.notStrictEqual(form[f.key], undefined, '缺少字段 ' + f.key);
	});
});

test('日期与时间文案', function () {
	var form = trackState.createDefaultForm(new Date(2026, 1, 3, 7, 9), 1);
	assert.strictEqual(trackState.dateLabel(form), '2月3日');
	assert.strictEqual(trackState.datetimeText(form), '2月3日 07:09');
});

test('改距离会自动更新配速、步数、卡路里', function () {
	var form = trackState.createDefaultForm(new Date(2026, 1, 3), 1);
	var auto = trackState.createAutoFlags();
	form.distance = '10.00';
	form.duration = '01:00:00';
	trackState.syncDerived(form, auto, 'distance');
	assert.strictEqual(form.pace, '6\'00"', '配速应为 6 分整');
	assert.strictEqual(form.calories, String(format.caloriesFromDistance(10, 62)));
	assert.strictEqual(form.steps, String(format.stepsFromCadence(format.toNumber(form.cadence), 3600)));
});

test('改配速会反推用时', function () {
	var form = trackState.createDefaultForm(new Date(2026, 1, 3), 1);
	var auto = trackState.createAutoFlags();
	form.distance = '5.00';
	trackState.syncDerived(form, auto, 'distance');
	form.pace = '5:30';
	trackState.syncDerived(form, auto, 'pace');
	assert.strictEqual(form.duration, '27:30', '5.5 分钟/公里 × 5 公里 = 27:30');
});

test('手动改过的字段不再被自动覆盖', function () {
	var form = trackState.createDefaultForm(new Date(2026, 1, 3), 1);
	var auto = trackState.createAutoFlags();
	form.calories = '999';
	auto.calories = false; // 模拟：用户手动编辑过卡路里
	form.steps = '12345';
	auto.steps = false;
	form.distance = '20.00';
	trackState.syncDerived(form, auto, 'distance');
	assert.strictEqual(form.calories, '999', '手动值被覆盖了');
	assert.strictEqual(form.steps, '12345', '手动值被覆盖了');
});

test('normalizeField 把各种输入规整成规范写法', function () {
	var form = trackState.createDefaultForm(new Date(2026, 1, 3), 1);

	form.distance = '5.2公里';
	trackState.normalizeField(form, 'distance');
	assert.strictEqual(form.distance, '5.20');

	form.duration = '32分15秒';
	trackState.normalizeField(form, 'duration');
	assert.strictEqual(form.duration, '32:15');

	form.pace = '5.5';
	trackState.normalizeField(form, 'pace');
	assert.strictEqual(form.pace, '5\'30"');

	form.cadence = '176.7';
	trackState.normalizeField(form, 'cadence');
	assert.strictEqual(form.cadence, '177');

	form.heartRate = 'abc';
	trackState.normalizeField(form, 'heartRate');
	assert.strictEqual(form.heartRate, '0');

	// 清空距离不应产生 NaN
	form.distance = '';
	trackState.normalizeField(form, 'distance');
	assert.strictEqual(form.distance, '0.00');

	// 清空配速时按距离与用时重算
	form.distance = '6.00';
	form.duration = '36:00';
	form.pace = '';
	trackState.normalizeField(form, 'pace');
	assert.strictEqual(form.pace, '6\'00"');
});

test('toCardStats 永远不会给出 undefined', function () {
	var form = trackState.createDefaultForm(new Date(2026, 1, 3), 1);
	var stats = trackState.toCardStats(form);
	Object.keys(stats).forEach(function (k) {
		assert.ok(stats[k] !== undefined && stats[k] !== null && stats[k] !== '', k + ' 为空');
		assert.ok(String(stats[k]).indexOf('undefined') === -1, k + ' 是 undefined');
	});
	// 空表单也要给出占位符
	var empty = trackState.toCardStats({});
	assert.strictEqual(empty.duration, '--');
	assert.strictEqual(empty.distance, '0.00');
});

test('randomize 生成的数据自洽且样式不被覆盖', function () {
	var form = trackState.createDefaultForm(new Date(2026, 1, 3), 1);
	var auto = trackState.createAutoFlags();
	form.routeStyle = 'figure8';
	form.backgroundKey = 'map4';
	auto.calories = false;

	trackState.randomize(form, auto, new Date(2026, 5, 1, 18, 30));

	assert.strictEqual(form.routeStyle, 'figure8', 'randomize 不应改轨迹样式');
	assert.strictEqual(form.backgroundKey, 'map4', 'randomize 不应改背景');
	assert.strictEqual(form.date, '2026-06-01');
	assert.strictEqual(form.time, '18:30');
	assert.strictEqual(auto.calories, true, 'randomize 后应恢复自动联动');
	assert.strictEqual(authKcalOk(form), true);
	// 配速 × 距离 ≈ 用时
	var km = format.toNumber(form.distance);
	var dur = format.parseDuration(form.duration);
	var pace = format.parsePace(form.pace);
	assert.ok(Math.abs(pace * km - dur) <= 60, '配速与用时不匹配');

	function authKcalOk(f) {
		return f.calories === String(format.caloriesFromDistance(format.toNumber(f.distance), format.toNumber(f.weight)));
	}
});

test('resetData 只重置数据，保留样式与背景', function () {
	var form = trackState.createDefaultForm(new Date(2026, 1, 3), 1);
	var auto = trackState.createAutoFlags();
	form.routeStyle = 'zigzag';
	form.routeColor = '#FF7A2F';
	form.backgroundKey = 'map3';
	form.title = '室内跑步';
	form.location = '西湖区';
	form.distance = '99.99';
	auto.steps = false;

	var fresh = trackState.resetData(form, auto, new Date(2026, 1, 3));
	assert.strictEqual(fresh.routeStyle, 'zigzag');
	assert.strictEqual(fresh.routeColor, '#FF7A2F');
	assert.strictEqual(fresh.backgroundKey, 'map3');
	assert.strictEqual(fresh.title, '室内跑步');
	assert.strictEqual(fresh.location, '西湖区');
	assert.notStrictEqual(fresh.distance, '99.99', '距离应被重置');
	assert.strictEqual(auto.steps, true, '重置后应恢复自动联动');
});

test('mergeSaved 忽略陌生字段与空值', function () {
	var defaults = trackState.createDefaultForm(new Date(2026, 1, 3), 1);
	var merged = trackState.mergeSaved(defaults, {
		distance: '7.77',
		heartRate: null,
		somethingElse: 'x',
		title: '夜间跑'
	});
	assert.strictEqual(merged.distance, '7.77');
	assert.strictEqual(merged.title, '夜间跑');
	assert.strictEqual(merged.heartRate, defaults.heartRate, 'null 不应覆盖默认值');
	assert.strictEqual(merged.somethingElse, undefined, '陌生字段不应被写入');
});

test('页面状态可以完整走一遍并能画出卡片', function () {
	var form = trackState.createDefaultForm(new Date(2026, 1, 3, 7, 9), 2024);
	var auto = trackState.createAutoFlags();
	// 模拟：用户依次编辑距离 -> 用时 -> 配速 -> 步频
	form.distance = '8.42';
	trackState.syncDerived(form, auto, 'distance');
	form.duration = '52:20';
	trackState.syncDerived(form, auto, 'duration');
	form.pace = '6:12';
	trackState.syncDerived(form, auto, 'pace');
	form.cadence = '178';
	trackState.syncDerived(form, auto, 'cadence');
	trackState.normalizeField(form, 'distance');
	trackState.normalizeField(form, 'duration');
	trackState.normalizeField(form, 'pace');

	var ctx = createRecordingContext();
	routeUtil.ROUTE_STYLES.forEach(function (style) {
		form.routeStyle = style.key;
		var bg = backgrounds.findMap(form.backgroundKey);
		trackCard.drawCard(ctx, {
			width: 750,
			height: trackCard.DESIGN.height,
			background: { type: 'image', src: bg.src, theme: bg.theme },
			route: routeUtil.buildRoute(form.routeStyle, form.routeSeed),
			routeColor: form.routeColor,
			stats: trackState.toCardStats(form),
			title: form.title,
			datetimeText: trackState.datetimeText(form),
			locationText: form.location,
			showMarkers: form.showMarkers,
			showWatermark: form.showWatermark
		});
	});
	assert.ok(ctx.calls.length > 200);
});

/* ==================== backgrounds / map-art ==================== */
group('背景素材');

test('内置地图与声明一致且文件存在', function () {
	var fs = require('fs');
	var path = require('path');
	assert.ok(backgrounds.BUILTIN_MAPS.length >= 4);
	backgrounds.BUILTIN_MAPS.forEach(function (m) {
		assert.ok(/^\/static\/maps\/map\d+\.png$/.test(m.src), '地图路径不合规: ' + m.src);
		assert.ok(m.theme === 'light' || m.theme === 'dark', '主题非法');
		var file = path.join(__dirname, '..', m.src.replace(/^\//, ''));
		assert.ok(fs.existsSync(file), '缺少地图文件: ' + file);
	});
	assert.ok(backgrounds.ROUTE_COLORS.length >= 4);
	backgrounds.ROUTE_COLORS.forEach(function (c) {
		assert.ok(/^#[0-9A-Fa-f]{6}$/.test(c.value), '颜色格式非法: ' + c.value);
	});
});

test('地图生成器输出尺寸正确且非空', function () {
	Object.keys(mapArt.STYLES).forEach(function (style) {
		var canvas = mapArt.renderMap(style, 200, 300, 5, { supersample: 1 });
		var rgb = canvas.toRGB();
		assert.strictEqual(rgb.length, 200 * 300 * 3);
		// 不能是纯色（说明什么都没画）
		var first = [rgb[0], rgb[1], rgb[2]];
		var distinct = false;
		for (var i = 0; i < rgb.length; i += 3) {
			if (rgb[i] !== first[0] || rgb[i + 1] !== first[1] || rgb[i + 2] !== first[2]) {
				distinct = true;
				break;
			}
		}
		assert.ok(distinct, style + ' 生成结果是纯色');
	});
});

test('PNG 编码输出合法文件头', function () {
	var rgb = new Uint8Array(4 * 4 * 3);
	for (var i = 0; i < rgb.length; i++) rgb[i] = i % 255;
	var png = raster.encodePng(4, 4, rgb);
	assert.strictEqual(png.readUInt32BE(0), 0x89504e47, 'PNG 签名错误');
	assert.strictEqual(png.slice(12, 16).toString('ascii'), 'IHDR');
	assert.strictEqual(png.readUInt32BE(16), 4);
	assert.strictEqual(png.readUInt32BE(20), 4);
	assert.strictEqual(png.slice(png.length - 8, png.length - 4).toString('ascii'), 'IEND');
});

/* ============================= 汇总 ============================= */

console.log('\n' + '─'.repeat(56));
if (failures.length) {
	console.log('失败 ' + failures.length + ' 项，通过 ' + passed + ' 项');
	failures.forEach(function (f) {
		console.log('\n[' + f.name + ']');
		console.log(f.error && f.error.stack);
	});
	process.exit(1);
} else {
	console.log('全部通过：' + passed + ' 项测试');
}
