<script>
	export default {
		onLaunch: function () {
			// 具体跳到引导页还是首页，交给启动页 pages/init/init 处理：
			// App.vue 的 onLaunch 阶段页面栈还没准备好，在这里 redirectTo 并不稳定。
			console.log('[FakeKeep] App Launch');
		},
		onShow: function () {
			console.log('[FakeKeep] App Show');
		},
		onHide: function () {
			console.log('[FakeKeep] App Hide');
		},
		onError: function (err) {
			console.error('[FakeKeep] App Error', err);
		}
	};
</script>

<style>
	/* 每个页面公共 css */
	page {
		background-color: #f4f5f7;
	}
</style>
