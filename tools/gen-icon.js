/**
 * 生成 Android 启动图标
 * 输出到 tools/android-webview/res/ 下各 mipmap 密度目录的 ic_launcher.png
 *
 * 用法： node tools/gen-icon.js
 *
 * 图案 = 浅色街区底图 + 一条绿色环线轨迹 + 起点标记，
 * 和页面里的"轨迹分享卡"呼应，缩到 48px 也能认出是"跑步轨迹"。
 */

'use strict';

var fs = require('fs');
var path = require('path');
var raster = require('./raster.js');
var routeUtil = require('../common/route.js');

var PALETTE = {
	land: '#F2F1EC',
	block: '#E4E1DA',
	road: '#FFFFFF',
	park: '#CFEBB4',
	route: '#0EBA3A',
	casing: 'rgba(255,255,255,0.95)'
};

/** 画一张图标（正方形，尺寸为 size） */
function renderIcon(size) {
	var ss = 4; // 图标小，用 4 倍超采样保证边缘干净
	var c = raster.createCanvas(size, size, ss);
	var rng = routeUtil.createRng(routeUtil.mixSeed(20240203));

	// 底：浅色地图
	c.fillRect(0, 0, size, size, PALETTE.land);

	// 一小块绿地
	c.fillRoundRect(size * 0.62, size * 0.08, size * 0.3, size * 0.2, size * 0.05, PALETTE.park);

	// 街区里的建筑
	for (var i = 0; i < 26; i++) {
		var bw = size * (0.05 + rng() * 0.07);
		var bh = size * (0.04 + rng() * 0.06);
		var bx = rng() * (size - bw);
		var by = rng() * (size - bh);
		c.fillRoundRect(bx, by, bw, bh, size * 0.008, PALETTE.block);
	}

	// 两条路
	c.strokePolyline([[size * 0.02, size * 0.34], [size * 0.98, size * 0.3]], size * 0.035, PALETTE.road, 'butt');
	c.strokePolyline([[size * 0.72, size * 0.02], [size * 0.68, size * 0.98]], size * 0.035, PALETTE.road, 'butt');

	// 轨迹：操场环线
	var pts = routeUtil.buildRoute('stadium', 7, { noise: 0.003 });
	var pad = size * 0.2;
	var box = { x: pad, y: pad * 1.06, w: size - pad * 2, h: size - pad * 2.12 };
	var mapped = routeUtil.fitToBox(pts, box);

	c.strokePolyline(mapped, size * 0.115, PALETTE.casing, 'round');  // 白色描边
	var poly = mapped.map(function (p) { return [p.x, p.y]; });
	c.strokePolyline(poly, size * 0.075, PALETTE.route, 'round');      // 绿色主线

	// 起点标记
	var start = poly[0];
	c.fillCircle(start[0], start[1], size * 0.055, '#FFFFFF');
	c.fillCircle(start[0], start[1], size * 0.034, PALETTE.route);

	return c;
}

function main() {
	var base = path.join(__dirname, 'android-webview', 'res');
	var targets = [
		{ dir: 'mipmap-mdpi', size: 48 },
		{ dir: 'mipmap-hdpi', size: 72 },
		{ dir: 'mipmap-xhdpi', size: 96 },
		{ dir: 'mipmap-xxhdpi', size: 144 },
		{ dir: 'mipmap-xxxhdpi', size: 192 }
	];
	targets.forEach(function (t) {
		var outDir = path.join(base, t.dir);
		if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
		var canvas = renderIcon(t.size);
		var png = raster.encodePng(t.size, t.size, canvas.toRGB());
		fs.writeFileSync(path.join(outDir, 'ic_launcher.png'), png);
		console.log('  ' + t.dir.padEnd(16) + t.size + 'x' + t.size + '  ' + png.length + ' bytes');
	});
	console.log('图标已写入 ' + base);
}

main();
