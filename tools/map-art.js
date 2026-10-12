/**
 * 示意地图生成器（离线素材生成）
 *
 * 六种风格的底图，全部由几何图形拼出（路网、街区、建筑、水系、绿地），
 * 不含任何真实地理数据，因此可以随仓库自由分发。
 * 生成结果是确定性的：同一个 seed 出来的图完全一致。
 */

'use strict';

var raster = require('./raster.js');
var routeUtil = require('../common/route.js');

/* ------------------------------ 配色 ------------------------------ */

var PALETTES = {
	light: {
		land: '#F2F1EC',
		building: '#DFDBD4',
		buildingEdge: '#D3CEC6',
		roadCasing: '#E4E2DB',
		road: '#FFFFFF',
		roadMainCasing: '#E8D9A6',
		roadMain: '#FFF4CC',
		path: '#F4F2EC',
		water: '#AAD3DF',
		waterDeep: '#9BC6D3',
		park: '#CFEBB4',
		parkDeep: '#BFE3A0',
		field: '#E9EFD6',
		rail: '#C6C3BB',
		plaza: '#EDEAE3'
	},
	dark: {
		land: '#1C2026',
		building: '#262C34',
		buildingEdge: '#2E353E',
		roadCasing: '#2A3038',
		road: '#3B434E',
		roadMainCasing: '#3A3529',
		roadMain: '#5E5228',
		path: '#333A43',
		water: '#16323F',
		waterDeep: '#12303D',
		park: '#1D3527',
		parkDeep: '#22402E',
		field: '#233028',
		rail: '#3A4149',
		plaza: '#242A31'
	}
};

/* ---------------------------- 小工具 ---------------------------- */

/** 把区间 [0,total] 切成长度抖动的若干段，返回分割点（count+1 个） */
function axisLines(rng, total, count, jitter) {
	var j = jitter === undefined ? 0.35 : jitter;
	var raw = [0];
	var acc = 0;
	for (var i = 1; i < count; i++) {
		acc += 1 + (rng() - 0.5) * 2 * j;
		raw.push(acc);
	}
	raw.push(acc + 1);
	var scale = total / raw[raw.length - 1];
	return raw.map(function (v) { return v * scale; });
}

/** 带轻微起伏的道路折线；horizontal=true 表示沿 x 方向走 */
function wavyLine(rng, offset, from, to, amp, horizontal) {
	var ctrl = [];
	var n = 4;
	for (var i = 0; i <= n; i++) {
		var t = i / n;
		var along = from + (to - from) * t;
		var off = (rng() - 0.5) * amp * 2;
		ctrl.push(horizontal ? [along, offset + off] : [offset + off, along]);
	}
	return raster.spline(ctrl, 10);
}

/** 画一条路：先描边（casing）再填色 */
function drawRoad(canvas, pts, width, fill, casing) {
	if (casing) canvas.strokePolyline(pts, width + 3.5, casing, 'round');
	canvas.strokePolyline(pts, width, fill, 'round');
}

/** 生成一个自然形状的团块（用于公园 / 湖泊） */
function blob(rng, cx, cy, rx, ry, wobble, count) {
	var n = count || 22;
	var pts = [];
	var p1 = rng() * 6.283;
	var p2 = rng() * 6.283;
	for (var i = 0; i < n; i++) {
		var a = (i / n) * Math.PI * 2;
		var k = 1 + wobble * Math.sin(3 * a + p1) + wobble * 0.6 * Math.sin(5 * a + p2);
		pts.push([cx + rx * k * Math.cos(a), cy + ry * k * Math.sin(a)]);
	}
	return raster.closedSpline(pts, 8);
}

/** 在矩形单元格里铺建筑 */
function fillBuildings(canvas, rng, x0, y0, x1, y1, pal, density) {
	var w = x1 - x0;
	var h = y1 - y0;
	if (w < 26 || h < 26) return;
	var cols = Math.max(1, Math.round(w / (34 + rng() * 26)));
	var rows = Math.max(1, Math.round(h / (34 + rng() * 26)));
	var cw = w / cols;
	var ch = h / rows;
	for (var i = 0; i < cols; i++) {
		for (var j = 0; j < rows; j++) {
			if (rng() > (density === undefined ? 0.82 : density)) continue;
			var padX = 4 + rng() * 7;
			var padY = 4 + rng() * 7;
			var bx = x0 + i * cw + padX;
			var by = y0 + j * ch + padY;
			var bw = cw - padX * 2;
			var bh = ch - padY * 2;
			if (bw < 8 || bh < 8) continue;
			canvas.fillRoundRect(bx, by, bw, bh, 1.5, pal.building);
			// 顶部一条略深的小边，制造轻微立体感
			canvas.fillRoundRect(bx, by, bw, Math.min(3, bh * 0.16), 1, pal.buildingEdge);
		}
	}
}

/** 取折线的中点序列（上下岸 -> 河道中心线） */
function midLine(a, b) {
	var n = Math.min(a.length, b.length);
	var out = [];
	for (var i = 0; i < n; i++) out.push([(a[i][0] + b[i][0]) / 2, (a[i][1] + b[i][1]) / 2]);
	return out;
}

/* ---------------------------- 各种风格 ---------------------------- */

/** 浅色街区：不规则路网 + 大量建筑 */
function styleGridLight(canvas, rng, W, H, pal) {
	canvas.fillRect(0, 0, W, H, pal.land);
	// 一块城市绿地
	var park = blob(rng, W * 0.72, H * 0.15, W * 0.17, H * 0.07, 0.16);
	canvas.fillPoly(park, pal.park);
	var xs = axisLines(rng, W, 5 + Math.floor(rng() * 2));
	var ys = axisLines(rng, H, 7 + Math.floor(rng() * 2));
	var i;
	var j;
	// 先把街区铺满建筑，路网稍后压在上面
	for (i = 0; i + 1 < xs.length; i++) {
		for (j = 0; j + 1 < ys.length; j++) {
			fillBuildings(canvas, rng, xs[i] + 11, ys[j] + 11, xs[i + 1] - 11, ys[j + 1] - 11, pal);
		}
	}
	// 次要道路
	for (i = 1; i + 1 < xs.length; i++) {
		drawRoad(canvas, wavyLine(rng, xs[i], -18, H + 18, 3.5, false), 8, pal.road, pal.roadCasing);
	}
	for (i = 1; i + 1 < ys.length; i++) {
		drawRoad(canvas, wavyLine(rng, ys[i], -18, W + 18, 3.5, true), 8, pal.road, pal.roadCasing);
	}
	// 一条主干道（竖向）
	drawRoad(canvas, wavyLine(rng, xs[Math.floor(xs.length / 2)], -18, H + 18, 5, false), 19, pal.roadMain, pal.roadMainCasing);
	// 绿地里的散步道
	for (i = 0; i < 3; i++) {
		drawRoad(canvas, wavyLine(rng, W * 0.6 + i * W * 0.09, H * 0.07, H * 0.26, 12, false), 4, pal.path);
	}
}

/** 城市公园：大片绿地 + 蜿蜒步道 + 小湖 */
function styleCityPark(canvas, rng, W, H, pal) {
	canvas.fillRect(0, 0, W, H, pal.land);
	canvas.fillPoly(blob(rng, W * 0.5, H * 0.5, W * 0.42, H * 0.32, 0.12, 26), pal.park);
	canvas.fillPoly(blob(rng, W * 0.22, H * 0.2, W * 0.16, H * 0.09, 0.2, 18), pal.parkDeep);
	canvas.fillPoly(blob(rng, W * 0.62, H * 0.42, W * 0.13, H * 0.055, 0.22, 18), pal.water);
	var i;
	// 园内步道
	for (i = 0; i < 5; i++) {
		drawRoad(canvas, wavyLine(rng, H * (0.12 + i * 0.19), -18, W + 18, 18, true), 4.5, pal.path);
	}
	for (i = 0; i < 3; i++) {
		drawRoad(canvas, wavyLine(rng, W * (0.16 + i * 0.34), H * 0.05, H * 0.95, 22, false), 4.5, pal.path);
	}
	// 外围道路
	var xs = axisLines(rng, W, 4);
	var ys = axisLines(rng, H, 5);
	for (i = 1; i + 1 < xs.length; i++) drawRoad(canvas, wavyLine(rng, xs[i], -18, H + 18, 4, false), 9, pal.road, pal.roadCasing);
	for (i = 1; i + 1 < ys.length; i++) drawRoad(canvas, wavyLine(rng, ys[i], -18, W + 18, 4, true), 9, pal.road, pal.roadCasing);
	drawRoad(canvas, wavyLine(rng, 0, -18, H + 18, 6, false), 15, pal.roadMain, pal.roadMainCasing);
	// 边缘建筑
	fillBuildings(canvas, rng, 12, 12, W * 0.16, H * 0.2, pal, 0.7);
	fillBuildings(canvas, rng, W * 0.84, H * 0.7, W - 12, H - 12, pal, 0.7);
	fillBuildings(canvas, rng, W * 0.8, 20, W - 14, H * 0.16, pal, 0.6);
}

/** 滨水绿道：一条河 + 两岸道路 + 桥 */
function styleRiverside(canvas, rng, W, H, pal) {
	canvas.fillRect(0, 0, W, H, pal.land);
	// 由上下两岸控制点围成河道
	var upper = [];
	var lower = [];
	var n = 7;
	for (var i = 0; i <= n; i++) {
		var t = i / n;
		var y = -40 + (H + 80) * t;
		var cx = W * 0.46 + Math.sin(t * 3.1 + 0.6) * W * 0.16 + (rng() - 0.5) * 12;
		var half = W * (0.075 + 0.035 * Math.sin(t * 2.2));
		upper.push([cx - half, y]);
		lower.push([cx + half, y]);
	}
	var upperLine = raster.spline(upper, 12);
	var lowerLine = raster.spline(lower, 12);
	canvas.fillPoly(upperLine.concat(lowerLine.slice().reverse()), pal.water);
	// 河道中间的深水槽
	canvas.strokePolyline(midLine(upperLine, lowerLine), W * 0.09, pal.waterDeep, 'round');
	// 两岸绿带
	canvas.strokePolyline(upperLine.map(function (p) { return [p[0] - 16, p[1]]; }), 34, pal.park, 'round');
	canvas.strokePolyline(lowerLine.map(function (p) { return [p[0] + 16, p[1]]; }), 34, pal.park, 'round');
	// 沿岸道路
	drawRoad(canvas, upperLine.map(function (p) { return [p[0] - 30, p[1]]; }), 9, pal.road, pal.roadCasing);
	drawRoad(canvas, lowerLine.map(function (p) { return [p[0] + 30, p[1]]; }), 9, pal.road, pal.roadCasing);
	// 桥
	for (var b = 0; b < 2; b++) {
		var idx = Math.min(upperLine.length - 1, Math.round((0.28 + b * 0.4 + rng() * 0.06) * (upperLine.length - 1)));
		var x0 = upperLine[idx][0] - 40;
		var x1 = lowerLine[idx][0] + 40;
		var y0 = upperLine[idx][1];
		drawRoad(canvas, [[x0, y0], [x1, y0 + 5]], 16, pal.roadMain, pal.roadMainCasing);
	}
	// 支路
	var xs = axisLines(rng, W, 5);
	for (var k = 1; k + 1 < xs.length; k++) {
		drawRoad(canvas, wavyLine(rng, xs[k], -18, H + 18, 4, false), 8, pal.road, pal.roadCasing);
	}
	// 街区建筑
	fillBuildings(canvas, rng, 10, 10, W * 0.3, H * 0.22, pal, 0.75);
	fillBuildings(canvas, rng, W * 0.62, H * 0.72, W - 10, H - 10, pal, 0.75);
	fillBuildings(canvas, rng, W * 0.68, H * 0.12, W - 12, H * 0.32, pal, 0.7);
}

/** 夜间街道：暗色底图（路网结构同浅色街区） */
function styleGridDark(canvas, rng, W, H, pal) {
	styleGridLight(canvas, rng, W, H, pal);
}

/** 湖畔郊野：大湖 + 田块 + 乡道 */
function styleLakeRural(canvas, rng, W, H, pal) {
	canvas.fillRect(0, 0, W, H, pal.land);
	// 田块
	for (var f = 0; f < 14; f++) {
		var x = rng() * W;
		var y = rng() * H;
		var w = 60 + rng() * 110;
		var h = 45 + rng() * 80;
		var rot = (rng() - 0.5) * 0.5;
		var corners = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
		var pts = [];
		for (var c = 0; c < 4; c++) {
			pts.push([
				x + corners[c][0] * Math.cos(rot) - corners[c][1] * Math.sin(rot),
				y + corners[c][0] * Math.sin(rot) + corners[c][1] * Math.cos(rot)
			]);
		}
		canvas.fillPoly(pts, rng() > 0.5 ? pal.field : pal.parkDeep);
	}
	// 大湖
	canvas.fillPoly(blob(rng, W * 0.52, H * 0.44, W * 0.33, H * 0.22, 0.14, 26), pal.water);
	canvas.fillPoly(blob(rng, W * 0.58, H * 0.46, W * 0.16, W * 0.06, 0.2, 18), pal.waterDeep);
	// 环湖乡道
	var ringCtrl = blob(rng, W * 0.52, H * 0.44, W * 0.42, H * 0.3, 0.08, 20);
	drawRoad(canvas, raster.closedSpline(ringCtrl.filter(function (_, i) { return i % 3 === 0; }), 10), 7, pal.road, pal.roadCasing);
	drawRoad(canvas, wavyLine(rng, H * 0.12, -20, W + 20, 16, true), 8, pal.road, pal.roadCasing);
	drawRoad(canvas, wavyLine(rng, H * 0.88, -20, W + 20, 16, true), 8, pal.road, pal.roadCasing);
	// 小村落
	fillBuildings(canvas, rng, 16, H * 0.72, W * 0.26, H - 20, pal, 0.6);
	fillBuildings(canvas, rng, W * 0.72, 20, W - 20, H * 0.16, pal, 0.55);
}

/** 网格新城：规整方格 + 中轴大道 + 中央广场 */
function styleNewTown(canvas, rng, W, H, pal) {
	canvas.fillRect(0, 0, W, H, pal.land);
	var cols = 4;
	var rows = 6;
	var xs = [];
	var ys = [];
	var i;
	var j;
	for (i = 0; i <= cols; i++) xs.push((W * i) / cols);
	for (i = 0; i <= rows; i++) ys.push((H * i) / rows);
	// 街区
	for (i = 0; i < cols; i++) {
		for (j = 0; j < rows; j++) {
			if (rng() > 0.88) {
				canvas.fillRoundRect(xs[i] + 14, ys[j] + 14, xs[i + 1] - xs[i] - 28, ys[j + 1] - ys[j] - 28, 6, pal.park);
			} else {
				fillBuildings(canvas, rng, xs[i] + 16, ys[j] + 16, xs[i + 1] - 16, ys[j + 1] - 16, pal, 0.9);
			}
		}
	}
	for (i = 1; i < cols; i++) drawRoad(canvas, [[xs[i], -20], [xs[i], H + 20]], 11, pal.road, pal.roadCasing);
	for (i = 1; i < rows; i++) drawRoad(canvas, [[-20, ys[i]], [W + 20, ys[i]]], 11, pal.road, pal.roadCasing);
	// 中轴大道（斜向）
	drawRoad(canvas, raster.spline([[W * 0.06, H * 0.96], [W * 0.36, H * 0.6], [W * 0.62, H * 0.34], [W * 0.94, H * 0.06]], 14), 20, pal.roadMain, pal.roadMainCasing);
	// 中央广场
	canvas.fillCircle(W * 0.5, H * 0.5, 62, pal.plaza);
	canvas.fillCircle(W * 0.5, H * 0.5, 44, pal.parkDeep);
	canvas.fillCircle(W * 0.5, H * 0.5, 20, pal.plaza);
}

var STYLES = {
	gridLight: styleGridLight,
	cityPark: styleCityPark,
	riverside: styleRiverside,
	gridDark: styleGridDark,
	lakeRural: styleLakeRural,
	newTown: styleNewTown
};

/**
 * 生成一张示意地图
 * @param {String} style STYLES 中的 key
 * @param {Number} width
 * @param {Number} height
 * @param {Number} seed
 * @param {Object} [options] { dark:Boolean, supersample:Number }
 * @returns {Object} raster canvas
 */
function renderMap(style, width, height, seed, options) {
	options = options || {};
	var pal = options.dark ? PALETTES.dark : PALETTES.light;
	var canvas = raster.createCanvas(width, height, options.supersample === undefined ? 2 : options.supersample);
	var rng = routeUtil.createRng(routeUtil.mixSeed(seed));
	var fn = STYLES[style] || STYLES.gridLight;
	fn(canvas, rng, width, height, pal);
	return canvas;
}

module.exports = {
	PALETTES: PALETTES,
	STYLES: STYLES,
	renderMap: renderMap
};
