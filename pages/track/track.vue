<template>
	<view class="track-page">
		<!-- 自定义导航栏 -->
		<view class="nav" :style="{ paddingTop: statusBarHeight + 'px' }">
			<view class="nav-inner">
				<view class="nav-btn" @click="goBack">
					<text class="nav-btn-text">‹ 返回</text>
				</view>
				<text class="nav-title">轨迹截图</text>
				<view class="nav-btn save" @click="saveImage">
					<text class="nav-btn-text save-text">{{ saving ? '生成中' : '保存' }}</text>
				</view>
			</view>
		</view>

		<scroll-view scroll-y class="body">
			<!-- 实时预览：canvas 就是最终截图，所见即所得 -->
			<view class="preview-wrap">
				<canvas
					class="track-canvas"
					canvas-id="trackCanvas"
					id="trackCanvas"
					:style="{ width: canvasW + 'px', height: canvasH + 'px' }"
				></canvas>
			</view>
			<view class="tip">下方任意一项都可以改，改动会立刻反映到上面这张截图</view>

			<!-- 运动数据 -->
			<view class="card">
				<view class="card-head">
					<text class="card-title">运动数据</text>
					<text class="card-sub" @click="resetData">恢复默认</text>
				</view>
				<view class="row" v-for="f in fields" :key="f.key">
					<text class="row-label">{{ f.label }}</text>
					<input
						class="row-input"
						:type="f.type"
						:value="form[f.key]"
						:placeholder="f.placeholder"
						placeholder-class="ph"
						@input="onFieldInput(f, $event)"
						@blur="onFieldBlur(f)"
					/>
					<text class="row-unit">{{ f.unit }}</text>
					<text v-if="f.auto && auto[f.key]" class="row-badge">自动</text>
				</view>
				<view class="row">
					<text class="row-label">运动类型</text>
					<input class="row-input" type="text" :value="form.title" placeholder="户外跑步"
						placeholder-class="ph" @input="onSimpleInput('title', $event)" />
					<text class="row-unit"></text>
				</view>
				<view class="row">
					<text class="row-label">地点</text>
					<input class="row-input" type="text" :value="form.location" placeholder="可留空，显示在卡片右上角"
						placeholder-class="ph" @input="onSimpleInput('location', $event)" />
					<text class="row-unit"></text>
				</view>
				<picker mode="date" :value="form.date" @change="onDateChange">
					<view class="row">
						<text class="row-label">日期</text>
						<text class="row-value">{{ dateText }}</text>
						<text class="row-unit">{{ form.weekday }}</text>
					</view>
				</picker>
				<picker mode="time" :value="form.time" @change="onTimeChange">
					<view class="row">
						<text class="row-label">时间</text>
						<text class="row-value">{{ form.time }}</text>
						<text class="row-unit"></text>
					</view>
				</picker>
			</view>

			<!-- 轨迹 -->
			<view class="card">
				<view class="card-head">
					<text class="card-title">轨迹</text>
					<text class="card-sub" @click="randomizeRoute">换一条</text>
				</view>
				<view class="chips">
					<view
						class="chip"
						v-for="s in routeStyles"
						:key="s.key"
						:class="{ on: form.routeStyle === s.key }"
						@click="pickStyle(s.key)"
					>
						{{ s.name }}
					</view>
				</view>
				<view class="card-head mt">
					<text class="card-title">轨迹颜色</text>
				</view>
				<view class="colors">
					<view
						class="color"
						v-for="c in routeColors"
						:key="c.key"
						:class="{ on: form.routeColor === c.value }"
						:style="{ backgroundColor: c.value }"
						@click="pickColor(c.value)"
					></view>
				</view>
			</view>

			<!-- 背景地图 -->
			<view class="card">
				<view class="card-head">
					<text class="card-title">背景地图</text>
					<text class="card-sub">左右滑动查看更多</text>
				</view>
				<scroll-view scroll-x class="bg-scroll">
					<view class="bg-row">
						<view
							class="bg-item"
							v-for="m in maps"
							:key="m.key"
							:class="{ on: form.backgroundKey === m.key }"
							@click="pickMap(m.key)"
						>
							<image class="bg-thumb" :src="m.src" mode="aspectFill"></image>
							<text class="bg-name">{{ m.name }}</text>
						</view>
						<view
							class="bg-item"
							v-for="p in plains"
							:key="p.key"
							:class="{ on: form.backgroundKey === p.key }"
							@click="pickPlain(p.key)"
						>
							<view class="bg-thumb plain" :style="{ backgroundColor: p.color }"></view>
							<text class="bg-name">{{ p.name }}</text>
						</view>
						<view
							class="bg-item"
							:class="{ on: form.backgroundKey === 'custom' }"
							@click="pickCustomBackground"
						>
							<image v-if="customBackground" class="bg-thumb" :src="customBackground.path" mode="aspectFill"></image>
							<view v-else class="bg-thumb custom"><text class="plus">＋</text></view>
							<text class="bg-name">{{ customBackground ? '相册图片' : '选照片' }}</text>
						</view>
					</view>
				</scroll-view>
			</view>

			<!-- 显示开关 -->
			<view class="card">
				<view class="switch-row">
					<text class="row-label">显示起点 / 终点</text>
					<switch :checked="form.showMarkers" color="#0EBA3A" @change="onToggle('showMarkers', $event)" />
				</view>
				<view class="switch-row">
					<text class="row-label">显示底部水印</text>
					<switch :checked="form.showWatermark" color="#0EBA3A" @change="onToggle('showWatermark', $event)" />
				</view>
			</view>

			<view class="actions">
				<view class="btn primary" @click="randomizeAll">
					<text class="btn-text">随机生成一条记录</text>
				</view>
				<view class="btn ghost" @click="saveImage">
					<text class="btn-text ghost-text">保存到相册</text>
				</view>
			</view>
			<view class="bottom-space"></view>
		</scroll-view>

		<!-- 生成结果大图 -->
		<view v-if="savedPath" class="modal" @click="savedPath = ''">
			<image class="modal-img" :src="savedPath" mode="widthFix" @click.stop="noop"></image>
			<text class="modal-tip">点击空白处关闭 · 长按图片可保存</text>
		</view>
	</view>
</template>

<script>
	import trackState from '@/common/trackState.js';
	import routeUtil from '@/common/route.js';
	import backgrounds from '@/common/backgrounds.js';
	import trackCard from '@/common/trackCard.js';
	import format from '@/common/format.js';

	export default {
		data() {
			// 先给一份保守的默认值，真正的尺寸在 onLoad 里按设备宽度算，
			// 这样首屏渲染时 canvas 就已经是最终尺寸
			var defaultW = 338;
			return {
				canvasW: defaultW,
				canvasH: Math.round((defaultW * trackCard.DESIGN.height) / trackCard.DESIGN.width),
				statusBarHeight: 0,
				form: trackState.createDefaultForm(),
				auto: trackState.createAutoFlags(),
				customBackground: null,
				savedPath: '',
				saving: false,
				fields: trackState.FIELDS,
				routeStyles: routeUtil.ROUTE_STYLES,
				routeColors: backgrounds.ROUTE_COLORS,
				maps: backgrounds.BUILTIN_MAPS,
				plains: backgrounds.PLAIN_BACKGROUNDS
			};
		},
		computed: {
			dateText: function () {
				return trackState.dateLabel(this.form);
			},
			datetimeText: function () {
				return trackState.datetimeText(this.form);
			}
		},
		onLoad: function () {
			// 按设备宽度算画布尺寸（onLoad 早于首屏渲染，不会出现尺寸跳变）
			try {
				var info = uni.getSystemInfoSync();
				var winW = info.windowWidth || 375;
				this.statusBarHeight = info.statusBarHeight || 0;
				this.canvasW = Math.round(winW * 0.9);
				this.canvasH = Math.round((this.canvasW * trackCard.DESIGN.height) / trackCard.DESIGN.width);
			} catch (e) {
				console.warn('[FakeKeep] 获取设备信息失败，使用默认画布尺寸', e);
			}

			// 读取上次填的内容，避免每次都要重填
			try {
				var saved = uni.getStorageSync('trackForm');
				if (saved && typeof saved === 'object') {
					trackState.mergeSaved(this.form, saved);
				}
				var auto = uni.getStorageSync('trackAuto');
				if (auto && typeof auto === 'object') {
					this.auto.calories = auto.calories !== false;
					this.auto.steps = auto.steps !== false;
				}
			} catch (e) {
				console.warn('[FakeKeep] 读取轨迹页缓存失败', e);
			}
			this.form.weekday = format.splitDateTime(this.form.date, '').weekday;
			this.applyRoute();
		},
		onReady: function () {
			this.ctx = uni.createCanvasContext('trackCanvas', this);
			this.prepareBackground();
			this.paint();
		},
		onHide: function () {
			this.persist();
		},
		onUnload: function () {
			this.persist();
		},
		methods: {
			noop: function () {},

			/* ------------------------- 渲染 ------------------------- */

			/** 生成轨迹点（非响应式：canvas 是命令式绘制，不需要 Vue 追踪） */
			applyRoute: function () {
				this.routePoints = routeUtil.buildRoute(this.form.routeStyle, this.form.routeSeed);
			},

			/** 把当前状态画到 canvas 上 */
			renderCard: function () {
				if (!this.ctx) return;
				trackCard.drawCard(this.ctx, {
					width: this.canvasW,
					height: this.canvasH,
					background: this.resolveBackground(),
					route: this.routePoints || [],
					routeColor: this.form.routeColor,
					stats: trackState.toCardStats(this.form),
					title: this.form.title || '户外跑步',
					datetimeText: this.datetimeText,
					locationText: this.form.location || '',
					showMarkers: this.form.showMarkers,
					showWatermark: this.form.showWatermark
				});
			},

			/** 立即绘制；callback 在绘制完成后触发（导出图片必须等它） */
			paint: function (callback) {
				if (!this.ctx) {
					if (callback) callback();
					return;
				}
				this.renderCard();
				this.ctx.draw(false, callback || function () {});
			},

			/** 合并高频改动，避免每敲一个字就重绘一次 */
			scheduleDraw: function () {
				var that = this;
				if (this.drawTimer) clearTimeout(this.drawTimer);
				this.drawTimer = setTimeout(function () {
					that.paint();
				}, 60);
			},

			/** 当前背景配置 */
			resolveBackground: function () {
				var key = this.form.backgroundKey;

				if (key === 'custom') {
					if (this.customBackground) {
						return { type: 'image', image: this.customBackground, theme: backgrounds.CUSTOM_THEME };
					}
					return { type: 'color', color: '#E9EBEE', theme: 'light' };
				}

				var map = backgrounds.findMap(key);
				if (map) {
					return {
						type: 'image',
						src: map.src,
						image: this.bgInfo && this.bgInfo[map.src] ? this.bgInfo[map.src] : null,
						theme: map.theme
					};
				}

				for (var i = 0; i < this.plains.length; i++) {
					if (this.plains[i].key === key) {
						return { type: 'color', color: this.plains[i].color, theme: this.plains[i].theme };
					}
				}
				return { type: 'color', color: '#E9EBEE', theme: 'light' };
			},

			/**
			 * 用 getImageInfo 把图片解析成 canvas 可用的本地路径，并拿到原始尺寸
			 * 以便按 cover 裁剪而不是拉伸变形。失败也不阻塞，退化为直接传 src。
			 */
			prepareBackground: function (callback) {
				var that = this;
				var key = this.form.backgroundKey;

				if (key === 'custom') {
					// 相册图片在 pickCustomBackground 里已经解析好了
					if (callback) callback();
					return;
				}
				var map = backgrounds.findMap(key);
				if (!map) {
					if (callback) callback();
					return;
				}
				var src = map.src;

				if (!this.bgInfo) this.bgInfo = {};
				if (this.bgInfo[src] !== undefined) {
					if (callback) callback();
					return;
				}

				function finish(info) {
					that.bgInfo[src] = info;
					if (callback) callback();
					else that.paint();
				}

				uni.getImageInfo({
					src: src,
					success: function (res) {
						finish({
							path: res.path || res.src || src,
							width: res.width || that.canvasW,
							height: res.height || that.canvasH
						});
					},
					fail: function () {
						// 解析失败时仍然把原始路径交给 drawImage，多数平台可以直接画
						finish({ path: src, width: that.canvasW, height: that.canvasH });
					}
				});
			},

			/* ------------------------- 输入处理 ------------------------- */

			onFieldInput: function (field, e) {
				this.form[field.key] = e.detail.value;
				// 用户手动改过之后就不再自动覆盖
				if (field.auto) this.auto[field.key] = false;
				trackState.syncDerived(this.form, this.auto, field.key);
				this.scheduleDraw();
			},

			onFieldBlur: function (field) {
				trackState.normalizeField(this.form, field.key);
				trackState.syncDerived(this.form, this.auto, field.key);
				this.scheduleDraw();
			},

			onSimpleInput: function (key, e) {
				this.form[key] = e.detail.value;
				this.scheduleDraw();
			},

			/* ------------------------- 交互 ------------------------- */

			pickStyle: function (key) {
				this.form.routeStyle = key;
				this.applyRoute();
				this.scheduleDraw();
			},

			pickColor: function (value) {
				this.form.routeColor = value;
				this.scheduleDraw();
			},

			randomizeRoute: function () {
				this.form.routeSeed = Math.floor(Math.random() * 1000000);
				this.applyRoute();
				this.scheduleDraw();
			},

			pickMap: function (key) {
				this.form.backgroundKey = key;
				var that = this;
				this.prepareBackground(function () {
					that.paint();
				});
			},

			pickPlain: function (key) {
				this.form.backgroundKey = key;
				this.paint();
			},

			pickCustomBackground: function () {
				var that = this;
				uni.chooseImage({
					count: 1,
					sizeType: ['original', 'compressed'],
					sourceType: ['album', 'camera'],
					success: function (res) {
						var filePath = res.tempFilePaths && res.tempFilePaths[0];
						if (!filePath) return;
						uni.getImageInfo({
							src: filePath,
							success: function (info) {
								that.customBackground = {
									path: info.path || filePath,
									width: info.width || that.canvasW,
									height: info.height || that.canvasH
								};
								that.form.backgroundKey = 'custom';
								that.paint();
							},
							fail: function () {
								that.customBackground = { path: filePath, width: that.canvasW, height: that.canvasH };
								that.form.backgroundKey = 'custom';
								that.paint();
							}
						});
					}
				});
			},

			onDateChange: function (e) {
				this.form.date = e.detail.value;
				this.form.weekday = format.splitDateTime(this.form.date, '').weekday;
				this.scheduleDraw();
			},

			onTimeChange: function (e) {
				this.form.time = e.detail.value;
				this.scheduleDraw();
			},

			onToggle: function (key, e) {
				this.form[key] = e.detail.value;
				this.scheduleDraw();
			},

			resetData: function () {
				var that = this;
				uni.showModal({
					title: '恢复默认',
					content: '将清空当前填写的所有运动数据，确定吗？',
					success: function (res) {
						if (!res.confirm) return;
						that.form = trackState.resetData(that.form, that.auto);
						that.applyRoute();
						that.paint();
					}
				});
			},

			/** 一条数据全部随机，但彼此自洽 */
			randomizeAll: function () {
				trackState.randomize(this.form, this.auto);
				this.applyRoute();
				this.paint();
			},

			/* ------------------------- 保存 ------------------------- */

			saveImage: function () {
				if (this.saving) return;
				var that = this;
				this.saving = true;
				uni.showLoading({ title: '生成中...', mask: true });

				this.paint(function () {
					// draw 回调触发后 canvas 内容已就绪，再取图
					setTimeout(function () {
						uni.canvasToTempFilePath(
							{
								canvasId: 'trackCanvas',
								x: 0,
								y: 0,
								width: that.canvasW,
								height: that.canvasH,
								destWidth: that.canvasW * 2,
								destHeight: that.canvasH * 2,
								fileType: 'png',
								quality: 1,
								success: function (res) {
									uni.hideLoading();
									that.saving = false;
									that.savedPath = res.tempFilePath;

									// #ifdef H5
									uni.showToast({ title: '长按图片即可保存', icon: 'none', duration: 2500 });
									// #endif

									// #ifndef H5
									that.saveToAlbum(res.tempFilePath);
									// #endif
								},
								fail: function () {
									uni.hideLoading();
									that.saving = false;
									uni.showToast({ title: '生成图片失败，请重试', icon: 'none' });
								}
							},
							that
						);
					}, 80);
				});
			},

			/** 仅 App / 小程序可用；H5 走「长按保存」 */
			saveToAlbum: function (filePath) {
				var that = this;
				// #ifndef H5
				uni.saveImageToPhotosAlbum({
					filePath: filePath,
					success: function () {
						that.savedPath = '';
						uni.showToast({ title: '已保存到相册', icon: 'success' });
					},
					fail: function (err) {
						var message = (err && err.errMsg) || '';
						if (message.indexOf('auth') !== -1 || message.indexOf('deny') !== -1 || message.indexOf('permission') !== -1) {
							uni.showModal({
								title: '需要相册权限',
								content: '请在设置里允许访问相册后重新保存，也可以长按生成的图片手动保存。',
								confirmText: '去设置',
								success: function (res) {
									if (res.confirm && typeof uni.openSetting === 'function') uni.openSetting();
								}
							});
						} else {
							uni.showToast({ title: '保存失败，可长按图片保存', icon: 'none', duration: 2500 });
						}
					}
				});
				// #endif
			},

			persist: function () {
				try {
					uni.setStorageSync('trackForm', this.form);
					uni.setStorageSync('trackAuto', this.auto);
				} catch (e) {
					console.warn('[FakeKeep] 保存轨迹页状态失败', e);
				}
			},

			goBack: function () {
				var pages = getCurrentPages();
				if (pages && pages.length > 1) {
					uni.navigateBack();
				} else {
					uni.reLaunch({ url: '/pages/index/index' });
				}
			}
		}
	};
</script>

<style>
	.track-page {
		display: flex;
		flex-direction: column;
		height: 100vh;
		background-color: #f4f5f7;
	}

	/* ---------------- 导航栏 ---------------- */
	.nav {
		background-color: #ffffff;
		border-bottom: 1rpx solid #ececec;
	}
	.nav-inner {
		height: 90rpx;
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
		padding: 0 24rpx;
	}
	.nav-title {
		font-size: 34rpx;
		font-weight: 600;
		color: #1a1a1a;
	}
	.nav-btn {
		min-width: 130rpx;
		height: 64rpx;
		display: flex;
		align-items: center;
	}
	.nav-btn.save {
		justify-content: flex-end;
	}
	.nav-btn-text {
		font-size: 30rpx;
		color: #333333;
	}
	.save-text {
		color: #0eba3a;
		font-weight: 600;
	}

	/* ---------------- 主体 ---------------- */
	.body {
		flex: 1;
	}
	.preview-wrap {
		display: flex;
		justify-content: center;
		padding: 24rpx 0 8rpx 0;
	}
	.track-canvas {
		background-color: #e9ebee;
		border-radius: 24rpx;
		box-shadow: 0 8rpx 30rpx rgba(0, 0, 0, 0.12);
	}
	.tip {
		text-align: center;
		font-size: 24rpx;
		color: #9aa0a6;
		padding: 8rpx 40rpx 16rpx 40rpx;
	}

	/* ---------------- 卡片 ---------------- */
	.card {
		background-color: #ffffff;
		border-radius: 22rpx;
		margin: 20rpx 24rpx;
		padding: 8rpx 24rpx 16rpx 24rpx;
	}
	.card-head {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
		padding: 20rpx 0 8rpx 0;
	}
	.card-head.mt {
		margin-top: 8rpx;
	}
	.card-title {
		font-size: 28rpx;
		font-weight: 600;
		color: #1a1a1a;
	}
	.card-sub {
		font-size: 24rpx;
		color: #0eba3a;
	}

	.row {
		display: flex;
		flex-direction: row;
		align-items: center;
		min-height: 88rpx;
		border-bottom: 1rpx solid #f2f2f2;
	}
	.row-label {
		width: 190rpx;
		font-size: 28rpx;
		color: #444444;
	}
	.row-input {
		flex: 1;
		font-size: 28rpx;
		color: #111111;
		text-align: right;
		padding-right: 12rpx;
	}
	.row-value {
		flex: 1;
		font-size: 28rpx;
		color: #111111;
		text-align: right;
		padding-right: 12rpx;
	}
	.row-unit {
		width: 90rpx;
		font-size: 24rpx;
		color: #9aa0a6;
		text-align: right;
	}
	.row-badge {
		font-size: 20rpx;
		color: #0eba3a;
		border: 1rpx solid #b7ecc6;
		background-color: #f0fbf3;
		border-radius: 8rpx;
		padding: 2rpx 8rpx;
		margin-left: 8rpx;
	}
	.ph {
		color: #c4c8cc;
	}

	/* ---------------- 选项 ---------------- */
	.chips {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		padding: 8rpx 0;
	}
	.chip {
		font-size: 25rpx;
		color: #444444;
		background-color: #f4f5f7;
		border-radius: 30rpx;
		padding: 12rpx 26rpx;
		margin: 8rpx 16rpx 8rpx 0;
		border: 1rpx solid #f4f5f7;
	}
	.chip.on {
		color: #0eba3a;
		background-color: #f0fbf3;
		border-color: #0eba3a;
		font-weight: 600;
	}
	.colors {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		padding: 10rpx 0 6rpx 0;
	}
	.color {
		width: 56rpx;
		height: 56rpx;
		border-radius: 50%;
		margin: 8rpx 24rpx 8rpx 0;
		border: 4rpx solid #ffffff;
		box-shadow: 0 0 0 1rpx #e2e2e2;
	}
	.color.on {
		box-shadow: 0 0 0 4rpx #0eba3a;
	}

	/* ---------------- 背景选择 ---------------- */
	.bg-scroll {
		width: 100%;
		white-space: nowrap;
	}
	.bg-row {
		display: flex;
		flex-direction: row;
		padding: 8rpx 0 12rpx 0;
	}
	.bg-item {
		width: 150rpx;
		margin-right: 20rpx;
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.bg-thumb {
		width: 150rpx;
		height: 224rpx;
		border-radius: 14rpx;
		border: 4rpx solid transparent;
		background-color: #e9ebee;
	}
	.bg-thumb.plain {
		border-color: #e2e2e2;
	}
	.bg-item.on .bg-thumb {
		border-color: #0eba3a;
	}
	.bg-thumb.custom {
		display: flex;
		align-items: center;
		justify-content: center;
		border: 2rpx dashed #c4c8cc;
	}
	.plus {
		font-size: 56rpx;
		color: #c4c8cc;
	}
	.bg-name {
		font-size: 22rpx;
		color: #6b7075;
		margin-top: 8rpx;
	}

	/* ---------------- 开关 ---------------- */
	.switch-row {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
		min-height: 92rpx;
		border-bottom: 1rpx solid #f2f2f2;
	}

	/* ---------------- 按钮 ---------------- */
	.actions {
		padding: 10rpx 24rpx 0 24rpx;
	}
	.btn {
		height: 92rpx;
		border-radius: 46rpx;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 20rpx;
	}
	.btn.primary {
		background-color: #0eba3a;
	}
	.btn.ghost {
		background-color: #ffffff;
		border: 1rpx solid #e2e2e2;
	}
	.btn-text {
		font-size: 30rpx;
		color: #ffffff;
		font-weight: 600;
	}
	.ghost-text {
		color: #333333;
	}
	.bottom-space {
		height: 60rpx;
	}

	/* ---------------- 结果弹层 ---------------- */
	.modal {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: rgba(0, 0, 0, 0.86);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		z-index: 99;
	}
	.modal-img {
		width: 78%;
		border-radius: 18rpx;
	}
	.modal-tip {
		margin-top: 26rpx;
		font-size: 24rpx;
		color: #cfcfcf;
	}
</style>
