/**
 * 轨迹截图页的数据状态与联动规则
 *
 * 这里放的都是"纯逻辑"：距离 / 用时 / 配速三者互相推导、步数与卡路里自动联动、
 * 输入规整、一键随机。页面只负责渲染与调用 uni 的 API，这样这些规则就能被
 * tools/test-core.js 离线覆盖，不必上真机反复手点。
 */

'use strict';

var format = require('./format.js');
var routeUtil = require('./route.js');
var backgrounds = require('./backgrounds.js');

/** 估算卡路里用的默认体重（kg） */
var DEFAULT_WEIGHT = 62;

/** 可编辑的数据行；auto 为 true 表示该字段默认跟着别的字段自动算 */
var FIELDS = [
	{ key: 'distance', label: '距离', unit: '公里', type: 'digit', placeholder: '例如 5.20' },
	{ key: 'duration', label: '用时', unit: '', type: 'text', placeholder: '例如 00:32:15' },
	{ key: 'pace', label: '平均配速', unit: '', type: 'text', placeholder: '例如 6\'12"' },
	{ key: 'calories', label: '卡路里', unit: '千卡', type: 'number', auto: true, placeholder: '自动' },
	{ key: 'heartRate', label: '平均心率', unit: '次/分', type: 'number', placeholder: '例如 148' },
	{ key: 'cadence', label: '步频', unit: '步/分', type: 'number', placeholder: '例如 176' },
	{ key: 'steps', label: '步数', unit: '步', type: 'number', auto: true, placeholder: '自动' }
];

/** 默认自动联动的字段 */
function createAutoFlags() {
	return { calories: true, steps: true };
}

/**
 * 一份默认表单
 * @param {Date}   [now]  注入当前时间，方便测试
 * @param {Number} [seed] 注入轨迹随机种子
 */
function createDefaultForm(now, seed) {
	var date = now instanceof Date ? now : new Date();
	var stats = format.buildConsistentStats({ km: 5.2 });
	return {
		title: '户外跑步',
		location: '',
		date: format.todayStr(date),
		time: format.nowTimeStr(date),
		weekday: '',
		distance: format.toFixedStr(stats.km, 2),
		duration: format.formatDuration(stats.durationSec),
		pace: format.formatPace(stats.paceSec),
		calories: String(stats.calories),
		heartRate: String(stats.heartRate),
		cadence: String(stats.cadence),
		steps: String(stats.steps),
		weight: DEFAULT_WEIGHT,
		routeStyle: routeUtil.ROUTE_STYLES[0].key,
		routeSeed: seed === undefined ? Math.floor(Math.random() * 1000000) : seed,
		routeColor: backgrounds.DEFAULT_ROUTE_COLOR,
		backgroundKey: backgrounds.BUILTIN_MAPS[0].key,
		showMarkers: true,
		showWatermark: true
	};
}

/** 「8月9日」 */
function dateLabel(form) {
	var parsed = format.splitDateTime(form.date, form.time);
	return parsed.date || form.date;
}

/** 「8月9日 07:09」 */
function datetimeText(form) {
	return dateLabel(form) + ' ' + (form.time || '');
}

/**
 * 距离 / 用时 / 配速 三选二自动推导第三个，并联动步数与卡路里
 * @param {Object} form   会被就地修改
 * @param {Object} auto   { calories, steps } 为 false 的字段不自动覆盖
 * @param {String} source 本次被用户改动的字段名
 */
function syncDerived(form, auto, source) {
	auto = auto || createAutoFlags();
	var km = format.toNumber(form.distance);
	if (km === null || km < 0) km = 0;

	if (source === 'distance' || source === 'duration') {
		var pace = format.paceFromDuration(format.parseDuration(form.duration), km);
		if (pace) form.pace = format.formatPace(pace);
	} else if (source === 'pace') {
		var seconds = format.durationFromPace(format.parsePace(form.pace), km);
		if (seconds) form.duration = format.formatDuration(seconds);
	}

	var total = format.parseDuration(form.duration);
	var cadence = format.toNumber(form.cadence);

	if (auto.steps && total && cadence) {
		form.steps = String(format.stepsFromCadence(cadence, total));
	}
	if (auto.calories && km > 0) {
		form.calories = String(format.caloriesFromDistance(km, format.toNumber(form.weight) || DEFAULT_WEIGHT));
	}
	form.weekday = format.splitDateTime(form.date, '').weekday;
	return form;
}

/**
 * 失焦时把输入规整成规范写法（就地修改）
 * @param {Object} form
 * @param {String} key
 */
function normalizeField(form, key) {
	var value = form[key];
	var n;
	switch (key) {
		case 'distance':
			n = format.toNumber(value);
			form.distance = format.toFixedStr(n === null || n < 0 ? 0 : n, 2);
			break;
		case 'duration':
			n = format.parseDuration(value);
			form.duration = format.formatDuration(n === null ? 0 : n);
			break;
		case 'pace':
			n = format.parsePace(value);
			if (n) {
				form.pace = format.formatPace(n);
			} else {
				// 清空配速时按「距离 + 用时」重算，避免留下占位符
				var rebuilt = format.paceFromDuration(
					format.parseDuration(form.duration),
					format.toNumber(form.distance)
				);
				form.pace = rebuilt ? format.formatPace(rebuilt) : '--\'--"';
			}
			break;
		case 'calories':
		case 'heartRate':
		case 'cadence':
		case 'steps':
			n = format.toNumber(value);
			form[key] = String(Math.max(0, Math.round(n === null ? 0 : n)));
			break;
		default:
			break;
	}
	return form;
}

/** 组装成 trackCard.drawCard 需要的 stats */
function toCardStats(form) {
	function distance() {
		var n = format.toNumber(form.distance);
		return format.toFixedStr(n === null || n < 0 ? 0 : n, 2);
	}
	return {
		distance: distance(),
		duration: form.duration || '--',
		pace: form.pace || '--',
		calories: form.calories || '--',
		heartRate: form.heartRate || '--',
		cadence: form.cadence || '--',
		steps: form.steps || '--'
	};
}

/**
 * 随机生成一条彼此自洽的记录（就地修改 form）
 * @param {Object} form
 * @param {Object} auto
 * @param {Date}   [now]
 * @param {Object} [options] { resetStyle:Boolean 是否同时换轨迹样式与背景 }
 */
function randomize(form, auto, now, options) {
	options = options || {};
	var date = now instanceof Date ? now : new Date();
	var stats = format.buildConsistentStats();
	// 卡路里按表单里的体重算，保证和「改距离自动算卡路里」的结果一致
	var weight = format.toNumber(form.weight) || DEFAULT_WEIGHT;
	form.distance = format.toFixedStr(stats.km, 2);
	form.duration = format.formatDuration(stats.durationSec);
	form.pace = format.formatPace(stats.paceSec);
	form.calories = String(format.caloriesFromDistance(stats.km, weight));
	form.heartRate = String(stats.heartRate);
	form.cadence = String(stats.cadence);
	form.steps = String(stats.steps);
	form.date = format.todayStr(date);
	form.time = format.nowTimeStr(date);
	form.weekday = format.splitDateTime(form.date, '').weekday;
	form.routeSeed = Math.floor(Math.random() * 1000000);
	if (options.resetStyle) {
		form.routeStyle = routeUtil.ROUTE_STYLES[Math.floor(Math.random() * routeUtil.ROUTE_STYLES.length)].key;
	}
	if (auto) {
		auto.calories = true;
		auto.steps = true;
	}
	return form;
}

/** 只重置运动数据，保留用户选好的轨迹样式、颜色与背景 */
function resetData(form, auto, now) {
	var fresh = createDefaultForm(now);
	['routeStyle', 'routeSeed', 'routeColor', 'backgroundKey', 'title', 'location'].forEach(function (key) {
		fresh[key] = form[key];
	});
	if (auto) {
		auto.calories = true;
		auto.steps = true;
	}
	return fresh;
}

/** 把上次保存的内容合并回默认表单（过滤掉已经不存在的字段） */
function mergeSaved(defaults, saved) {
	if (!saved || typeof saved !== 'object') return defaults;
	Object.keys(defaults).forEach(function (key) {
		if (saved[key] !== undefined && saved[key] !== null) defaults[key] = saved[key];
	});
	return defaults;
}

module.exports = {
	DEFAULT_WEIGHT: DEFAULT_WEIGHT,
	FIELDS: FIELDS,
	createAutoFlags: createAutoFlags,
	createDefaultForm: createDefaultForm,
	dateLabel: dateLabel,
	datetimeText: datetimeText,
	syncDerived: syncDerived,
	normalizeField: normalizeField,
	toCardStats: toCardStats,
	randomize: randomize,
	resetData: resetData,
	mergeSaved: mergeSaved
};
