<template>
	<view class="content">
		<view class="head">
			<h2 class="head-title">跑步</h2>
			<image src="../../static/head-title.jpg" mode="" v-on:click="addOne()"></image>
		</view>
		<view style="display: flex; flex-direction: row; font-size: 34rpx; color: gray; position: relative; left: -226rpx; margin-top: 20rpx;">
			累计跑步距离
			<image src="../../static/photo1.png" mode="" style='height:25rpx;width: 25rpx;margin-top:14rpx;margin-left:14rpx ;'></image>
		</view>
		<!-- <image class="top" src="/static/top.png"></image> -->
		<view class="all-km" v-on:click="sumKmChange()">
			<h1 style='transform: scale(1, 1.2);'>{{sum_run}}</h1>
			<h4 style='padding-top: 15%; position: relative; right: -10rpx; top: 10rpx; font-weight: 400;'>公里</h4>
		</view>
		<view class="big-box">
			<view class="box-1" v-on:click="ChangeGrade()">
				<view class="box-top">
					<view class="dot"></view>
					<view class="title">
						跑步等级
					</view>
				</view>
				<view class="box-bottom">
					<image src="../../static/grade.png" mode="" style="height: 60rpx; width: 60rpx; margin-left: 14rpx;"></image>
					<h3 style='margin: 10rpx; transform: scale(1, 1.2);' >Lv.{{grade}}</h3>
				</view>
			</view>
			<view class="box-1">
				<view class="box-top">
					<view class="dot dot-2"></view>
					<view class="title">跑力值</view>	
				</view>
				<view class="box-bottom" style="margin-top:22rpx;">
					<h3 style="margin-left: 24rpx; font-size: 40rpx; transform: scale(1, 1.2);">{{run_val}}</h3>
				</view>
			</view>
			<view class="box-1" v-on:click="MaxShow()">
				<view class="box-top">
					<view class="dot dot-3"></view>
					<view class="title">最远距离(公里)</view>
				</view>
				<view class="box-bottom" style="margin-top:22rpx;">
					<h3 style="margin-left: 24rpx; transform: scale(1, 1.2);">{{max_run}}</h3>
				</view>
			</view>
		</view>
		<view class="rank">
			<image src="../../static/rank.png" mode="" style='height:70rpx;width: 70rpx;margin-top:25rpx;margin-left:30rpx;'></image>
			<h4 style="margin-top:38rpx;margin-left:20rpx;">本周跑步排名</h4>
			<view style="width: 14rpx; height: 6rpx;background: rgb(14,184,58);margin-top:60rpx;margin-left:10rpx;"></view>
			<!-- <image src="../../static/photo.jpg" mode=""  class="photo"></image> -->
			<image :src="img_url" mode="" v-on:click="photoChange()" class="photo"></image>
			<image src="../../static/photo1.png" mode="" style='height:25rpx;width: 25rpx;margin-top:49rpx;margin-left:14rpx ;'></image>
		</view>
		<p style="margin: 60rpx 72% 0 0; font-size:35rpx; font-weight:300" >跑步记录</p>
		<scroll-view :scroll-top="scrollTop" scroll-y="true" class="scroll-Y" @scrolltoupper="upper" @scrolltolower="lower" @scroll="scroll">
			<view class="record" v-for="(item, index) in items">
				<view class="data" style="color: gray;">{{item.data}}</view>
				<view class="detail">
					<image :src="item.path_url" class="path" mode=""></image>
					<view class="detail-child">
						<view class="time" style="font-size: 28rpx; color: gray;">{{item.tm}}</view>
						<view class="run-len">
							<h2 style=" transform: scale(1, 1.1);">{{item.run_len}}</h2> 
							<view style="margin-top: 26rpx; font-size: 30rpx; margin-left:6px;">公里</view>
						</view>
						<view class="detail-time">
							<view class="use-time" style="font-size: 30rpx;" >{{item.use_time}}</view>
							<image src="../../static/watch_1.png" mode="" style="width: 40rpx; height: 30rpx;margin-top: 8rpx;"></image>
							<view class="ave-time" style="font-size: 30rpx;margin-left: 30rpx;">{{item.ave_time}}</view>
							<image src="../../static/watch_2.png" mode="" style="width: 22rpx; height: 22rpx;margin-top: 12rpx; margin-left: 6rpx;"></image>
							<view class="hot" style="font-size: 32rpx;margin-left: 30rpx;">{{item.hot}}</view> 
							<image src="../../static/hot.png" mode="" style="width: 34rpx; height: 26rpx;margin-top: 12rpx; margin-left: 6rpx;"></image>
						</view>
					</view>
				</view>
			</view>
			<view class="scrollSpase" style="height: 200rpx;"></view>
		</scroll-view>
		<!-- 累计跑步距离输入 userFeedbackHidden-->
		<view :hidden="userFeedbackHidden" class="popup_content">  
					<view class="popup_title">输入累计跑步距离（一位小数）</view>
					<view class="popup_textarea_item">
						<input type="text"  class="popup_textarea" value=""  v-model="sum_run" placeholder="输入你的库存"/>
					<view @click="submitFeedback" class="buttons">
						<text class="popup_button">确定</text>
					</view>
				</view>
			</view>
		<view class="popup_overlay" :hidden="userFeedbackHidden" @click="hideDiv()"></view>
		<!-- end -->
		<!-- 新增日期输入 -->
		<view :hidden="addRecordShow" class="popup_content">  
					<view class="popup_title">输入日期（格式：8月9日）</view>
					<view class="popup_textarea_item">
						<input type="text"  class="popup_textarea" value=""  v-model="record_data" placeholder="格式为：8月9日"/>
					<view @click="submitAddRecord" class="buttons">
						<text class="popup_button">确定</text>
					</view>
				</view> 
			</view>
		<view class="popup_overlay" :hidden="addRecordShow" @click="hideDiv()"></view>
		<!-- end -->
		<!-- 跑波等级输入grade-->
		<view :hidden="inputGradeShow" class="popup_content">  
					<view class="popup_title">输入跑步等级（输入整数）</view>
					<view class="popup_textarea_item">
						<input type="text"  class="popup_textarea" value=""  v-model="grade" placeholder="格式：正整数"/>
					<view @click="submitChangeGrade" class="buttons">
						<text class="popup_button">确定</text>
					</view>
				</view>
			</view>
		<view class="popup_overlay" :hidden="inputGradeShow" @click="hideDiv()"></view>
		<!-- end -->
		<!-- 最远距离输入 -->
		<view :hidden="inputMaxShow" class="popup_content">  
					<view class="popup_title">输入最远距离（两位小数）</view>
					<view class="popup_textarea_item">
						<input type="text"  class="popup_textarea" value=""  v-model="max_run" placeholder="两位小数"/>
					<view @click="submitMaxShow" class="buttons">
						<text class="popup_button">确定</text>
					</view>
				</view>
			</view>
		<view class="popup_overlay" :hidden="inputMaxShow" @click="hideDiv()"></view>
		<!-- end -->
		<image src="../../static/bottom.jpg" mode="widthFix" style="bottom: 0;width: 760rpx; position: fixed;"></image>
	</view>
</template>

<script>
	import getDateTime from '@/common/getdateTime.js'; 
	export default {
		data() {
			return {
				sum_run: 12.3,
				max_run: '2.85',
				img_url: '../../static/head-photo.jpg',//默认头像地址
				path_url: '../../static/path/path1.png',
				userFeedbackHidden: true, // 默认隐藏
				addRecordShow: true,
				inputGradeShow: true,
				inputMaxShow: true,//最远距离
				feedbackContent: '' ,// 输入值
				record_data: '8月13日',
				scrollTop: 0,
				grade:1,//跑步等级
				old: {
					scrollTop: 0
				},
				items:[
					//记录跑步的记录
					
				]
			}
		},
		onLoad() {
				this.run_val = Math.ceil(Math.random()*10) + 40;//跑力值
				this.sum_run = 12.4;
				this.max_run = (Math.random() * 3 + 2).toFixed(2);
				// y:年 m:月 d:日 h:时 i:分 s:秒 中间的分割符号可更改
				var timeStr = getDateTime.dateTimeStr('y年m月d日 h:i:s'); 
				// console.log(timeStr.substr(5, 6));
				this.record_data = timeStr.substr(5, 6);
				try{
					if(uni.getStorageSync('items')){
						this.items = uni.getStorageSync('items');
					}
					if(uni.getStorageSync('max_run')){
						this.max_run = uni.getStorageSync('max_run');
					}
					if(uni.getStorageSync('img_url')){
						this.img_url = uni.getStorageSync('img_url');
						// console.log(this.img_url);
					}else{
						this.img_url = '../../static/head-photo.jpg';
					}
					if(uni.getStorageSync('sum_run')){
						this.sum_run = uni.getStorageSync('sum_run');
					}else{
						this.sum_run = (Math.random() * 10 + 5).toFixed(1);
					}
				}catch(e){
					//TODO handle the exception
					// console.log(e);
				}
				// console.log("index end");
		},
		onBackPress() {
			uni.setStorageSync('items', this.items);
			uni.setStorageSync('img_url', this.img_url);
			uni.setStorageSync('max_run', this.max_run);
			uni.setStorageSync('sum_run', this.sum_run);
		},
		onHide() {
			uni.setStorageSync('items', this.items);
			uni.setStorageSync('img_url', this.img_url);
			uni.setStorageSync('max_run', this.max_run);
			uni.setStorageSync('sum_run', this.sum_run);
		},
		methods: {
			addOne() {
				this.addRecordShow = false;
			},
			addRecord() {//增加一条记录，日期自己调，其他随机生成
				let record = {
					// month: '8',
					// day: '13',
					path_url: '../../static/path/path1.png',
					data: '6月13日',
					tm: '07:09 户外跑步',
					run_len: '1.3',
					use_time: '09:23',
					ave_time: '03\'40\"',
					hot: '116'
				};
				
				let idx = parseInt(Math.random()*(7-1+1)+1);
				let len = this.items.length;
				while(true){
					if(len == 0) break;
					if(len == 1) {
						if(parseInt(this.items[0].path_url[22]) === idx) {
							idx = parseInt(Math.random()*(7-1+1)+1);
							continue;
						}
						else {
							break;
						}
					}
					if(len >= 2) {
						if(parseInt(this.items[0].path_url[22]) === idx || parseInt(this.items[1].path_url[22]) === idx) {
							idx = parseInt(Math.random()*(7-1+1)+1);
							continue;
						}
						else {
							break;
						}
					}
				}
				record.path_url = '../../static/path/path' + idx + '.png';
				
				
				record.data = this.record_data;
				
				let h = 7, min = Math.ceil(Math.random()*15);
				if(min < 10) min = '0' + min;
				record.tm = '0' + h + ':' + min + ' 户外跑步' 
				
				record.run_len = parseFloat((Math.random()+0.9).toFixed(2));
				
				let use_min = Math.ceil(Math.random()*4+6), sec = Math.ceil(Math.random()*60);
				if(use_min < 10) use_min = '0' + use_min;
				if(sec < 10) sec = '0' + sec;
				record.use_time = '00:' + use_min + ':' + sec;
				
				sec = Math.ceil(Math.random()*40);
				if(sec < 10) sec = '0' + sec;
				record.ave_time = '04\'' + sec + '\"'; 
				
				record.hot = Math.ceil(Math.random()*90) + 70;
				
				
				this.items.unshift(record);//添加该条数据到开头
			},
			photoChange() {
				// console.log("pc start");
				var that = this;
				uni.chooseImage({
					count: 1,
					sizeType: ['original', 'compressed'],
					sourceType: ['camera','album'], 
					success: (res) => {
						// console.log(res.tempFilePaths)
						const tempFilePaths = res.tempFilePaths + '';
						this.img_url = tempFilePaths;
					},
				});
			},
			MaxShow() {
				this.inputMaxShow = false;
			},
			ChangeGrade() {
				this.inputGradeShow = false;
			},
			showDiv() { // 显示输入弹出框
				this.userFeedbackHidden = false;
			},
			hideDiv() { // 隐藏输入弹出框
				this.userFeedbackHidden = true;
			},
			submitFeedback() { // 提交
				this.userFeedbackHidden = true;
			},
			submitAddRecord() {//提交日期输入
				this.addRecordShow = true;
				this.addRecord();
			},
			submitMaxShow() {//提交最远距离
				this.inputMaxShow = true;
			},
			submitChangeGrade() {
				this.inputGradeShow = true;
			},
			sumKmChange() {
				this.userFeedbackHidden = false;
			},
			upper: function(e) {
				// console.log(e)
			},
			lower: function(e) {
				// console.log(e)
			},
			scroll: function(e) {
				// console.log(e)
				this.old.scrollTop = e.detail.scrollTop
			},
			goTop: function(e) {
				// 解决view层不同步的问题
				this.scrollTop = this.old.scrollTop
				this.$nextTick(function() {
					this.scrollTop = 0
				});
				uni.showToast({
					icon: "none",
					title: "纵向滚动 scrollTop 值已被修改为 0"
				})
			}
		},
		
	}
</script>

<style>
	.content {
		width: 100vw;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		margin-top: 80rpx;
	    position: fixed;
	}
	.head{
	   position: relative;
	   display: flex;
	   flex-direction: row;
	   justify-content: space-between;
	   padding-left: 56rpx;
	   padding-right: 50rpx;
	   left: -30rpx;
	}
	.head-title{
		margin-right: 230rpx;
		font-size: 40rpx;
		/* margin-top: 6rpx; */
		/* font-size: 44rpx; */
	}
	.head image{
	   width: 174rpx;
	   height: 66rpx;
	   margin-bottom: 10rpx;
	   margin-left: 150rpx;
	   position: relative;
	   right: -50rpx;
	}
	
	.all-km {
		display: flex;
		flex-direction: row;
		padding-right: 65%;
	}
	
	.big-box{
		display: flex;
		flex-direction: row;
		margin-right: 35rpx;
		margin-top: 10rpx;
	}
	.box-1{
		display: flex;
		flex-direction: column;
		background-color: rgb(249, 249, 249);
		height: 150rpx;
		width: 211rpx;
		border-radius: 15rpx;
		margin-left: 25rpx;
		padding-top: 10rpx;
	}
	.box-top{
		display: flex;
		flex-direction: row;
		margin-top: 20rpx;
	}
	.dot {
		height: 22rpx;
		width: 10rpx;
		background: linear-gradient(rgb(127, 0, 225), rgb(238,233,233));
		border-radius: 100rpx;
		margin-left: 24rpx;
		margin-top: 8rpx;
	}
	.dot-2 {
		background: linear-gradient(rgb(255,45,81), rgb(238,233,233));
	}
	.dot-3 {
		background: linear-gradient(blue, rgb(238,233,233));
	}
	.title{
		margin-left: 10rpx;
		font-size: 27rpx;
		color: gray;
	}
	.box-bottom{
		display: flex;
		flex-direction: row;
		margin-top: 10rpx;
	}
	.rank {
		width: 92%;
		height: 130rpx;
		margin-top: 30rpx;	
		background: rgb(249,249,249);	
		display: flex;
		flex-direction: row;
		
	}
	.photo {
		height:50rpx;
		width: 50rpx;
		margin-top:35rpx;
		margin-left:230rpx;
		border-radius: 50%;
		border: 5rpx rgb(33,166,117) solid;   
	}
	.record {
		width: 90%;
		height: 240rpx;
		background: white;
		margin-top: 36rpx;
		margin-left: 26rpx;
		border-bottom: 2rpx rgb(232, 232, 232) solid;
		position: relative;
		right: -18rpx;
	}
	.detail {
		margin-top: 20rpx;
		display: flex;
		flex-direction: row;
	}
	.path {
		width: 140rpx;
		height: 140rpx;
	}
	.run-len {
		display: flex;
		flex-direction: row;
	}
	.detail-child {
		margin-left: 30rpx;
	}
	.detail-time {
		display: flex;
		flex-direction: row;
	}

	.topt{
		
	}
	
	/* //弹窗 */
	.popup_overlay {
		position: fixed;
		top: 0%;
		left: 0%;
		width: 100%;
		height: 100%;
		background-color: black;
		z-index: 1001;
		-moz-opacity: 0.8;
		opacity: .80;
		filter: alpha(opacity=88);
	}
		 
	.popup_content {
		position: fixed;
		top: 50%;
		left: 50%;
		width: 480rpx;
		height: 230rpx;
		margin-left: -270rpx;
		margin-top: -270rpx;
		border: 10px solid white;
		background-color: white;
		z-index: 1002;
		overflow: auto;
		border-radius: 15rpx;
	}
		 
	.popup_title {
		width: 480rpx;
		text-align: center;
		font-size: 32rpx;
		color: black;
	}
		 
	.popup_textarea_item {
		padding-top: 5rpx;
		height: 50rpx;
		width: 440rpx;
		background-color: #F1F1F1;
		margin-top: 20rpx;
		margin-left: 20rpx;
		padding-top: 25rpx;
	}
		 
	.popup_textarea {
		width: 410rpx;
		font-size: 26rpx;
		margin-left: 20rpx;
	}
		 
	.popup_button {
		color: #000000;
		padding-top: 40rpx;
	}
	.buttons{
		text-align: center;
		font-size: 32rpx;
		margin-top: 40rpx;
	}
	/* //scrollview滚动 */
	.scroll-Y {
		flex: auto;
		overflow: auto;
	}
	
</style>
