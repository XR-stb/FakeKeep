<template>
	<view class="home">
		<!--circular用来设置循环轮播   indicator-dots设置下面小圆点用来点击 -->
		<swiper circular indicator-dots>
			<!-- v-for循环遍历数组 -->
			<swiper-item v-for="item in swipers">
				<image :src="item" mode="widthFix heightFix"></image>
			</swiper-item>
		</swiper>
		<view class="to-index" v-on:click="to_index">
			<button class="button-biankuang" hover-class="bg-click">去首页</button>
		</view>
	</view>
</template>

<script>
	export default {
		data() {
			return {
				swipers:[
					'../../static/guide1.png',
					'../../static/guide2.png'
				]
			}
		},
		methods: {
			to_index() {
				uni.navigateTo({
					url:'../index/index'
				});
			}
		},
		onLaunch(){
			// 从本地缓存中同步获取指定 key 对应的内容，用于判断是否是第一次打开应用
			if (uni.getStorageSync('launchFlag')) {
				console.log(111)
				uni.redirectTo({
					url:'../index/index'
				});
			}
		}
	}
</script>

<!-- 开启scss -->
<style lang="scss">
	.home{
		margin-top: 80rpx;
		height: 90vh;
		swiper{
			width: 100%;
			height: 90vh;
			image{
				width: 100%;
				height: 100%;
			}
		}
	}
	.to-index {
		margin-top: 0rpx;
	}
	.button-biankuang{
			width: 200rpx;
			height: 50rpx;
			display: flex;
			margin-top: 30rpx;
			line-height: 50rpx;
			justify-content: center;
			border-radius: 25px;
			border: 3rpx solid #6699FF;
			font-size: 28rpx;
		}
	.bg-click {
			top: 3upx;
			background-color: rgb(241,242,246);;
			opacity: 70%;
		}

</style>