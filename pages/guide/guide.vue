<template>
	<view class="home">
		<!-- circular 用来设置循环轮播，indicator-dots 设置下方小圆点 -->
		<swiper class="guide-swiper" circular indicator-dots :indicator-active-color="'#0EBA3A'">
			<swiper-item v-for="(item, index) in swipers" :key="index">
				<image :src="item" mode="aspectFit"></image>
			</swiper-item>
		</swiper>
		<view class="to-index" @click="toIndex">
			<button class="button-biankuang" hover-class="bg-click">进入首页</button>
		</view>
	</view>
</template>

<script>
	export default {
		data() {
			return {
				swipers: [
					'../../static/guide1.png',
					'../../static/guide2.png'
				]
			};
		},
		methods: {
			toIndex() {
				// 引导页是启动后的第一个页面，用 reLaunch 避免返回时又回到引导页
				uni.reLaunch({
					url: '../index/index'
				});
			}
		}
	};
</script>

<!-- 开启 scss -->
<style lang="scss">
	.home {
		display: flex;
		flex-direction: column;
		width: 100vw;
		height: 100vh;
		background-color: #ffffff;
	}

	.guide-swiper {
		flex: 1;
		width: 100%;

		image {
			width: 100%;
			height: 100%;
		}
	}

	.to-index {
		padding: 20rpx 0 60rpx 0;
		display: flex;
		flex-direction: row;
		justify-content: center;
	}

	.button-biankuang {
		width: 300rpx;
		height: 80rpx;
		line-height: 80rpx;
		display: flex;
		justify-content: center;
		border-radius: 40rpx;
		border: 2rpx solid #0eba3a;
		color: #0eba3a;
		font-size: 30rpx;
		background-color: #ffffff;
	}

	.bg-click {
		background-color: #f1f2f6;
		opacity: 0.7;
	}
</style>
