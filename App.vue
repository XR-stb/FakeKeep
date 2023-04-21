<script>
	export default {
		onLaunch: function() {
			console.log('App Launch');
			// plus.navigator.closeSplashscreen();
			// 从本地缓存中同步获取指定 key 对应的内容，用于判断是否是第一次打开应用
			if (uni.getStorageSync('launchFlag')) {
				console.log(111)
				uni.redirectTo({
					url:'../index/index'
				});
			} else {
				console.log(222)
				// 没有值，跳到引导页，并存储，下次打开就不会进去引导页
				uni.setStorageSync('launchFlag', 'true');
				uni.redirectTo({
					url: '../guide/guide'
				});
			}
		},
		onShow: function() {
			console.log('App Show')
		},
		onHide: function() {
			console.log('App Hide')
		}
	}
</script>

<style>
	/*每个页面公共css */
</style>
