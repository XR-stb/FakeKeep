/**
 * 通用格式化 / 解析 / 换算工具
 *
 * 说明：本文件使用 CommonJS 导出，既可以被 uni-app 通过
 * `import fmt from '@/common/format.js'` 引入，也可以被
 * Node（tools/ 下的测试与生成脚本）直接 require。
 */

'use strict';

/** 数字左补零 */
function pad2(n) {
	n = parseInt(n, 10);
	if (isNaN(n)) return '00';
	return n < 10 ? '0' + n : '' + n;
}

/**
 * 把用户输入的任意内容转换成数字
 * 支持中文全角数字、空格、以及 "5.20公里" 这类带单位的输入
 * @returns {Number|null} 解析失败返回 null
 */
function toNumber(input) {
	if (input === null || input === undefined) return null;
	if (typeof input === 'number') return isFinite(input) ? input : null;

	var s = String(input);
	// 全角数字 -> 半角
	s = s.replace(/[\uFF10-\uFF19]/g, function (ch) {
		return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
	});
	// 全角小数点
	s = s.replace(/\uFF0E/g, '.');
	// 去掉所有非数字、非负号、非小数点的字符（单位、汉字、空格等）
	s = s.replace(/[^0-9.\-]/g, '');
	if (s === '' || s === '-' || s === '.' || s === '-.') return null;
	// 只保留第一个小数点
	var firstDot = s.indexOf('.');
	if (firstDot !== -1) {
		s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '');
	}
	var n = parseFloat(s);
	return isFinite(n) ? n : null;
}

/**
 * 把用户输入解析成"秒"
 * 支持： "00:32:15" / "32:15" / "32分15秒" / "32.5" (当分钟) / "325"
 * @returns {Number|null}
 */
function parseDuration(input) {
	if (input === null || input === undefined) return null;
	if (typeof input === 'number') {
		return isFinite(input) && input >= 0 ? Math.round(input * 60) : null;
	}
	var s = String(input).trim();
	if (s === '') return null;

	s = s.replace(/[\uFF10-\uFF19]/g, function (ch) {
		return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
	});
	s = s.replace(/[：]/g, ':').replace(/[分时]/g, ':').replace(/秒/g, '').replace(/[^0-9:.]/g, '');
	if (s === '') return null;

	var parts = s.split(':').filter(function (p) {
		return p !== '';
	});
	var nums = [];
	for (var i = 0; i < parts.length; i++) {
		var v = parseFloat(parts[i]);
		if (!isFinite(v) || v < 0) return null;
		nums.push(v);
	}
	if (!nums.length) return null;
	if (nums.length === 1) {
		// 只有一个数：大于 100 视为总秒数，否则视为分钟
		var only = nums[0];
		return only > 100 ? Math.round(only) : Math.round(only * 60);
	}
	var total = 0;
	for (var j = 0; j < nums.length; j++) {
		total = total * 60 + nums[j];
	}
	return Math.round(total);
}

/**
 * 秒 -> "HH:MM:SS"（不足 1 小时时为 "MM:SS"）
 * @param {Boolean} [forceHour] 强制显示小时位
 */
function formatDuration(seconds, forceHour) {
	var s = Math.max(0, Math.round(seconds || 0));
	var h = Math.floor(s / 3600);
	var m = Math.floor((s % 3600) / 60);
	var sec = s % 60;
	if (h > 0 || forceHour) return pad2(h) + ':' + pad2(m) + ':' + pad2(sec);
	return pad2(m) + ':' + pad2(sec);
}

/**
 * 解析配速，统一返回"每公里秒数"
 * 支持 "5'30\"" / "5:30" / "5.5" / "330"
 */
function parsePace(input) {
	if (input === null || input === undefined) return null;
	if (typeof input === 'number') {
		return isFinite(input) && input > 0 ? Math.round(input * 60) : null;
	}
	var s = String(input).trim();
	if (s === '') return null;
	s = s.replace(/[\uFF10-\uFF19]/g, function (ch) {
		return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
	});
	s = s.replace(/["”'’′″]/g, ':').replace(/[\uFF1A：]/g, ':').replace(/[^0-9:.]/g, '');
	var parts = s.split(':').filter(function (p) {
		return p !== '';
	});
	if (!parts.length) return null;
	var min = parseFloat(parts[0]);
	if (!isFinite(min) || min < 0) return null;
	var sec = parts.length > 1 ? parseFloat(parts[1]) : 0;
	if (!isFinite(sec) || sec < 0) return null;
	var total = Math.round(min * 60 + sec);
	return total > 0 ? total : null;
}

/** 每公里秒数 -> "5'30\"" */
function formatPace(secPerKm) {
	if (!isFinite(secPerKm) || secPerKm <= 0) return '--\'--"';
	// 四舍五入到秒，避免出现 59.6" 这种不合法显示
	var total = Math.round(secPerKm);
	var m = Math.floor(total / 60);
	var s = total % 60;
	return m + '\'' + pad2(s) + '"';
}

/** 由距离(km)与用时(秒)算配速(秒/km) */
function paceFromDuration(durationSec, km) {
	if (!isFinite(durationSec) || !isFinite(km) || km <= 0 || durationSec <= 0) return null;
	return durationSec / km;
}

/** 由配速(秒/km)与距离(km)算用时(秒) */
function durationFromPace(paceSec, km) {
	if (!isFinite(paceSec) || !isFinite(km) || km <= 0 || paceSec <= 0) return null;
	return Math.round(paceSec * km);
}

/** 保留小数位（不补零，用于展示） */
function round(value, digits) {
	var d = digits === undefined ? 2 : digits;
	var p = Math.pow(10, d);
	return Math.round((Number(value) || 0) * p) / p;
}

/** 固定小数位字符串 */
function toFixedStr(value, digits) {
	var d = digits === undefined ? 2 : digits;
	var n = Number(value);
	if (!isFinite(n)) n = 0;
	return n.toFixed(d);
}

/**
 * 由步频(步/分)与用时(秒)推算步数
 * 注意：真实跑步 App 的"步数"= 步频 × 分钟数
 */
function stepsFromCadence(cadence, durationSec) {
	if (!isFinite(cadence) || !isFinite(durationSec) || cadence <= 0 || durationSec <= 0) return 0;
	return Math.round(cadence * (durationSec / 60));
}

/**
 * 由距离、体重系数估算卡路里
 * 跑步能耗 ≈ 1.036 × 体重(kg) × 距离(km)
 */
function caloriesFromDistance(km, weightKg) {
	var w = isFinite(weightKg) && weightKg > 0 ? weightKg : 60;
	if (!isFinite(km) || km <= 0) return 0;
	return Math.round(1.036 * w * km);
}

/** 在区间内取整随机数（含两端） */
function randomInt(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** 在区间内取随机浮点数 */
function randomFloat(min, max) {
	return Math.random() * (max - min) + min;
}

/** "2026-02-03" + "07:09" -> {date:'2月3日', time:'07:09', weekday:'周二'} */
function splitDateTime(dateStr, timeStr) {
	var out = { date: '', time: timeStr || '', weekday: '' };
	if (!dateStr) return out;
	var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(dateStr).trim());
	if (!m) {
		out.date = String(dateStr);
		return out;
	}
	var month = parseInt(m[2], 10);
	var day = parseInt(m[3], 10);
	out.date = month + '月' + day + '日';
	var d = new Date(parseInt(m[1], 10), month - 1, day);
	if (!isNaN(d.getTime())) {
		out.weekday = '周' + '日一二三四五六'.charAt(d.getDay());
	}
	return out;
}

/** 今天的 "YYYY-MM-DD" */
function todayStr(d) {
	var date = d instanceof Date ? d : new Date();
	return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}

/** 当前时间的 "HH:MM" */
function nowTimeStr(d) {
	var date = d instanceof Date ? d : new Date();
	return pad2(date.getHours()) + ':' + pad2(date.getMinutes());
}

/**
 * 依据距离/配速等核心参数，生成一套互相自洽的运动数据
 * @param {Object} [seed] 可选的固定值
 */
function buildConsistentStats(seed) {
	seed = seed || {};
	var km = seed.km !== undefined ? seed.km : round(randomFloat(3.2, 12.6), 2);
	var paceSec = seed.paceSec !== undefined ? seed.paceSec : randomInt(310, 445); // 5'10" ~ 7'25"
	var durationSec = seed.durationSec !== undefined ? seed.durationSec : durationFromPace(paceSec, km);
	var cadence = seed.cadence !== undefined ? seed.cadence : randomInt(166, 186);
	var weight = seed.weight !== undefined ? seed.weight : randomInt(55, 78);
	return {
		km: round(km, 2),
		paceSec: Math.round(paceFromDuration(durationSec, km) || paceSec),
		durationSec: durationSec,
		calories: seed.calories !== undefined ? seed.calories : caloriesFromDistance(km, weight),
		heartRate: seed.heartRate !== undefined ? seed.heartRate : randomInt(132, 166),
		cadence: cadence,
		steps: seed.steps !== undefined ? seed.steps : stepsFromCadence(cadence, durationSec)
	};
}

module.exports = {
	pad2: pad2,
	toNumber: toNumber,
	parseDuration: parseDuration,
	formatDuration: formatDuration,
	parsePace: parsePace,
	formatPace: formatPace,
	paceFromDuration: paceFromDuration,
	durationFromPace: durationFromPace,
	round: round,
	toFixedStr: toFixedStr,
	stepsFromCadence: stepsFromCadence,
	caloriesFromDistance: caloriesFromDistance,
	randomInt: randomInt,
	randomFloat: randomFloat,
	splitDateTime: splitDateTime,
	todayStr: todayStr,
	nowTimeStr: nowTimeStr,
	buildConsistentStats: buildConsistentStats
};
