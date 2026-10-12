package com.fakekeep.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentValues;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.ConsoleMessage;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.OutputStream;

/**
 * FakeKeep 的 WebView 外壳。
 *
 * 把 uni-app 编译出来的 H5 产物（assets/www）装进一个原生 WebView 里，
 * 并补上 H5 在浏览器里做不到的两件事：
 *   1. 选图片：WebChromeClient.onShowFileChooser（相册 + 拍照）
 *   2. 存图片：长按生成的分享卡 -> 写入系统相册
 *
 * 只用 Android 框架 API，不依赖 AndroidX，因此可以直接用 aapt2 + d8 + apksigner 构建，
 * 不需要 Gradle（见 tools/build-apk.js）。
 */
public class MainActivity extends Activity {

    private static final String TAG = "FakeKeep";
    private static final String ENTRY_URL = "file:///android_asset/www/index.html";
    private static final int REQ_FILE_CHOOSER = 1001;
    private static final int REQ_STORAGE_PERM = 1002;

    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraOutputUri;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        webView.setBackgroundColor(0xFFFFFFFF);
        setContentView(webView, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        configureWebView();
        requestLegacyStoragePermissionIfNeeded();

        webView.loadUrl(ENTRY_URL);
    }

    private void configureWebView() {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // uni.setStorageSync 依赖 localStorage
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setLoadsImagesAutomatically(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        // 忽略系统字体放大，避免页面布局被撑坏
        s.setTextZoom(100);
        try {
            s.setAllowFileAccessFromFileURLs(true);
            s.setAllowUniversalAccessFromFileURLs(true);
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        } catch (Throwable t) {
            Log.w(TAG, "部分 WebSettings 在当前系统上不可用", t);
        }
        try {
            WebView.setWebContentsDebuggingEnabled(true); // chrome://inspect 可调试
        } catch (Throwable ignored) {
        }

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // 全部在本 WebView 内打开（应用是纯本地资源）
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                Log.i(TAG, "页面加载完成: " + url);
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                Log.e(TAG, "加载失败 " + failingUrl + " : " + description);
                // 把 assets 里真实存在的条目打出来。
                // 之前踩过一个坑：aapt2 在 Windows 上把条目名写成了 assets\www\index.html（反斜杠），
                // AssetManager 按 assets/www/index.html 找不到，页面直接 ERR_FILE_NOT_FOUND，
                // 而 APK 看起来一切正常。有了这几行日志，一眼就能看出是路径分隔符的问题。
                dumpAssetTree("www");
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                return openImageChooser(callback);
            }

            @Override
            public boolean onConsoleMessage(ConsoleMessage msg) {
                Log.d(TAG, "[web] " + msg.message() + " @" + msg.sourceId() + ":" + msg.lineNumber());
                return true;
            }
        });

        // 长按生成的分享卡（data:image/... base64）即可存进相册
        webView.setOnLongClickListener(new View.OnLongClickListener() {
            @Override
            public boolean onLongClick(View v) {
                return handleLongPress();
            }
        });
    }

    /** 把 assets 下的目录结构打到 logcat，方便排查本地资源找不到的问题 */
    private void dumpAssetTree(String dir) {
        try {
            String[] names = getAssets().list(dir);
            Log.e(TAG, "assets/" + dir + " 下共 " + (names == null ? 0 : names.length) + " 项: " +
                    (names == null ? "" : android.text.TextUtils.join(", ", names)));
            String[] root = getAssets().list("");
            Log.e(TAG, "assets 根目录 " + (root == null ? 0 : root.length) + " 项: " +
                    (root == null ? "" : android.text.TextUtils.join(", ", root)));
        } catch (Exception e) {
            Log.e(TAG, "列举 assets 失败", e);
        }
    }

    /* ----------------------------- 选图片 ----------------------------- */

    private boolean openImageChooser(ValueCallback<Uri[]> callback) {
        if (fileCallback != null) {
            fileCallback.onReceiveValue(null);
        }
        fileCallback = callback;

        Intent gallery = new Intent(Intent.ACTION_GET_CONTENT);
        gallery.addCategory(Intent.CATEGORY_OPENABLE);
        gallery.setType("image/*");

        Intent chooser = Intent.createChooser(gallery, "选择图片");

        cameraOutputUri = createCameraOutputUri();
        if (cameraOutputUri != null) {
            Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            camera.putExtra(MediaStore.EXTRA_OUTPUT, cameraOutputUri);
            if (camera.resolveActivity(getPackageManager()) != null) {
                chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{ camera });
            }
        }

        try {
            startActivityForResult(chooser, REQ_FILE_CHOOSER);
            return true;
        } catch (Exception e) {
            Log.e(TAG, "打开图片选择器失败", e);
            fileCallback = null;
            cameraOutputUri = null;
            toast("无法打开图片选择器");
            return false;
        }
    }

    /** 给相机准备一个 MediaStore 输出位置，避免使用 file:// 触发 FileUriExposedException */
    private Uri createCameraOutputUri() {
        try {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Images.Media.DISPLAY_NAME, "fakekeep_bg_" + System.currentTimeMillis() + ".jpg");
            values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                values.put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/FakeKeep");
            }
            return getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
        } catch (Exception e) {
            Log.w(TAG, "相机输出位置创建失败", e);
            return null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != REQ_FILE_CHOOSER) {
            super.onActivityResult(requestCode, resultCode, data);
            return;
        }
        Uri[] result = null;
        if (resultCode == RESULT_OK) {
            boolean cameraResult = (data == null || data.getData() == null);
            if (cameraResult && cameraOutputUri != null) {
                result = new Uri[]{ cameraOutputUri };
            } else {
                try {
                    result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
                } catch (Exception e) {
                    Log.e(TAG, "解析选择结果失败", e);
                }
            }
        }
        if (fileCallback != null) {
            fileCallback.onReceiveValue(result);
            fileCallback = null;
        }
        cameraOutputUri = null;
    }

    /* ----------------------------- 存图片 ----------------------------- */

    private boolean handleLongPress() {
        WebView.HitTestResult hit = webView.getHitTestResult();
        if (hit == null) {
            return false;
        }
        String extra = hit.getExtra();
        // 只处理 canvas 导出的 base64 图片，避免长按普通缩略图也弹保存框
        if (extra == null || !extra.startsWith("data:image/")) {
            return false;
        }
        final Bitmap bitmap = decodeDataUrl(extra);
        if (bitmap == null) {
            return false;
        }
        new AlertDialog.Builder(this)
                .setTitle("保存图片")
                .setMessage("把这张图片保存到系统相册？")
                .setPositiveButton("保存", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface dialog, int which) {
                        saveBitmapToGallery(bitmap);
                    }
                })
                .setNegativeButton("取消", null)
                .show();
        return true;
    }

    private Bitmap decodeDataUrl(String dataUrl) {
        try {
            int comma = dataUrl.indexOf(',');
            if (comma < 0) {
                return null;
            }
            byte[] bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (Throwable t) {
            Log.e(TAG, "解析图片数据失败", t);
            return null;
        }
    }

    private void saveBitmapToGallery(Bitmap bitmap) {
        OutputStream out = null;
        try {
            String name = "FakeKeep_" + System.currentTimeMillis() + ".png";
            ContentValues values = new ContentValues();
            values.put(MediaStore.Images.Media.DISPLAY_NAME, name);
            values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
            boolean scoped = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q;
            if (scoped) {
                values.put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/FakeKeep");
                values.put(MediaStore.Images.Media.IS_PENDING, 1);
            }
            Uri uri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
            if (uri == null) {
                toast("保存失败：无法创建相册条目");
                return;
            }
            out = getContentResolver().openOutputStream(uri);
            if (out == null || !bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)) {
                toast("保存失败：写入图片出错");
                return;
            }
            out.flush();
            out.close();
            out = null;
            if (scoped) {
                ContentValues done = new ContentValues();
                done.put(MediaStore.Images.Media.IS_PENDING, 0);
                getContentResolver().update(uri, done, null, null);
            }
            toast("已保存到相册（Pictures/FakeKeep）");
        } catch (Throwable t) {
            Log.e(TAG, "保存图片失败", t);
            toast("保存失败：" + t.getMessage());
        } finally {
            if (out != null) {
                try {
                    out.close();
                } catch (Exception ignored) {
                }
            }
        }
    }

    /* ----------------------------- 杂项 ----------------------------- */

    private void requestLegacyStoragePermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            if (checkSelfPermission(android.Manifest.permission.WRITE_EXTERNAL_STORAGE)
                    != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{ android.Manifest.permission.WRITE_EXTERNAL_STORAGE },
                        REQ_STORAGE_PERM);
            }
        }
    }

    private void toast(String text) {
        Toast.makeText(this, text, Toast.LENGTH_SHORT).show();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) {
            webView.onPause();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
