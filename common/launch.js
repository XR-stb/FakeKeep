/**
 * 启动页 / 引导页 / 首页 的路由判断
 *
 * uni-app 的页面里不能使用 onLaunch（那是 App.vue 的生命周期），
 * 所以第一次启动的判断统一放在 pages/init/init 这个"空页面"里做，
 * 由它决定是进引导页还是直接进首页。
 */

'use strict';

var LAUNCH_FLAG = 'launchFlag';

/** 是否第一次启动 */
function isFirstLaunch() {
	try {
		return !uni.getStorageSync(LAUNCH_FLAG);
	} catch (e) {
		return false;
	}
}

/** 标记已启动过 */
function markLaunched() {
	try {
		uni.setStorageSync(LAUNCH_FLAG, 'true');
	} catch (e) {
		// 忽略存储异常
	}
}

/** 重置引导标记（调试用，也可以在设置里做"再看一次引导"） */
function resetLaunchFlag() {
	try {
		uni.removeStorageSync(LAUNCH_FLAG);
	} catch (e) {
		// 忽略存储异常
	}
}

/**
 * 根据是否是首次启动跳转
 * @param {Object} [options] { guideUrl, homeUrl, forceHome }
 */
function routeFromLaunch(options) {
	options = options || {};
	var guideUrl = options.guideUrl || '/pages/guide/guide';
	var homeUrl = options.homeUrl || '/pages/index/index';
	if (!options.forceHome && isFirstLaunch()) {
		markLaunched();
		uni.reLaunch({ url: guideUrl });
	} else {
		uni.reLaunch({ url: homeUrl });
	}
}

module.exports = {
	LAUNCH_FLAG: LAUNCH_FLAG,
	isFirstLaunch: isFirstLaunch,
	markLaunched: markLaunched,
	resetLaunchFlag: resetLaunchFlag,
	routeFromLaunch: routeFromLaunch
};
