/**
 * 极简软件光栅化工具（仅用于离线生成素材与预览图，不参与 App 运行）
 *
 * 提供：RGB 画布、常用图形绘制、超采样抗锯齿、PNG 编码。
 * 之所以自己实现而不引入 canvas / sharp 依赖，是为了让仓库保持"零 npm 依赖"，
 * 克隆下来只要有 Node 就能重新生成 static/maps/*.png。
 */

'use strict';

var zlib = require('zlib');

/* ----------------------------- 颜色解析 ----------------------------- */

var colorCache = Object.create(null);

/**
 * 支持 '#RGB' / '#RRGGBB' / '#RRGGBBAA' / 'rgb(r,g,b)' / 'rgba(r,g,b,a)'
 * @returns {Array} [r,g,b,a] 其中 rgb 为 0-255，a 为 0-1
 */
function parseColor(input) {
	if (Array.isArray(input)) return input;
	var key = String(input);
	if (colorCache[key]) return colorCache[key];
	var out = [0, 0, 0, 1];
	var s = key.trim();
	var m;
	if (s.charAt(0) === '#') {
		var hex = s.slice(1);
		if (hex.length === 3) {
			hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2);
		}
		if (hex.length === 6 || hex.length === 8) {
			out = [
				parseInt(hex.slice(0, 2), 16),
				parseInt(hex.slice(2, 4), 16),
				parseInt(hex.slice(4, 6), 16),
				hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1
			];
		}
	} else if ((m = /^rgba?\(([^)]+)\)$/.exec(s))) {
		var parts = m[1].split(',').map(function (v) { return parseFloat(v); });
		out = [parts[0] || 0, parts[1] || 0, parts[2] || 0, parts.length > 3 ? parts[3] : 1];
	}
	colorCache[key] = out;
	return out;
}

/* ------------------------------ 画布 ------------------------------ */

/**
 * @param {Number} width  逻辑宽度
 * @param {Number} height 逻辑高度
 * @param {Number} [ss]   超采样倍数，默认 2
 */
function createCanvas(width, height, ss) {
	var scale = ss || 2;
	var W = Math.round(width * scale);
	var H = Math.round(height * scale);
	var data = new Uint8ClampedArray(W * H * 3);
	var canvas = {
		width: width,
		height: height,
		scale: scale,
		deviceWidth: W,
		deviceHeight: H,
		data: data
	};

	function blend(x, y, color) {
		var xi = x | 0;
		var yi = y | 0;
		if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
		var c = parseColor(color);
		var a = c[3];
		if (a <= 0) return;
		var i = (yi * W + xi) * 3;
		if (a >= 1) {
			data[i] = c[0];
			data[i + 1] = c[1];
			data[i + 2] = c[2];
			return;
		}
		data[i] = data[i] * (1 - a) + c[0] * a;
		data[i + 1] = data[i + 1] * (1 - a) + c[1] * a;
		data[i + 2] = data[i + 2] * (1 - a) + c[2] * a;
	}

	canvas.fillRect = function (x, y, w, h, color) {
		var x0 = Math.max(0, Math.round(x * scale));
		var y0 = Math.max(0, Math.round(y * scale));
		var x1 = Math.min(W, Math.round((x + w) * scale));
		var y1 = Math.min(H, Math.round((y + h) * scale));
		var c = parseColor(color);
		if (c[3] >= 1) {
			var r = c[0];
			var g = c[1];
			var b = c[2];
			for (var yy = y0; yy < y1; yy++) {
				var base = yy * W * 3;
				for (var xx = x0; xx < x1; xx++) {
					var idx = base + xx * 3;
					data[idx] = r;
					data[idx + 1] = g;
					data[idx + 2] = b;
				}
			}
		} else {
			for (var y2 = y0; y2 < y1; y2++) {
				for (var x2 = x0; x2 < x1; x2++) blend(x2, y2, color);
			}
		}
	};

	/** 多边形填充（扫描线 + 奇偶规则） */
	canvas.fillPoly = function (points, color) {
		if (!points || points.length < 3) return;
		var pts = points.map(function (p) { return [p[0] * scale, p[1] * scale]; });
		var minY = Infinity;
		var maxY = -Infinity;
		for (var i = 0; i < pts.length; i++) {
			if (pts[i][1] < minY) minY = pts[i][1];
			if (pts[i][1] > maxY) maxY = pts[i][1];
		}
		var y0 = Math.max(0, Math.floor(minY));
		var y1 = Math.min(H - 1, Math.ceil(maxY));
		for (var y = y0; y <= y1; y++) {
			var yc = y + 0.5;
			var xs = [];
			for (var j = 0; j < pts.length; j++) {
				var p1 = pts[j];
				var p2 = pts[(j + 1) % pts.length];
				if ((p1[1] <= yc && p2[1] > yc) || (p2[1] <= yc && p1[1] > yc)) {
					var t = (yc - p1[1]) / (p2[1] - p1[1]);
					xs.push(p1[0] + t * (p2[0] - p1[0]));
				}
			}
			if (xs.length < 2) continue;
			xs.sort(function (a, b) { return a - b; });
			for (var k = 0; k + 1 < xs.length; k += 2) {
				var xa = Math.max(0, Math.round(xs[k]));
				var xb = Math.min(W, Math.round(xs[k + 1]));
				for (var x = xa; x < xb; x++) blend(x, y, color);
			}
		}
	};

	canvas.fillCircle = function (cx, cy, r, color) {
		var cxs = cx * scale;
		var cys = cy * scale;
		var rs = r * scale;
		var x0 = Math.max(0, Math.floor(cxs - rs - 1));
		var x1 = Math.min(W - 1, Math.ceil(cxs + rs + 1));
		var y0 = Math.max(0, Math.floor(cys - rs - 1));
		var y1 = Math.min(H - 1, Math.ceil(cys + rs + 1));
		var rr = rs * rs;
		for (var y = y0; y <= y1; y++) {
			var dy = y + 0.5 - cys;
			for (var x = x0; x <= x1; x++) {
				var dx = x + 0.5 - cxs;
				if (dx * dx + dy * dy <= rr) blend(x, y, color);
			}
		}
	};

	/** 折线（带圆角端点/拐点） */
	canvas.strokePolyline = function (points, width, color, cap) {
		if (!points || points.length < 2) return;
		var hw = width / 2;
		for (var i = 0; i + 1 < points.length; i++) {
			var ax = points[i][0];
			var ay = points[i][1];
			var bx = points[i + 1][0];
			var by = points[i + 1][1];
			var dx = bx - ax;
			var dy = by - ay;
			var len = Math.sqrt(dx * dx + dy * dy);
			if (len === 0) continue;
			var nx = (-dy / len) * hw;
			var ny = (dx / len) * hw;
			canvas.fillPoly([
				[ax + nx, ay + ny],
				[bx + nx, by + ny],
				[bx - nx, by - ny],
				[ax - nx, ay - ny]
			], color);
		}
		if (cap !== 'butt') {
			for (var j = 0; j < points.length; j++) {
				canvas.fillCircle(points[j][0], points[j][1], hw, color);
			}
		}
	};

	/** 圆角矩形 */
	canvas.fillRoundRect = function (x, y, w, h, r, color) {
		var rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
		var pts = [];
		var seg = 8;
		var i;
		var a;
		for (i = 0; i <= seg; i++) { a = Math.PI + (Math.PI / 2) * (i / seg); pts.push([x + rr + rr * Math.cos(a), y + rr + rr * Math.sin(a)]); }
		for (i = 0; i <= seg; i++) { a = Math.PI * 1.5 + (Math.PI / 2) * (i / seg); pts.push([x + w - rr + rr * Math.cos(a), y + rr + rr * Math.sin(a)]); }
		for (i = 0; i <= seg; i++) { a = (Math.PI / 2) * (i / seg); pts.push([x + w - rr + rr * Math.cos(a), y + h - rr + rr * Math.sin(a)]); }
		for (i = 0; i <= seg; i++) { a = Math.PI / 2 + (Math.PI / 2) * (i / seg); pts.push([x + rr + rr * Math.cos(a), y + h - rr + rr * Math.sin(a)]); }
		canvas.fillPoly(pts, color);
	};

	/** 把另一张 RGB 图按最近邻缩放绘制到本画布（近似 drawImage） */
	canvas.drawRGB = function (rgb, srcW, srcH, dx, dy, dw, dh) {
		var X0 = Math.max(0, Math.floor(dx * scale));
		var Y0 = Math.max(0, Math.floor(dy * scale));
		var X1 = Math.min(W, Math.ceil((dx + dw) * scale));
		var Y1 = Math.min(H, Math.ceil((dy + dh) * scale));
		for (var y = Y0; y < Y1; y++) {
			var v = (y / scale - dy) / dw;
			var sy = Math.min(srcH - 1, Math.max(0, Math.floor(v * srcH)));
			for (var x = X0; x < X1; x++) {
				var u = (x / scale - dx) / dw;
				var sx = Math.min(srcW - 1, Math.max(0, Math.floor(u * srcW)));
				var s = (sy * srcW + sx) * 3;
				var d = (y * W + x) * 3;
				data[d] = rgb[s];
				data[d + 1] = rgb[s + 1];
				data[d + 2] = rgb[s + 2];
			}
		}
	};

	/** 降采样到目标 RGB buffer（盒式滤波，用于抗锯齿） */
	canvas.toRGB = function () {
		var out = new Uint8Array(width * height * 3);
		var s = scale * scale;
		for (var y = 0; y < height; y++) {
			for (var x = 0; x < width; x++) {
				var r = 0;
				var g = 0;
				var b = 0;
				for (var dy = 0; dy < scale; dy++) {
					var rowBase = ((y * scale + dy) * W + x * scale) * 3;
					for (var dx = 0; dx < scale; dx++) {
						var i = rowBase + dx * 3;
						r += data[i];
						g += data[i + 1];
						b += data[i + 2];
					}
				}
				var o = (y * width + x) * 3;
				out[o] = r / s;
				out[o + 1] = g / s;
				out[o + 2] = b / s;
			}
		}
		return out;
	};

	return canvas;
}

/* ---------------------------- PNG 编码 ---------------------------- */

var crcTable = (function () {
	var table = new Int32Array(256);
	for (var n = 0; n < 256; n++) {
		var c = n;
		for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c;
	}
	return table;
})();

function crc32(buf) {
	var c = 0xffffffff;
	for (var i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
	var len = Buffer.alloc(4);
	len.writeUInt32BE(data.length, 0);
	var typeBuf = Buffer.from(type, 'ascii');
	var crcBuf = Buffer.alloc(4);
	crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
	return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/**
 * 把 RGB buffer 编码为 PNG（8bit truecolor，无 alpha）
 * @param {Number} width
 * @param {Number} height
 * @param {Uint8Array} rgb 长度 width*height*3
 * @returns {Buffer}
 */
function encodePng(width, height, rgb) {
	var ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 2; // color type: truecolor
	ihdr[10] = 0;
	ihdr[11] = 0;
	ihdr[12] = 0;

	var stride = width * 3;
	var raw = Buffer.alloc((stride + 1) * height);
	for (var y = 0; y < height; y++) {
		raw[y * (stride + 1)] = 0; // filter: none
		Buffer.from(rgb.buffer, rgb.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
	}

	var png = Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', ihdr),
		chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
		chunk('IEND', Buffer.alloc(0))
	]);
	return png;
}

/* --------------------------- 曲线工具 --------------------------- */

/** Catmull-Rom 样条插值，返回加密后的折线 */
function spline(points, stepsPerSeg) {
	if (points.length < 3) return points.slice();
	var steps = stepsPerSeg || 16;
	var out = [];
	var pts = [points[0]].concat(points, [points[points.length - 1]]);
	for (var i = 1; i + 2 < pts.length; i++) {
		var p0 = pts[i - 1];
		var p1 = pts[i];
		var p2 = pts[i + 1];
		var p3 = pts[i + 2];
		for (var s = 0; s < steps; s++) {
			var t = s / steps;
			var t2 = t * t;
			var t3 = t2 * t;
			out.push([
				0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
				0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
			]);
		}
	}
	out.push(points[points.length - 1]);
	return out;
}

/** 闭合样条 */
function closedSpline(points, stepsPerSeg) {
	return spline(points.concat([points[0], points[1]]), stepsPerSeg);
}

module.exports = {
	createCanvas: createCanvas,
	encodePng: encodePng,
	parseColor: parseColor,
	spline: spline,
	closedSpline: closedSpline
};
