(window["webpackJsonp"]=window["webpackJsonp"]||[]).push([["pages-guide-guide"],{"07e1":function(n,t,i){"use strict";var e=i("aef7"),r=i.n(e);r.a},"1fc0":function(n,t,i){"use strict";i.r(t);var e=i("ed5c"),r=i.n(e);for(var a in e)"default"!==a&&function(n){i.d(t,n,(function(){return e[n]}))}(a);t["default"]=r.a},"3bc0":function(n,t,i){"use strict";var e;i.d(t,"b",(function(){return r})),i.d(t,"c",(function(){return a})),i.d(t,"a",(function(){return e}));var r=function(){var n=this,t=n.$createElement,i=n._self._c||t;return i("v-uni-view",{staticClass:"home"},[i("v-uni-swiper",{attrs:{circular:!0,"indicator-dots":!0}},n._l(n.swipers,(function(n){return i("v-uni-swiper-item",[i("v-uni-image",{attrs:{src:n,mode:"widthFix heightFix"}})],1)})),1),i("v-uni-view",{staticClass:"to-index",on:{click:function(t){arguments[0]=t=n.$handleEvent(t),n.to_index.apply(void 0,arguments)}}},[i("v-uni-button",{staticClass:"button-biankuang",attrs:{"hover-class":"bg-click"}},[n._v("去首页")])],1)],1)},a=[]},"69c1":function(n,t,i){"use strict";i.r(t);var e=i("3bc0"),r=i("1fc0");for(var a in r)"default"!==a&&function(n){i.d(t,n,(function(){return r[n]}))}(a);i("07e1");var c,u=i("f0c5"),o=Object(u["a"])(r["default"],e["b"],e["c"],!1,null,"a6122c04",null,!1,e["a"],c);t["default"]=o.exports},"85dd":function(n,t,i){var e=i("24fb");t=e(!1),t.push([n.i,'@charset "UTF-8";\r\n/**\r\n * 这里是uni-app内置的常用样式变量\r\n *\r\n * uni-app 官方扩展插件及插件市场（https://ext.dcloud.net.cn）上很多三方插件均使用了这些样式变量\r\n * 如果你是插件开发者，建议你使用scss预处理，并在插件代码中直接使用这些变量（无需 import 这个文件），方便用户通过搭积木的方式开发整体风格一致的App\r\n *\r\n */\r\n/**\r\n * 如果你是App开发者（插件使用者），你可以通过修改这些变量来定制自己的插件主题，实现自定义主题功能\r\n *\r\n * 如果你的项目同样使用了scss预处理，你也可以直接在你的 scss 代码中使用如下变量，同时无需 import 这个文件\r\n */\r\n/* 颜色变量 */\r\n/* 行为相关颜色 */\r\n/* 文字基本颜色 */\r\n/* 背景颜色 */\r\n/* 边框颜色 */\r\n/* 尺寸变量 */\r\n/* 文字尺寸 */\r\n/* 图片尺寸 */\r\n/* Border Radius */\r\n/* 水平间距 */\r\n/* 垂直间距 */\r\n/* 透明度 */\r\n/* 文章场景相关 */.home[data-v-a6122c04]{margin-top:%?80?%;height:90vh}.home uni-swiper[data-v-a6122c04]{width:100%;height:90vh}.home uni-swiper uni-image[data-v-a6122c04]{width:100%;height:100%}.to-index[data-v-a6122c04]{margin-top:%?0?%}.button-biankuang[data-v-a6122c04]{width:%?200?%;height:%?50?%;display:flex;margin-top:%?30?%;line-height:%?50?%;justify-content:center;border-radius:25px;border:%?3?% solid #69f;font-size:%?28?%}.bg-click[data-v-a6122c04]{top:%?3?%;background-color:#f1f2f6;opacity:1%}',""]),n.exports=t},aef7:function(n,t,i){var e=i("85dd");e.__esModule&&(e=e.default),"string"===typeof e&&(e=[[n.i,e,""]]),e.locals&&(n.exports=e.locals);var r=i("4f06").default;r("6748b1b0",e,!0,{sourceMap:!1,shadowMode:!1})},ed5c:function(n,t,i){"use strict";Object.defineProperty(t,"__esModule",{value:!0}),t.default=void 0;var e={data:function(){return{swipers:["../../static/guide1.png","../../static/guide2.png"]}},methods:{to_index:function(){uni.navigateTo({url:"../index/index"})}},onLaunch:function(){uni.getStorageSync("launchFlag")&&(console.log(111),uni.redirectTo({url:"../index/index"}))}};t.default=e}}]);