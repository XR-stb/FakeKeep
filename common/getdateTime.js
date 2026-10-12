/**
 * 日期时间格式化
 *
 * 用法与旧版完全兼容：
 *   dateTimeStr('y年m月d日 h:i:s')  ->  '2026年2月3日 07:09:05'
 *
 * 支持的占位符（单字母与双字母都可以）：
 *   y / yy / yyyy  年      w  星期（日一二三四五六）
 *   m / mm         月
 *   d / dd         日
 *   h / hh         时（24 小时制）
 *   i / ii         分
 *   s / ss         秒
 *
 * 旧实现用的是连续 6 次 String.replace，年月日里出现相同字母时会互相干扰；
 * 这里改成一次性正则替换，行为更可预期。
 */

'use strict';

var format = require('./format.js');

var TOKEN = /(yyyy|yy|y|mm|m|dd|d|hh|h|ii|i|ss|s|w)/g;

/**
 * @param {String} pattern 形如 'y年m月d日 h:i:s'
 * @param {Date}   [date]  不传则用当前时间
 * @returns {String}
 */
function dateTimeStr(pattern, date) {
	var d = date instanceof Date ? date : new Date();
	var weekday = '日一二三四五六'.charAt(d.getDay());

	var map = {
		yyyy: String(d.getFullYear()),
		yy: String(d.getFullYear()).slice(-2),
		y: String(d.getFullYear()),
		mm: format.pad2(d.getMonth() + 1),
		m: String(d.getMonth() + 1),
		dd: format.pad2(d.getDate()),
		d: String(d.getDate()),
		hh: format.pad2(d.getHours()),
		h: String(d.getHours()),
		ii: format.pad2(d.getMinutes()),
		i: String(d.getMinutes()),
		ss: format.pad2(d.getSeconds()),
		s: String(d.getSeconds()),
		w: weekday
	};

	return String(pattern).replace(TOKEN, function (token) {
		return map[token] !== undefined ? map[token] : token;
	});
}

/** 常用组合，省得每次写 pattern */
function nowText() {
	return dateTimeStr('y年m月d日 h:i:s');
}

/** 'YYYY-MM-DD HH:MM:SS'，适合存库 */
function stamp(date) {
	return dateTimeStr('yyyy-mm-dd hh:ii:ss', date);
}

module.exports = {
	dateTimeStr: dateTimeStr,
	nowText: nowText,
	stamp: stamp
};
