/**
 * 跑步轨迹生成器
 *
 * 轨迹点使用"归一化坐标"表示：x / y 都落在 [0, 1] 区间内，
 * 其中 y 向下为正（与 canvas 一致）。由 trackCard 负责映射到画布。
 *
 * 生成流程：形状参数方程 -> 均匀重采样 -> 高斯平滑 -> 加入轻微 GPS 抖动
 * 因此每次生成都是确定性的（同一个 seed 得到同一条轨迹），便于测试与复现。
 *
 * 本文件使用 CommonJS 导出，uni-app 与 Node 脚本都能直接使用。
 */

'use strict';

/** 轨迹样式清单（供 UI 直接渲染成选项） */
var ROUTE_STYLES = [
	{ key: 'stadium', name: '操场环线' },
	{ key: 'cityLoop', name: '城市环线' },
	{ key: 'blockLoop', name: '街区矩形' },
	{ key: 'outAndBack', name: '折返路线' },
	{ key: 'serpentine', name: '蜿蜒路线' },
	{ key: 'figure8', name: '8 字路线' },
	{ key: 'zigzag', name: '往复锯齿' }
];

var TAU = Math.PI * 2;

/** 确定性随机数发生器 mulberry32 */
function createRng(seed) {
	var a = (seed >>> 0) || 1;
	return function () {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		var t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** 把 seed 打散成 32 位整数 */
function mixSeed(seed) {
	var s = Math.floor(seed) || 0;
	return (Math.imul(s, 2654435761) ^ 0x9e3779b9) >>> 0;
}

/** 按累计弧长把点列均匀重采样到 count 个点 */
function resample(points, count) {
	if (points.length < 2 || count < 2) return points.slice();
	var cum = [0];
	var total = 0;
	for (var i = 1; i < points.length; i++) {
		var dx = points[i].x - points[i - 1].x;
		var dy = points[i].y - points[i - 1].y;
		total += Math.sqrt(dx * dx + dy * dy);
		cum.push(total);
	}
	if (total === 0) return points.slice();
	var out = [];
	for (var k = 0; k < count; k++) {
		var target = (total * k) / (count - 1);
		var j = 1;
		while (j < cum.length - 1 && cum[j] < target) j++;
		var seg = cum[j] - cum[j - 1] || 1;
		var t = (target - cum[j - 1]) / seg;
		out.push({
			x: points[j - 1].x + (points[j].x - points[j - 1].x) * t,
			y: points[j - 1].y + (points[j].y - points[j - 1].y) * t
		});
	}
	return out;
}

/** 高斯平滑；closed 为 true 时按环形处理（首尾相接的环线） */
function smooth(points, radius, closed) {
	if (radius <= 0 || points.length < 3) return points.slice();
	var n = points.length;
	var out = new Array(n);
	for (var i = 0; i < n; i++) {
		var sx = 0;
		var sy = 0;
		var wsum = 0;
		for (var d = -radius; d <= radius; d++) {
			var idx = i + d;
			if (closed) {
				idx = ((idx % n) + n) % n;
			} else {
				idx = Math.max(0, Math.min(n - 1, idx));
			}
			var w = 1 - Math.abs(d) / (radius + 1);
			sx += points[idx].x * w;
			sy += points[idx].y * w;
			wsum += w;
		}
		out[i] = { x: sx / wsum, y: sy / wsum };
	}
	return out;
}

/** 加入轻微 GPS 抖动（不改变整体形状）；开放轨迹首尾锚定 */
function jitter(points, amount, rng, closed) {
	if (amount <= 0) return points.slice();
	var n = points.length;
	return points.map(function (p, i) {
		var scale = 1;
		if (!closed) {
			scale = Math.min(1, Math.min(i, n - 1 - i) / 6);
		}
		return {
			x: p.x + (rng() - 0.5) * amount * scale,
			y: p.y + (rng() - 0.5) * amount * scale
		};
	});
}

/** 采样参数方程 f(t)，t 从 0 到 1 */
function sampleParam(f, steps) {
	var pts = [];
	for (var i = 0; i <= steps; i++) {
		pts.push(f(i / steps));
	}
	return pts;
}

/** 圆弧采样（角度制，canvas 坐标系，y 向下） */
function arcPoints(cx, cy, r, a0, a1, steps) {
	var pts = [];
	for (var i = 0; i <= steps; i++) {
		var a = (a0 + (a1 - a0) * (i / steps)) * Math.PI / 180;
		pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
	}
	return pts;
}

/** 线段采样（便于后续统一重采样） */
function linePoints(x0, y0, x1, y1, steps) {
	var pts = [];
	for (var i = 0; i <= steps; i++) {
		var t = i / steps;
		pts.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t });
	}
	return pts;
}

/* ------------------------------------------------------------------ *
 * 各种轨迹形状：在各参数空间里生成，最后统一归一化到 [0,1]
 * ------------------------------------------------------------------ */

/** 操场跑道：超椭圆，n 越大越接近圆角矩形 */
function shapeStadium(rng) {
	var n = 5.5 + rng() * 2.5;
	var a = 0.5;
	var b = 0.36;
	var wobble = 0.012 + rng() * 0.02;
	var p1 = rng() * TAU;
	var p2 = rng() * TAU;
	return sampleParam(function (t) {
		var ang = t * TAU;
		var c = Math.cos(ang);
		var s = Math.sin(ang);
		var x = a * (c < 0 ? -1 : 1) * Math.pow(Math.abs(c), 2 / n);
		var y = b * (s < 0 ? -1 : 1) * Math.pow(Math.abs(s), 2 / n);
		var k = 1 + wobble * Math.sin(ang * 3 + p1) + wobble * 0.6 * Math.sin(ang * 7 + p2);
		return { x: 0.5 + x * k, y: 0.5 + y * k };
	}, 240);
}

/** 城市环线：极坐标多频扰动形成的自然闭合环 */
function shapeCityLoop(rng) {
	var k1 = 2 + Math.floor(rng() * 3);
	var k2 = k1 + 2 + Math.floor(rng() * 3);
	var k3 = k2 + 3;
	var p1 = rng() * TAU;
	var p2 = rng() * TAU;
	var p3 = rng() * TAU;
	var amp1 = 0.1 + rng() * 0.1;
	var amp2 = 0.05 + rng() * 0.06;
	var amp3 = 0.02 + rng() * 0.03;
	var rx = 0.34 + rng() * 0.05;
	var ry = rx * (0.78 + rng() * 0.2);
	return sampleParam(function (t) {
		var ang = t * TAU;
		var r = 1 + amp1 * Math.sin(k1 * ang + p1) + amp2 * Math.sin(k2 * ang + p2) +
			amp3 * Math.sin(k3 * ang + p3);
		return { x: rx * r * Math.cos(ang), y: ry * r * Math.sin(ang) };
	}, 260);
}

/** 街区矩形：绕着街区跑一圈的圆角矩形 */
function shapeBlockLoop(rng) {
	var w = 0.36 + rng() * 0.06;
	var h = 0.3 + rng() * 0.06;
	var r = Math.min(0.06 + rng() * 0.03, Math.min(w, h) * 0.35);
	// 每条边轻微的倾斜 / 弧度，看起来更像真实街区
	var skew = (rng() - 0.5) * 0.08;
	var pts = [];
	// 下边中点 -> 右下角
	pts = pts.concat(linePoints(0, h, w - r, h, 14));
	pts = pts.concat(arcPoints(w - r, h - r, r, 90, 0, 10));
	// 右边（下 -> 上）
	pts = pts.concat(linePoints(w, h - r, w, -h + r, 26));
	pts = pts.concat(arcPoints(w - r, -h + r, r, 0, -90, 10));
	// 上边（右 -> 左），带一点弧度
	var top = [];
	for (var i = 0; i <= 26; i++) {
		var t = i / 26;
		top.push({
			x: (w - r) + (-w + r - (w - r)) * t,
			y: -h + skew * Math.sin(Math.PI * t) * 0.6
		});
	}
	pts = pts.concat(top);
	pts = pts.concat(arcPoints(-w + r, -h + r, r, -90, -180, 10));
	// 左边（上 -> 下）
	pts = pts.concat(linePoints(-w, -h + r, -w, h - r, 26));
	pts = pts.concat(arcPoints(-w + r, h - r, r, 180, 90, 10));
	// 回到下边中点
	pts = pts.concat(linePoints(-w + r, h, 0, h, 14));
	return pts;
}

/** 折返路线：去程与回程沿同一条走廊，带一点横向偏移 */
function shapeOutAndBack(rng) {
	var f1 = 1.5 + rng() * 1.5;
	var f2 = 3 + rng() * 3;
	var p1 = rng() * TAU;
	var p2 = rng() * TAU;
	var len = 0.44 + rng() * 0.04;
	var half = 0.16 + rng() * 0.05;
	var gap = 0.03 + rng() * 0.02;
	function spineY(t) {
		return half * Math.sin(f1 * Math.PI * t + p1) * 0.55;
	}
	var out = [];
	var back = [];
	var steps = 130;
	for (var i = 0; i <= steps; i++) {
		var t = i / steps;
		var x = -len + 2 * len * t;
		var y = spineY(t);
		var off = gap * (1 + 0.4 * Math.sin(f2 * Math.PI * t + p2));
		out.push({ x: x, y: y - off });
		back.push({ x: x, y: y + off });
	}
	back.reverse();
	return out.concat(back);
}

/** 蜿蜒路线：竖向蛇形，像在小区里来回跑 */
function shapeSerpentine(rng) {
	var lobes = 2.5 + rng() * 2;
	var amp = 0.16 + rng() * 0.08;
	var phase = rng() * TAU;
	var drift = (rng() - 0.5) * 0.16;
	var halfH = 0.4 + rng() * 0.04;
	return sampleParam(function (t) {
		return {
			x: amp * Math.sin(lobes * Math.PI * t + phase) + drift * t,
			y: -halfH + 2 * halfH * t
		};
	}, 220);
}

/** 8 字路线（Gerono 双纽线，可旋转） */
function shapeFigure8(rng) {
	var a = 0.44 + rng() * 0.04;
	var b = 0.3 + rng() * 0.06;
	var rot = rng() * TAU;
	var cos = Math.cos(rot);
	var sin = Math.sin(rot);
	return sampleParam(function (t) {
		var ang = t * TAU;
		var x = a * Math.cos(ang);
		var y = b * Math.sin(2 * ang);
		return { x: x * cos - y * sin, y: x * sin + y * cos };
	}, 280);
}

/** 往复锯齿：折返冲刺式的轨迹 */
function shapeZigzag(rng) {
	var teeth = 3 + Math.floor(rng() * 3);
	var amp = 0.3 + rng() * 0.08;
	var halfH = 0.34 + rng() * 0.06;
	var rows = teeth * 2;
	var pts = [];
	for (var r = 0; r <= rows; r++) {
		var y = -halfH + (2 * halfH * r) / rows;
		var dir = r % 2 === 0 ? 1 : -1;
		pts.push({ x: dir * amp, y: y });
		if (r < rows) {
			pts.push({ x: dir * amp, y: y + halfH / rows * 0.4 });
		}
	}
	return pts;
}

var SHAPES = {
	stadium: shapeStadium,
	cityLoop: shapeCityLoop,
	blockLoop: shapeBlockLoop,
	outAndBack: shapeOutAndBack,
	serpentine: shapeSerpentine,
	figure8: shapeFigure8,
	zigzag: shapeZigzag
};

var CLOSED = {
	stadium: true,
	cityLoop: true,
	blockLoop: true,
	figure8: true,
	outAndBack: false,
	serpentine: false,
	zigzag: false
};

/**
 * 生成一条轨迹
 * @param {String} style ROUTE_STYLES 中的 key（非法值回退为 stadium）
 * @param {Number} seed  随机种子，同一个种子结果一致
 * @param {Object} [options] { points:Number 采样点数, noise:Number 抖动强度 }
 * @returns {Array<{x:Number,y:Number}>} 归一化到 [0,1] 的点序列
 */
function buildRoute(style, seed, options) {
	options = options || {};
	var rng = createRng(mixSeed(seed === undefined ? 1 : seed));
	var key = SHAPES[style] ? style : 'stadium';
	var closed = !!CLOSED[key];
	var pts = SHAPES[key](rng);
	pts = resample(pts, options.points || 150);
	pts = smooth(pts, closed ? 4 : 3, closed);
	pts = jitter(pts, options.noise === undefined ? 0.006 : options.noise, rng, closed);
	return normalize(pts);
}

/** 把任意点集平移缩放到 [0,1] × [0,1]（保持长宽比，居中） */
function normalize(points) {
	if (!points.length) return [];
	var minX = Infinity;
	var maxX = -Infinity;
	var minY = Infinity;
	var maxY = -Infinity;
	for (var i = 0; i < points.length; i++) {
		var p = points[i];
		if (p.x < minX) minX = p.x;
		if (p.x > maxX) maxX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.y > maxY) maxY = p.y;
	}
	var w = maxX - minX;
	var h = maxY - minY;
	var scale = Math.max(w, h);
	if (!(scale > 0)) scale = 1;
	var ox = (1 - w / scale) / 2;
	var oy = (1 - h / scale) / 2;
	return points.map(function (p) {
		return { x: (p.x - minX) / scale + ox, y: (p.y - minY) / scale + oy };
	});
}

/**
 * 把归一化轨迹映射到画布矩形区域（保持长宽比、居中，四周留边）
 * @param {Array} points 归一化点
 * @param {{x:Number,y:Number,w:Number,h:Number}} box 目标矩形
 */
function fitToBox(points, box) {
	if (!points || !points.length) return [];
	var s = Math.min(box.w, box.h) * 0.96;
	var ox = box.x + (box.w - s) / 2;
	var oy = box.y + (box.h - s) / 2;
	return points.map(function (p) {
		return { x: ox + p.x * s, y: oy + p.y * s };
	});
}

/** 轨迹总长度（归一化单位，用于合理性检查） */
function pathLength(points) {
	var total = 0;
	for (var i = 1; i < points.length; i++) {
		var dx = points[i].x - points[i - 1].x;
		var dy = points[i].y - points[i - 1].y;
		total += Math.sqrt(dx * dx + dy * dy);
	}
	return total;
}

module.exports = {
	ROUTE_STYLES: ROUTE_STYLES,
	createRng: createRng,
	mixSeed: mixSeed,
	buildRoute: buildRoute,
	normalize: normalize,
	fitToBox: fitToBox,
	pathLength: pathLength,
	smooth: smooth,
	resample: resample
};
