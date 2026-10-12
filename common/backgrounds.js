/**
 * 背景底图 / 轨迹配色 / 主题 的定义
 *
 * 内置地图是 tools/gen-maps.js 用程序生成的"示意地图"
 * （道路、水系、绿地都是几何图形，不含任何真实地理数据），
 * 因此可以自由分发，也便于用户再生成更多款式。
 */

'use strict';

/** 内置示意地图；theme 决定轨迹描边与胶囊配色走明色还是暗色方案 */
var BUILTIN_MAPS = [
	{ key: 'map1', name: '浅色街区', src: '/static/maps/map1.png', theme: 'light' },
	{ key: 'map2', name: '城市公园', src: '/static/maps/map2.png', theme: 'light' },
	{ key: 'map3', name: '滨水绿道', src: '/static/maps/map3.png', theme: 'light' },
	{ key: 'map4', name: '夜间街道', src: '/static/maps/map4.png', theme: 'dark' },
	{ key: 'map5', name: '湖畔郊野', src: '/static/maps/map5.png', theme: 'light' },
	{ key: 'map6', name: '网格新城', src: '/static/maps/map6.png', theme: 'light' }
];

/** 纯色底（不想用地图时） */
var PLAIN_BACKGROUNDS = [
	{ key: 'plain-light', name: '浅灰', color: '#EDEFF2', theme: 'light' },
	{ key: 'plain-dark', name: '深灰', color: '#1B1F24', theme: 'dark' },
	{ key: 'plain-green', name: '青绿', color: '#0F2E24', theme: 'dark' }
];

/** 轨迹配色 */
var ROUTE_COLORS = [
	{ key: 'keep-green', name: 'Keep 绿', value: '#0EBA3A' },
	{ key: 'lake-blue', name: '湖水蓝', value: '#1E9BF0' },
	{ key: 'sunset-orange', name: '落日橙', value: '#FF7A2F' },
	{ key: 'violet', name: '紫罗兰', value: '#8B5CF6' },
	{ key: 'rose', name: '玫红', value: '#F5453B' },
	{ key: 'ink', name: '曜石黑', value: '#20242A' }
];

var DEFAULT_ROUTE_COLOR = ROUTE_COLORS[0].value;

/** 自定义相册图片作为底图时的主题（描边用"黑+白"双层 casing，适应任意照片） */
var CUSTOM_THEME = 'dark';

function findMap(key) {
	for (var i = 0; i < BUILTIN_MAPS.length; i++) {
		if (BUILTIN_MAPS[i].key === key) return BUILTIN_MAPS[i];
	}
	return null;
}

module.exports = {
	BUILTIN_MAPS: BUILTIN_MAPS,
	PLAIN_BACKGROUNDS: PLAIN_BACKGROUNDS,
	ROUTE_COLORS: ROUTE_COLORS,
	DEFAULT_ROUTE_COLOR: DEFAULT_ROUTE_COLOR,
	CUSTOM_THEME: CUSTOM_THEME,
	findMap: findMap
};
