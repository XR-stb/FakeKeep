<template>
	<view class="content">
		<!-- 顶部：标题 + 头像（点击头像新增一条跑步记录） -->
		<view class="head">
			<text class="head-title">跑步</text>
			<image class="head-avatar" src="../../static/head-title.jpg" @click="addOne()"></image>
		</view>

		<view class="all-km-label">
			<text class="all-km-label-text">累计跑步距离</text>
			<image class="all-km-icon" src="../../static/photo1.png" mode="aspectFit"></image>
		</view>

		<!-- 累计距离（点击修改） -->
		<view class="all-km" @click="sumKmChange()">
			<view class="all-km-value"><text class="all-km-value-text">{{ sum_run }}</text></view>
			<text class="all-km-unit">公里</text>
		</view>

		<!-- 三个统计卡片 -->
		<view class="big-box">
			<view class="box-1" @click="ChangeGrade()">
				<view class="box-top">
					<view class="dot"></view>
					<text class="title">跑步等级</text>
				</view>
				<view class="box-bottom">
					<image class="box-icon" src="../../static/grade.png" mode="aspectFit"></image>
					<view class="box-value"><text class="box-value-text">Lv.{{ grade }}</text></view>
				</view>
			</view>

			<view class="box-1">
				<view class="box-top">
					<view class="dot dot-2"></view>
					<text class="title">跑力值</text>
				</view>
				<view class="box-bottom box-bottom-center">
					<view class="box-value"><text class="box-value-text">{{ run_val }}</text></view>
				</view>
			</view>

			<view class="box-1" @click="MaxShow()">
				<view class="box-top">
					<view class="dot dot-3"></view>
					<text class="title">最远距离(公里)</text>
				</view>
				<view class="box-bottom box-bottom-center">
					<view class="box-value"><text class="box-value-text">{{ max_run }}</text></view>
				</view>
			</view>
		</view>

		<!-- 本周排名 -->
		<view class="rank">
			<image class="rank-icon" src="../../static/rank.png" mode="aspectFit"></image>
			<text class="rank-title">本周跑步排名</text>
			<view class="rank-bar"></view>
			<image class="photo" :src="img_url" mode="aspectFill" @click="photoChange()"></image>
			<image class="rank-arrow" src="../../static/photo1.png" mode="aspectFit"></image>
		</view>

		<!-- 入口：轨迹截图（Issue #1 新增页面） -->
		<view class="entry" @click="toTrackPage()">
			<view class="entry-left">
				<text class="entry-title">轨迹截图</text>
				<text class="entry-sub">改参数 / 换背景地图 / 保存到相册</text>
			</view>
			<text class="entry-arrow">›</text>
		</view>

		<view class="section-head">
			<text class="section-title">跑步记录</text>
			<text class="section-action" v-if="items.length" @click="clearRecords">清空</text>
		</view>

		<!-- 跑步记录列表 -->
		<scroll-view :scroll-top="scrollTop" scroll-y="true" class="scroll-Y" @scroll="scroll">
			<view class="record" v-for="(item, index) in items" :key="index">
				<text class="record-date">{{ item.data }}</text>
				<view class="detail">
					<image class="path" :src="item.path_url" mode="aspectFill"></image>
					<view class="detail-child">
						<text class="record-time">{{ item.tm }}</text>
						<view class="run-len">
							<view class="record-len"><text class="record-len-text">{{ item.run_len }}</text></view>
							<text class="record-len-unit">公里</text>
						</view>
						<view class="detail-time">
							<text class="detail-time-text">{{ item.use_time }}</text>
							<image class="icon-watch1" src="../../static/watch_1.png" mode="aspectFit"></image>
							<text class="detail-time-text detail-time-gap">{{ item.ave_time }}</text>
							<image class="icon-watch2" src="../../static/watch_2.png" mode="aspectFit"></image>
							<text class="detail-time-text detail-time-gap">{{ item.hot }}</text>
							<image class="icon-hot" src="../../static/hot.png" mode="aspectFit"></image>
						</view>
					</view>
				</view>
			</view>
			<view class="empty" v-if="!items.length">
				<text class="empty-text">还没有跑步记录，点右上角头像添加一条</text>
			</view>
			<view class="scrollSpase"></view>
		</scroll-view>

		<!-- 弹窗：累计跑步距离 -->
		<view :hidden="userFeedbackHidden" class="popup_content">
			<text class="popup_title">输入累计跑步距离</text>
			<text class="popup_hint">保留一位小数，例如 128.6</text>
			<view class="popup_textarea_item">
				<input class="popup_textarea" type="digit" v-model="sum_run" placeholder="请输入公里数" placeholder-class="popup_ph" />
			</view>
			<view class="buttons" @click="submitFeedback"><text class="popup_button">确定</text></view>
			<view class="buttons cancel" @click="closeAllPopups"><text class="popup_button cancel-text">取消</text></view>
		</view>
		<view class="popup_overlay" :hidden="userFeedbackHidden" @click="closeAllPopups"></view>

		<!-- 弹窗：新增记录日期 -->
		<view :hidden="addRecordShow" class="popup_content">
			<text class="popup_title">输入日期</text>
			<text class="popup_hint">格式：8月9日</text>
			<view class="popup_textarea_item">
				<input class="popup_textarea" type="text" v-model="record_data" placeholder="例如 8月9日" placeholder-class="popup_ph" />
			</view>
			<view class="buttons" @click="submitAddRecord"><text class="popup_button">确定</text></view>
			<view class="buttons cancel" @click="closeAllPopups"><text class="popup_button cancel-text">取消</text></view>
		</view>
		<view class="popup_overlay" :hidden="addRecordShow" @click="closeAllPopups"></view>

		<!-- 弹窗：跑步等级 -->
		<view :hidden="inputGradeShow" class="popup_content">
			<text class="popup_title">输入跑步等级</text>
			<text class="popup_hint">请输入正整数，例如 36</text>
			<view class="popup_textarea_item">
				<input class="popup_textarea" type="number" v-model="grade" placeholder="例如 36" placeholder-class="popup_ph" />
			</view>
			<view class="buttons" @click="submitChangeGrade"><text class="popup_button">确定</text></view>
			<view class="buttons cancel" @click="closeAllPopups"><text class="popup_button cancel-text">取消</text></view>
		</view>
		<view class="popup_overlay" :hidden="inputGradeShow" @click="closeAllPopups"></view>

		<!-- 弹窗：最远距离 -->
		<view :hidden="inputMaxShow" class="popup_content">
			<text class="popup_title">输入最远距离</text>
			<text class="popup_hint">保留两位小数，例如 21.10</text>
			<view class="popup_textarea_item">
				<input class="popup_textarea" type="digit" v-model="max_run" placeholder="例如 21.10" placeholder-class="popup_ph" />
			</view>
			<view class="buttons" @click="submitMaxShow"><text class="popup_button">确定</text></view>
			<view class="buttons cancel" @click="closeAllPopups"><text class="popup_button cancel-text">取消</text></view>
		</view>
		<view class="popup_overlay" :hidden="inputMaxShow" @click="closeAllPopups"></view>

		<image class="bottom-bar" src="../../static/bottom.jpg" mode="widthFix"></image>
	</view>
</template>

<script>
	import format from '@/common/format.js';

	/** 最多保留多少条记录，防止本地存储无限增长 */
	var MAX_RECORDS = 60;
	/** 轨迹图片总数（static/path/path1..7.png） */
	var PATH_COUNT = 7;

	/** 从 path_url 里取出轨迹编号，替代原来写死的下标取值 */
	function pathIndexOf(url) {
		var matched = /path(\d+)\.png/.exec(url || '');
		return matched ? parseInt(matched[1], 10) : 0;
	}

	/** 随机取一个和最近两条都不重复的轨迹编号 */
	function pickPathIndex(items) {
		var recent = [];
		for (var i = 0; i < items.length && recent.length < 2; i++) {
			var idx = pathIndexOf(items[i].path_url);
			if (idx) recent.push(idx);
		}
		for (var attempt = 0; attempt < 40; attempt++) {
			var candidate = format.randomInt(1, PATH_COUNT);
			if (recent.indexOf(candidate) === -1) return candidate;
		}
		return format.randomInt(1, PATH_COUNT);
	}

	export default {
		data() {
			return {
				// 注意：所有模板里用到的字段都必须在 data 里声明，
				// 否则在 Vue2 里不是响应式的（运行时改值界面不会更新）
				sum_run: '128.6',
				max_run: '21.10',
				grade: 36,
				run_val: 45,
				img_url: '../../static/head-photo.jpg',
				userFeedbackHidden: true,
				addRecordShow: true,
				inputGradeShow: true,
				inputMaxShow: true,
				record_data: '',
				scrollTop: 0,
				old: { scrollTop: 0 },
				items: [],
				weight: 62
			};
		},
		onLoad() {
			this.run_val = format.randomInt(40, 52);
			this.record_data = format.splitDateTime(format.todayStr(), '').date;
			this.restore();
		},
		onHide() {
			this.persist();
		},
		onUnload() {
			this.persist();
		},
		onBackPress() {
			this.persist();
		},
		methods: {
			/* ------------------------- 存储 ------------------------- */

			restore() {
				try {
					var items = uni.getStorageSync('items');
					if (Array.isArray(items)) this.items = items.slice(0, MAX_RECORDS);

					var maxRun = uni.getStorageSync('max_run');
					if (maxRun !== '' && maxRun !== null && maxRun !== undefined) this.max_run = String(maxRun);

					var imgUrl = uni.getStorageSync('img_url');
					if (imgUrl) this.img_url = imgUrl;

					var sumRun = uni.getStorageSync('sum_run');
					if (sumRun !== '' && sumRun !== null && sumRun !== undefined) {
						this.sum_run = String(sumRun);
					}

					var grade = uni.getStorageSync('grade');
					if (grade !== '' && grade !== null && grade !== undefined) this.grade = grade;

					var weight = uni.getStorageSync('weight');
					if (weight) this.weight = Number(weight) || 62;
				} catch (e) {
					console.warn('[FakeKeep] 读取本地数据失败', e);
				}
			},

			persist() {
				try {
					uni.setStorageSync('items', this.items);
					uni.setStorageSync('img_url', this.img_url);
					uni.setStorageSync('max_run', this.max_run);
					uni.setStorageSync('sum_run', this.sum_run);
					uni.setStorageSync('grade', this.grade);
				} catch (e) {
					console.warn('[FakeKeep] 保存本地数据失败', e);
				}
			},

			/* ------------------------- 弹窗 ------------------------- */

			/** 四个弹窗共用一层遮罩，关闭时全部收起 */
			closeAllPopups() {
				this.userFeedbackHidden = true;
				this.addRecordShow = true;
				this.inputGradeShow = true;
				this.inputMaxShow = true;
			},

			addOne() {
				this.closeAllPopups();
				this.addRecordShow = false;
			},
			MaxShow() {
				this.closeAllPopups();
				this.inputMaxShow = false;
			},
			ChangeGrade() {
				this.closeAllPopups();
				this.inputGradeShow = false;
			},
			sumKmChange() {
				this.closeAllPopups();
				this.userFeedbackHidden = false;
			},

			submitFeedback() {
				var value = format.toNumber(this.sum_run);
				if (value === null || value < 0) {
					uni.showToast({ title: '请输入正确的公里数', icon: 'none' });
					return;
				}
				this.sum_run = format.toFixedStr(value, 1);
				this.closeAllPopups();
				this.persist();
			},

			submitMaxShow() {
				var value = format.toNumber(this.max_run);
				if (value === null || value < 0) {
					uni.showToast({ title: '请输入正确的最远距离', icon: 'none' });
					return;
				}
				this.max_run = format.toFixedStr(value, 2);
				this.closeAllPopups();
				this.persist();
			},

			submitChangeGrade() {
				var value = format.toNumber(this.grade);
				if (value === null || value < 1) {
					uni.showToast({ title: '请输入正整数等级', icon: 'none' });
					return;
				}
				this.grade = Math.round(value);
				this.closeAllPopups();
				this.persist();
			},

			submitAddRecord() {
				var date = String(this.record_data || '').trim();
				if (!date) {
					uni.showToast({ title: '请输入日期', icon: 'none' });
					return;
				}
				// 允许直接写 8月9日 或 8-9 / 8/9
				var normalized = /^\d{1,2}[月\-/]\d{1,2}日?$/.test(date)
					? date.replace(/[-\/]/g, '月').replace(/日?$/, '日')
					: date;
				this.record_data = normalized;
				this.addRecord();
				this.closeAllPopups();
				this.persist();
			},

			/* ------------------------- 记录 ------------------------- */

			/** 新增一条记录：日期用输入的，其余随机生成 */
			addRecord() {
				var idx = pickPathIndex(this.items);
				var stats = format.buildConsistentStats({ weight: this.weight });
				var hour = format.randomInt(6, 8);
				var minute = format.pad2(format.randomInt(1, 55));
				var paceSec = stats.paceSec;
				var seconds = format.pad2(paceSec % 60);

				var record = {
					path_url: '../../static/path/path' + idx + '.png',
					data: this.record_data,
					tm: format.pad2(hour) + ':' + minute + ' 户外跑步',
					run_len: format.toFixedStr(stats.km, 2),
					use_time: format.formatDuration(stats.durationSec, true),
					ave_time: Math.floor(paceSec / 60) + '\'' + seconds + '"',
					hot: String(format.randomInt(60, 220))
				};

				this.items.unshift(record);
				if (this.items.length > MAX_RECORDS) {
					this.items = this.items.slice(0, MAX_RECORDS);
				}
				// 累计距离随之增长，看起来更自然
				var total = format.toNumber(this.sum_run) || 0;
				this.sum_run = format.toFixedStr(total + stats.km, 1);
				if (stats.km > (format.toNumber(this.max_run) || 0)) {
					this.max_run = format.toFixedStr(stats.km, 2);
				}
			},

			clearRecords() {
				var that = this;
				uni.showModal({
					title: '清空跑步记录',
					content: '将删除全部 ' + this.items.length + ' 条记录，确定吗？',
					success: function (res) {
						if (!res.confirm) return;
						that.items = [];
						that.persist();
					}
				});
			},

			photoChange() {
				var that = this;
				uni.chooseImage({
					count: 1,
					sizeType: ['original', 'compressed'],
					sourceType: ['camera', 'album'],
					success: function (res) {
						var filePath = res.tempFilePaths && res.tempFilePaths[0];
						if (!filePath) return;
						// 临时文件重启后会失效，能存就存到本地永久目录
						if (typeof uni.saveFile === 'function') {
							uni.saveFile({
								tempFilePath: filePath,
								success: function (saved) {
									that.img_url = saved.savedFilePath;
								},
								fail: function () {
									that.img_url = filePath;
								}
							});
						} else {
							that.img_url = filePath;
						}
					}
				});
			},

			toTrackPage() {
				this.persist();
				uni.navigateTo({
					url: '../track/track',
					fail: function () {
						uni.showToast({ title: '打开轨迹截图页失败', icon: 'none' });
					}
				});
			},

			/* ------------------------- 滚动 ------------------------- */

			scroll(e) {
				this.old.scrollTop = e.detail.scrollTop;
			},
			goTop() {
				this.scrollTop = this.old.scrollTop;
				var that = this;
				this.$nextTick(function () {
					that.scrollTop = 0;
				});
			}
		}
	};
</script>

<style>
	.content {
		width: 100vw;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		position: fixed;
		padding-top: 80rpx;
		box-sizing: border-box;
		background-color: #ffffff;
	}

	/* ---------------- 顶部 ---------------- */
	.head {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0 50rpx 0 56rpx;
		box-sizing: border-box;
	}
	.head-title {
		font-size: 44rpx;
		font-weight: 700;
		color: #111111;
	}
	.head-avatar {
		width: 174rpx;
		height: 66rpx;
	}

	.all-km-label {
		display: flex;
		flex-direction: row;
		align-items: center;
		align-self: flex-start;
		margin: 20rpx 0 0 56rpx;
	}
	.all-km-label-text {
		font-size: 30rpx;
		color: #9aa0a6;
	}
	.all-km-icon {
		width: 25rpx;
		height: 25rpx;
		margin-left: 12rpx;
	}

	.all-km {
		display: flex;
		flex-direction: row;
		align-items: flex-end;
		align-self: flex-start;
		margin: 4rpx 0 0 56rpx;
	}
	.all-km-value {
		transform: scale(1, 1.2);
		transform-origin: left bottom;
	}
	.all-km-value-text {
		font-size: 68rpx;
		font-weight: 700;
		color: #111111;
	}
	.all-km-unit {
		font-size: 32rpx;
		color: #444444;
		margin-left: 16rpx;
	}

	/* ---------------- 三个统计卡片 ---------------- */
	.big-box {
		display: flex;
		flex-direction: row;
		justify-content: center;
		width: 100%;
		margin-top: 30rpx;
	}
	.box-1 {
		display: flex;
		flex-direction: column;
		background-color: rgb(249, 249, 249);
		height: 150rpx;
		width: 211rpx;
		border-radius: 15rpx;
		margin: 0 12rpx;
		padding-top: 10rpx;
		box-sizing: border-box;
	}
	.box-top {
		display: flex;
		flex-direction: row;
		align-items: center;
		margin-top: 20rpx;
	}
	.dot {
		height: 22rpx;
		width: 10rpx;
		background: linear-gradient(rgb(127, 0, 225), rgb(238, 233, 233));
		border-radius: 100rpx;
		margin-left: 24rpx;
	}
	.dot-2 {
		background: linear-gradient(rgb(255, 45, 81), rgb(238, 233, 233));
	}
	.dot-3 {
		background: linear-gradient(blue, rgb(238, 233, 233));
	}
	.title {
		margin-left: 10rpx;
		font-size: 25rpx;
		color: #9aa0a6;
	}
	.box-bottom {
		display: flex;
		flex-direction: row;
		align-items: center;
		margin-top: 12rpx;
	}
	.box-bottom-center {
		margin-top: 18rpx;
	}
	.box-icon {
		height: 60rpx;
		width: 60rpx;
		margin-left: 20rpx;
	}
	.box-value {
		margin-left: 14rpx;
		transform: scale(1, 1.2);
		transform-origin: left center;
	}
	.box-value-text {
		font-size: 40rpx;
		font-weight: 600;
		color: #111111;
	}

	/* ---------------- 排名 ---------------- */
	.rank {
		width: 92%;
		height: 130rpx;
		margin-top: 30rpx;
		background: rgb(249, 249, 249);
		display: flex;
		flex-direction: row;
		align-items: center;
		border-radius: 15rpx;
	}
	.rank-icon {
		height: 70rpx;
		width: 70rpx;
		margin-left: 30rpx;
	}
	.rank-title {
		font-size: 32rpx;
		font-weight: 500;
		color: #111111;
		margin-left: 20rpx;
	}
	.rank-bar {
		width: 14rpx;
		height: 6rpx;
		background: rgb(14, 184, 58);
		margin-left: 10rpx;
	}
	.photo {
		height: 50rpx;
		width: 50rpx;
		margin-left: auto;
		margin-right: 18rpx;
		border-radius: 50%;
		border: 5rpx rgb(33, 166, 117) solid;
	}
	.rank-arrow {
		height: 25rpx;
		width: 25rpx;
		margin-right: 24rpx;
	}

	/* ---------------- 轨迹截图入口 ---------------- */
	.entry {
		width: 92%;
		margin-top: 24rpx;
		padding: 26rpx 30rpx;
		background: linear-gradient(135deg, #0eba3a, #12d24a);
		border-radius: 18rpx;
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
		box-sizing: border-box;
	}
	.entry-left {
		display: flex;
		flex-direction: column;
	}
	.entry-title {
		font-size: 32rpx;
		font-weight: 700;
		color: #ffffff;
	}
	.entry-sub {
		font-size: 22rpx;
		color: rgba(255, 255, 255, 0.86);
		margin-top: 6rpx;
	}
	.entry-arrow {
		font-size: 48rpx;
		color: #ffffff;
		line-height: 48rpx;
	}

	/* ---------------- 记录列表 ---------------- */
	.section-head {
		width: 90%;
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
		margin-top: 30rpx;
	}
	.section-title {
		font-size: 35rpx;
		font-weight: 300;
		color: #111111;
	}
	.section-action {
		font-size: 26rpx;
		color: #9aa0a6;
	}
	.scroll-Y {
		width: 100%;
		flex: 1;
		overflow: auto;
	}
	.record {
		width: 90%;
		padding: 18rpx 0 20rpx 0;
		margin: 0 auto 6rpx auto;
		border-bottom: 2rpx rgb(232, 232, 232) solid;
		box-sizing: border-box;
	}
	.record-date {
		font-size: 26rpx;
		color: #9aa0a6;
	}
	.detail {
		margin-top: 16rpx;
		display: flex;
		flex-direction: row;
	}
	.path {
		width: 140rpx;
		height: 140rpx;
		border-radius: 12rpx;
	}
	.detail-child {
		margin-left: 30rpx;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
	}
	.record-time {
		font-size: 26rpx;
		color: #9aa0a6;
	}
	.run-len {
		display: flex;
		flex-direction: row;
		align-items: flex-end;
	}
	.record-len {
		transform: scale(1, 1.1);
		transform-origin: left bottom;
	}
	.record-len-text {
		font-size: 52rpx;
		font-weight: 600;
		color: #111111;
	}
	.record-len-unit {
		font-size: 28rpx;
		color: #444444;
		margin-left: 8rpx;
	}
	.detail-time {
		display: flex;
		flex-direction: row;
		align-items: center;
	}
	.detail-time-text {
		font-size: 28rpx;
		color: #444444;
	}
	.detail-time-gap {
		margin-left: 26rpx;
	}
	.icon-watch1 {
		width: 40rpx;
		height: 30rpx;
		margin-left: 8rpx;
	}
	.icon-watch2 {
		width: 22rpx;
		height: 22rpx;
		margin-left: 6rpx;
	}
	.icon-hot {
		width: 34rpx;
		height: 26rpx;
		margin-left: 6rpx;
	}
	.empty {
		padding: 80rpx 60rpx;
		display: flex;
		justify-content: center;
	}
	.empty-text {
		font-size: 26rpx;
		color: #b6bbc0;
		text-align: center;
	}
	.scrollSpase {
		height: 220rpx;
	}
	.bottom-bar {
		bottom: 0;
		width: 750rpx;
		position: fixed;
	}

	/* ---------------- 弹窗 ---------------- */
	.popup_overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background-color: rgba(0, 0, 0, 0.8);
		z-index: 1001;
	}
	.popup_content {
		position: fixed;
		top: 50%;
		left: 50%;
		width: 520rpx;
		margin-left: -260rpx;
		margin-top: -230rpx;
		background-color: #ffffff;
		z-index: 1002;
		border-radius: 20rpx;
		padding: 36rpx 30rpx 20rpx 30rpx;
		box-sizing: border-box;
	}
	.popup_title {
		display: block;
		text-align: center;
		font-size: 32rpx;
		font-weight: 600;
		color: #111111;
	}
	.popup_hint {
		display: block;
		text-align: center;
		font-size: 24rpx;
		color: #9aa0a6;
		margin-top: 10rpx;
	}
	.popup_textarea_item {
		margin-top: 24rpx;
		height: 84rpx;
		background-color: #f1f1f1;
		border-radius: 12rpx;
		display: flex;
		align-items: center;
		padding: 0 20rpx;
	}
	.popup_textarea {
		flex: 1;
		font-size: 28rpx;
		color: #111111;
	}
	.popup_ph {
		color: #c4c8cc;
	}
	.buttons {
		text-align: center;
		font-size: 32rpx;
		margin-top: 28rpx;
	}
	.buttons.cancel {
		margin-top: 16rpx;
		margin-bottom: 10rpx;
	}
	.popup_button {
		color: #0eba3a;
		font-weight: 600;
	}
	.cancel-text {
		color: #9aa0a6;
		font-weight: 400;
	}
</style>
