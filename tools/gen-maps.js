/**
 * 生成内置示意地图素材：static/maps/map1..6.png
 *
 * 用法： node tools/gen-maps.js
 *
 * 尺寸与轨迹卡的画布比例一致（750 × 1120，即 3:4.48），
 * 这样在卡片里以 cover 方式铺满时不会被裁切。
 */

'use strict';

var fs = require('fs');
var path = require('path');
var mapArt = require('./map-art.js');
var raster = require('./raster.js');

var WIDTH = 750;
var HEIGHT = 1120;

/** 与 common/backgrounds.js 中的 BUILTIN_MAPS 一一对应 */
var MAPS = [
	{ file: 'map1.png', style: 'gridLight', seed: 1101, dark: false },
	{ file: 'map2.png', style: 'cityPark', seed: 2202, dark: false },
	{ file: 'map3.png', style: 'riverside', seed: 3303, dark: false },
	{ file: 'map4.png', style: 'gridDark', seed: 4404, dark: true },
	{ file: 'map5.png', style: 'lakeRural', seed: 5505, dark: false },
	{ file: 'map6.png', style: 'newTown', seed: 6606, dark: false }
];

function main() {
	var outDir = path.join(__dirname, '..', 'static', 'maps');
	if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

	var total = 0;
	MAPS.forEach(function (m) {
		var t0 = Date.now();
		var canvas = mapArt.renderMap(m.style, WIDTH, HEIGHT, m.seed, { dark: m.dark, supersample: 2 });
		var png = raster.encodePng(WIDTH, HEIGHT, canvas.toRGB());
		var target = path.join(outDir, m.file);
		fs.writeFileSync(target, png);
		total += png.length;
		console.log(
			'  ' + m.file.padEnd(10) + m.style.padEnd(12) +
			String(Math.round(png.length / 1024)).padStart(4) + ' KB   ' +
			(Date.now() - t0) + ' ms'
		);
	});
	console.log('共 ' + MAPS.length + ' 张，合计 ' + Math.round(total / 1024) + ' KB -> ' + outDir);
}

main();
