<template>
	<!-- 启动中转页：不渲染任何内容，只负责决定进引导页还是首页 -->
	<view class="init"></view>
</template>

<script>
	import launch from '@/common/launch.js';

	export default {
		data() {
			return {
				routed: false
			};
		},
		onShow() {
			// 放在 onShow 而不是 onLoad：此时页面栈已经就绪，reLaunch 更稳
			// routed 标记避免重复跳转
			if (this.routed) return;
			this.routed = true;
			// 判断逻辑统一放在 common/launch.js 里，页面只负责调用
			launch.routeFromLaunch();
		}
	};
</script>

<style>
	.init {
		width: 100vw;
		height: 100vh;
		background-color: #ffffff;
	}
</style>
