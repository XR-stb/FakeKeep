/**
 * 轨迹分享卡渲染器
 *
 * 只做一件事：把「背景地图 + 轨迹 + 运动数据」画到 canvas 上。
 * 之所以把绘制逻辑独立出来，是为了：
 *   1. 页面只负责交互与状态，绘制逻辑可单独测试（tools/test-core.js）
 *   2. 布局常量可被离线预览工具复用（tools/preview.js），排版改动能立刻肉眼验证
 *
 * 坐标系：内部统一使用 750 × 1120 的"设计坐标"（等价于 rpx），
 * 绘制时按 k = width / 750 换算成真实像素，避免依赖 ctx.scale（部分平台
 * 的 CanvasContext 状态不会在两次 draw 之间重置，scale 会累积）。
 *
 * 兼容性：所有样式设置都通过 setXxx() 优先、属性赋值兜底，
 * 以同时兼容 uni-app H5 / App(5+) / 微信小程序 的旧版 CanvasContext。
 */

'use strict';

var routeUtil = require('./route.js');
var backgrounds = require('./backgrounds.js');

/** 设计稿尺寸（等价 rpx） */
var DESIGN = { width: 750, height: 1120 };

/**
 * 布局常量（设计坐标）。离线预览工具会直接读取这里，
 * 所以任何排版微调都只需要改这一处。
 */
var LAYOUT = {
	width: DESIGN.width,
	height: DESIGN.height,

	// 顶部胶囊：左侧运动类型，右侧日期时间
	pill: { x: 52, y: 52, w: 646, h: 68, r: 34 },
	pillLeft: { x: 88, y: 70, size: 30 },
	pillRight: { x: 662, y: 72, size: 28 },

	// 地图上留给轨迹的矩形
	routeBox: { x: 66, y: 148, w: 618, h: 452 },
	markerRadius: 15,
	markerCoreRadius: 9,
	routeWidth: 11,

	// 底部数据卡
	card: { x: 0, y: 640, w: 750, h: 480, r: 46 },
	distLabel: { x: 64, y: 676, size: 26 },
	distValue: { x: 64, y: 706, size: 104 },
	distUnit: { size: 32 },
	// 右上角的"地点"文字，未填写时不绘制
	locationText: { x: 686, y: 678, size: 24 },
	divider: { x0: 64, x1: 686, y: 842 },

	row1LabelY: 872,
	row1ValueY: 902,
	row2LabelY: 972,
	row2ValueY: 1002,
	cols: [125, 375, 625],
	labelSize: 25,
	valueSize: 42,
	unitSize: 22,
	unitGap: 6,

	watermark: { x: 375, y: 1064, size: 22 },

	/** 三列数据的分组定义，UI 与预览工具都按这个顺序渲染 */
	statRows: [
		[
			{ key: 'duration', label: '用时', unit: '' },
			{ key: 'pace', label: '平均配速', unit: '' },
			{ key: 'calories', label: '卡路里', unit: '千卡' }
		],
		[
			{ key: 'heartRate', label: '平均心率', unit: '次/分' },
			{ key: 'cadence', label: '步频', unit: '步/分' },
			{ key: 'steps', label: '步数', unit: '步' }
		]
	]
};

/** 明/暗两种底图下的配色 */
var PALETTES = {
	light: {
		pillBg: 'rgba(18,22,26,0.62)',
		pillText: '#FFFFFF',
		pillTextDim: 'rgba(255,255,255,0.88)',
		casingOuter: 'rgba(0,0,0,0.14)',
		casingInner: 'rgba(255,255,255,0.94)',
		card: 'rgba(16,20,24,0.94)',
		cardText: '#FFFFFF',
		cardDim: 'rgba(255,255,255,0.52)',
		divider: 'rgba(255,255,255,0.14)',
		watermark: 'rgba(255,255,255,0.32)'
	},
	dark: {
		pillBg: 'rgba(0,0,0,0.55)',
		pillText: '#FFFFFF',
		pillTextDim: 'rgba(255,255,255,0.85)',
		casingOuter: 'rgba(0,0,0,0.5)',
		casingInner: 'rgba(255,255,255,0.7)',
		card: 'rgba(10,13,16,0.95)',
		cardText: '#FFFFFF',
		cardDim: 'rgba(255,255,255,0.5)',
		divider: 'rgba(255,255,255,0.12)',
		watermark: 'rgba(255,255,255,0.3)'
	}
};

/* --------------------------- ctx 兼容层 --------------------------- */

function setFill(ctx, color) {
	if (typeof ctx.setFillStyle === 'function') ctx.setFillStyle(color);
	else ctx.fillStyle = color;
}

function setStroke(ctx, color) {
	if (typeof ctx.setStrokeStyle === 'function') ctx.setStrokeStyle(color);
	else ctx.strokeStyle = color;
}

function setLineWidth(ctx, w) {
	if (typeof ctx.setLineWidth === 'function') ctx.setLineWidth(w);
	else ctx.lineWidth = w;
}

function setLineCap(ctx, v) {
	if (typeof ctx.setLineCap === 'function') ctx.setLineCap(v);
	else ctx.lineCap = v;
}

function setLineJoin(ctx, v) {
	if (typeof ctx.setLineJoin === 'function') ctx.setLineJoin(v);
	else ctx.lineJoin = v;
}

function setAlpha(ctx, a) {
	if (typeof ctx.setGlobalAlpha === 'function') ctx.setGlobalAlpha(a);
	else ctx.globalAlpha = a;
}

/**
 * 设置字号，返回 true 表示「真实粗体已经生效，不需要伪粗体」
 *
 * ⚠️ 这里有一个必须记住的坑：
 * uni-app 的 CanvasContext（H5 / App / 小程序）里，`setFontSize()` 才是真正改变
 * 绘制字体的接口；`ctx.font` 只是一个普通属性，赋值不会影响实际绘制
 * （但读回来是你写进去的字符串，所以"赋值再读回来校验"这种探测方式是错的——
 * 会在 Math.round(size) 恰好是字号子串时误判成功，于是跳过 setFontSize，
 * 结果这段文字沿用了上一段的字号）。
 *
 * 因此这里的策略是：
 *   - 有 setFontSize（uni-app 各端）→ 只用它，粗体一律用伪粗体叠加，各端表现一致
 *   - 没有 setFontSize（原生 CanvasRenderingContext2D，例如 WebView 里直接跑 H5 产物）
 *     → 用 ctx.font，粗体真实生效
 */
function applyFont(ctx, size, bold) {
	if (typeof ctx.setFontSize === 'function') {
		try {
			ctx.setFontSize(size);
		} catch (e) {
			// 忽略：极端情况下仍然继续绘制
		}
		return false;
	}
	try {
		ctx.font = (bold ? 'bold ' : '') + size + 'px sans-serif';
		return true;
	} catch (e) {
		return false;
	}
}

function measure(ctx, text, size, bold) {
	applyFont(ctx, size, bold);
	var res = ctx.measureText(String(text));
	return (res && res.width) || String(text).length * size * 0.55;
}

/**
 * 绘制文本。bold 时：优先用 ctx.font 的真正粗体，
 * 平台不支持时用多次微偏移填充模拟粗体。
 *
 * 另外对 setTextAlign / setTextBaseline 做了降级：
 * 个别平台的 CanvasContext 没有这两个方法，此时改为手动偏移对齐，
 * 并把「以顶部为基准」换算成「以基线为基准」，避免文字整体上移压到别的元素。
 */
function fillText(ctx, text, x, y, opt) {
	opt = opt || {};
	var size = opt.size || 28;
	var bold = !!opt.bold;
	var fontOk = applyFont(ctx, size, bold);
	var content = String(text);
	var align = opt.align || 'left';
	var baseline = opt.baseline || 'top';

	var drawX = x;
	if (typeof ctx.setTextAlign === 'function') {
		ctx.setTextAlign(align);
	} else if (align !== 'left') {
		var w = measure(ctx, content, size, bold);
		drawX = align === 'center' ? x - w / 2 : x - w;
	}

	var drawY = y;
	if (typeof ctx.setTextBaseline === 'function') {
		ctx.setTextBaseline(baseline);
	} else if (baseline === 'top') {
		drawY = y + size * 0.8; // 近似：把 top 换算成 baseline
	} else if (baseline === 'middle') {
		drawY = y + size * 0.3;
	}

	setFill(ctx, opt.color || '#FFFFFF');
	if (bold && !fontOk) {
		var d = Math.max(0.4, size * 0.022);
		ctx.fillText(content, drawX - d, drawY);
		ctx.fillText(content, drawX + d, drawY);
		ctx.fillText(content, drawX, drawY - d);
		ctx.fillText(content, drawX, drawY + d);
	}
	ctx.fillText(content, drawX, drawY);
}

/** 圆角矩形路径；允许只圆上面两个角（数据卡用） */
function roundRectPath(ctx, x, y, w, h, r, onlyTop) {
	var rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
	ctx.beginPath();
	if (onlyTop) {
		ctx.moveTo(x, y + h);
		ctx.lineTo(x, y + rr);
		ctx.arc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5);
		ctx.lineTo(x + w - rr, y);
		ctx.arc(x + w - rr, y + rr, rr, Math.PI * 1.5, Math.PI * 2);
		ctx.lineTo(x + w, y + h);
	} else {
		ctx.moveTo(x + rr, y);
		ctx.lineTo(x + w - rr, y);
		ctx.arc(x + w - rr, y + rr, rr, Math.PI * 1.5, Math.PI * 2);
		ctx.lineTo(x + w, y + h - rr);
		ctx.arc(x + w - rr, y + h - rr, rr, 0, Math.PI * 0.5);
		ctx.lineTo(x + rr, y + h);
		ctx.arc(x + rr, y + h - rr, rr, Math.PI * 0.5, Math.PI);
		ctx.lineTo(x, y + rr);
		ctx.arc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5);
	}
	ctx.closePath();
	ctx.fill();
}

/** 把设计坐标按 k 缩放 */
function scaledLayout(k) {
	// 这些子对象里的字段全部是设计坐标尺寸，整体乘以 k 即可
	function s(o) {
		var out = {};
		for (var key in o) {
			if (!Object.prototype.hasOwnProperty.call(o, key)) continue;
			var v = o[key];
			out[key] = typeof v === 'number' ? v * k : v;
		}
		return out;
	}
	var L = {};
	L.k = k;
	L.width = LAYOUT.width * k;
	L.height = LAYOUT.height * k;
	L.pill = s(LAYOUT.pill);
	L.pillLeft = { x: LAYOUT.pillLeft.x * k, y: LAYOUT.pillLeft.y * k, size: LAYOUT.pillLeft.size * k };
	L.pillRight = { x: LAYOUT.pillRight.x * k, y: LAYOUT.pillRight.y * k, size: LAYOUT.pillRight.size * k };
	L.routeBox = s(LAYOUT.routeBox);
	L.markerRadius = LAYOUT.markerRadius * k;
	L.markerCoreRadius = LAYOUT.markerCoreRadius * k;
	L.routeWidth = LAYOUT.routeWidth * k;
	L.card = s(LAYOUT.card);
	L.distLabel = { x: LAYOUT.distLabel.x * k, y: LAYOUT.distLabel.y * k, size: LAYOUT.distLabel.size * k };
	L.distValue = { x: LAYOUT.distValue.x * k, y: LAYOUT.distValue.y * k, size: LAYOUT.distValue.size * k };
	L.distUnit = { size: LAYOUT.distUnit.size * k };
	L.locationText = { x: LAYOUT.locationText.x * k, y: LAYOUT.locationText.y * k, size: LAYOUT.locationText.size * k };
	L.divider = s(LAYOUT.divider);
	L.row1LabelY = LAYOUT.row1LabelY * k;
	L.row1ValueY = LAYOUT.row1ValueY * k;
	L.row2LabelY = LAYOUT.row2LabelY * k;
	L.row2ValueY = LAYOUT.row2ValueY * k;
	L.cols = LAYOUT.cols.map(function (c) { return c * k; });
	L.labelSize = LAYOUT.labelSize * k;
	L.valueSize = LAYOUT.valueSize * k;
	L.unitSize = LAYOUT.unitSize * k;
	L.unitGap = LAYOUT.unitGap * k;
	L.watermark = { x: LAYOUT.watermark.x * k, y: LAYOUT.watermark.y * k, size: LAYOUT.watermark.size * k };
	return L;
}

/** 居中绘制"数值 + 小字单位"，返回总宽度 */
function drawValueWithUnit(ctx, cx, y, value, unit, size, unitSize, color, unitColor) {
	var unitGap = Math.max(3, size * 0.14);
	var vw = measure(ctx, value, size, true);
	var uw = unit ? measure(ctx, unit, unitSize, false) : 0;
	var total = vw + (unit ? unitGap + uw : 0);
	var startX = cx - total / 2;
	fillText(ctx, value, startX, y, { size: size, bold: true, color: color, align: 'left', baseline: 'top' });
	if (unit) {
		// 单位底部与数值底部对齐
		fillText(ctx, unit, startX + vw + unitGap, y + (size - unitSize) * 0.92, {
			size: unitSize, bold: false, color: unitColor, align: 'left', baseline: 'top'
		});
	}
	return total;
}

/**
 * 以 cover 方式绘制背景图（保持比例、居中裁剪）
 * @param {Object} ctx
 * @param {Object} img { path|src, width, height } —— 由 uni.getImageInfo 得到
 */
function drawCover(ctx, img, W, H) {
	var path = img.path || img.src;
	if (!path) return false;
	var iw = img.width;
	var ih = img.height;
	if (!(iw > 0) || !(ih > 0)) {
		// 拿不到原始尺寸时退化为拉伸铺满
		ctx.drawImage(path, 0, 0, W, H);
		return true;
	}
	var scale = Math.max(W / iw, H / ih);
	var sw = W / scale;
	var sh = H / scale;
	var sx = (iw - sw) / 2;
	var sy = (ih - sh) / 2;
	ctx.drawImage(path, sx, sy, sw, sh, 0, 0, W, H);
	return true;
}

/** 画轨迹（含描边 casing，保证在任何底图上都清晰） */
function drawRoute(ctx, points, L, opt) {
	if (!points || points.length < 2) return;
	var mapped = routeUtil.fitToBox(points, L.routeBox);
	setLineCap(ctx, 'round');
	setLineJoin(ctx, 'round');

	function stroke(width, color) {
		setStroke(ctx, color);
		setLineWidth(ctx, width);
		ctx.beginPath();
		ctx.moveTo(mapped[0].x, mapped[0].y);
		for (var i = 1; i < mapped.length; i++) ctx.lineTo(mapped[i].x, mapped[i].y);
		ctx.stroke();
	}

	stroke(L.routeWidth + 9 * L.k, opt.casingOuter);
	stroke(L.routeWidth + 4.5 * L.k, opt.casingInner);
	stroke(L.routeWidth, opt.routeColor);

	if (opt.showMarkers) {
		var first = mapped[0];
		var last = mapped[mapped.length - 1];
		var closed = Math.abs(first.x - last.x) < L.routeWidth && Math.abs(first.y - last.y) < L.routeWidth;
		drawMarker(ctx, first, L.markerRadius, L.markerCoreRadius, '#FFFFFF', opt.routeColor);
		if (!closed) {
			drawMarker(ctx, last, L.markerRadius, L.markerCoreRadius, '#FFFFFF', '#F5453B');
		}
	}
}

function drawMarker(ctx, p, r, coreR, ringColor, coreColor) {
	setFill(ctx, ringColor);
	ctx.beginPath();
	ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
	ctx.fill();
	setFill(ctx, coreColor);
	ctx.beginPath();
	ctx.arc(p.x, p.y, coreR, 0, Math.PI * 2);
	ctx.fill();
}

/**
 * 渲染整张轨迹分享卡（只把绘制指令写进 ctx，不调用 ctx.draw）
 *
 * @param {Object} ctx uni.createCanvasContext(...) 得到的上下文
 * @param {Object} opt
 * @param {Number} opt.width          画布像素宽（px）
 * @param {Number} opt.height         画布像素高（px）
 * @param {Object} [opt.background]   { type:'image'|'color', src, color, theme, image }
 * @param {Array}  opt.route          归一化轨迹点
 * @param {String} opt.routeColor     轨迹颜色
 * @param {Object} opt.stats          { distance, duration, pace, calories, heartRate, cadence, steps, stepsText }
 * @param {String} [opt.title]        运动类型，默认「户外跑步」
 * @param {String} [opt.datetimeText] 右上角日期时间
 * @param {Boolean}[opt.showMarkers]
 * @param {Boolean}[opt.showWatermark]
 * @param {String} [opt.watermarkText]
 */
function drawCard(ctx, opt) {
	opt = opt || {};
	var W = opt.width;
	var H = opt.height;
	var k = W / DESIGN.width;
	var L = scaledLayout(k);

	var bg = opt.background || {};
	var theme = bg.theme === 'dark' ? 'dark' : 'light';
	var pal = PALETTES[theme];
	var routeColor = opt.routeColor || backgrounds.DEFAULT_ROUTE_COLOR;

	// 1. 背景
	setAlpha(ctx, 1);
	if (bg.type === 'image' && (bg.image || bg.src)) {
		setFill(ctx, '#EDEDED');
		ctx.fillRect(0, 0, W, H);
		drawCover(ctx, bg.image || { src: bg.src }, W, H);
	} else {
		setFill(ctx, bg.color || '#E9EBEE');
		ctx.fillRect(0, 0, W, H);
	}

	// 2. 轨迹
	drawRoute(ctx, opt.route, L, {
		routeColor: routeColor,
		casingOuter: pal.casingOuter,
		casingInner: pal.casingInner,
		showMarkers: opt.showMarkers !== false
	});

	// 3. 顶部胶囊
	setFill(ctx, pal.pillBg);
	roundRectPath(ctx, L.pill.x, L.pill.y, L.pill.w, L.pill.h, L.pill.r, false);
	fillText(ctx, opt.title || '户外跑步', L.pillLeft.x, L.pillLeft.y, {
		size: L.pillLeft.size, bold: true, color: pal.pillText, align: 'left'
	});
	fillText(ctx, opt.datetimeText || '', L.pillRight.x, L.pillRight.y, {
		size: L.pillRight.size, bold: false, color: pal.pillTextDim, align: 'right'
	});

	// 4. 底部数据卡
	setFill(ctx, pal.card);
	roundRectPath(ctx, L.card.x, L.card.y, L.card.w, L.card.h, L.card.r, true);

	var stats = opt.stats || {};
	fillText(ctx, '距离', L.distLabel.x, L.distLabel.y, {
		size: L.distLabel.size, bold: false, color: pal.cardDim, align: 'left'
	});
	if (opt.locationText) {
		fillText(ctx, opt.locationText, L.locationText.x, L.locationText.y, {
			size: L.locationText.size, bold: false, color: pal.cardDim, align: 'right'
		});
	}

	// 大号距离数字
	var distText = stats.distance || '0.00';
	fillText(ctx, distText, L.distValue.x, L.distValue.y, {
		size: L.distValue.size, bold: true, color: pal.cardText, align: 'left'
	});
	var distW = measure(ctx, distText, L.distValue.size, true);
	fillText(ctx, '公里', L.distValue.x + distW + L.distUnit.size * 0.42,
		L.distValue.y + L.distValue.size - L.distUnit.size * 1.05, {
			size: L.distUnit.size, bold: false, color: pal.cardDim, align: 'left'
		});

	// 分隔线
	setFill(ctx, pal.divider);
	ctx.fillRect(L.divider.x0, L.divider.y, L.divider.x1 - L.divider.x0, Math.max(1, k));

	// 两行三列数据
	var rows = LAYOUT.statRows;
	var labelYs = [L.row1LabelY, L.row2LabelY];
	var valueYs = [L.row1ValueY, L.row2ValueY];
	for (var r = 0; r < rows.length; r++) {
		for (var c = 0; c < rows[r].length && c < L.cols.length; c++) {
			var def = rows[r][c];
			fillText(ctx, def.label, L.cols[c], labelYs[r], {
				size: L.labelSize, bold: false, color: pal.cardDim, align: 'center'
			});
			var value = stats[def.key];
			if (value === undefined || value === null || value === '') value = '--';
			drawValueWithUnit(ctx, L.cols[c], valueYs[r], String(value), def.unit,
				L.valueSize, L.unitSize, pal.cardText, pal.cardDim);
		}
	}

	// 5. 水印
	if (opt.showWatermark) {
		fillText(ctx, opt.watermarkText || 'FakeKeep · 轨迹记录', L.watermark.x, L.watermark.y, {
			size: L.watermark.size, bold: false, color: pal.watermark, align: 'center'
		});
	}

	setAlpha(ctx, 1);
	return L;
}

module.exports = {
	DESIGN: DESIGN,
	LAYOUT: LAYOUT,
	PALETTES: PALETTES,
	scaledLayout: scaledLayout,
	drawCard: drawCard,
	drawCover: drawCover,
	drawRoute: drawRoute,
	measure: measure,
	__internals: {
		setFill: setFill,
		fillText: fillText,
		roundRectPath: roundRectPath,
		applyFont: applyFont
	}
};
