
<template>
</template>

<script>
	export default {
		data() {
			return {
				
			}
		},
		onLoad() {
			// console.log("init");
			// 从本地缓存中同步获取指定 key 对应的内容，用于判断是否是第一次打开应用
			const value = uni.getStorage('launchFlag');
			if (value) {
				// console.log(111)
				uni.redirectTo({
					url:'../index/index'
				});
			} else {
				// console.log(222)
				// 没有值，跳到引导页，并存储，下次打开就不会进去引导页
				uni.setStorageSync({
					key: 'launchFlag',
					data: true
				});
				uni.redirectTo({
					url: '../guide/guide'
				});
			}
		}
	}
	
</script>

<style>
</style>