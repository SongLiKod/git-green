package com.gitgreen.app

import android.app.Activity
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import org.json.JSONObject

/**
 * GitGreen Android 客户端（WebView 套静态资源）
 * - 全部远程运维能力：加载打包进 APK 的 Vue3 静态资源
 * - 原生下载管理器：Release 包后台断点续传下载
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    /** 文件选择回调（供 <input type="file"> 导入配置 / 还原备份使用） */
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private val fileChooserRequestCode = 1001

    /** 注入给前端的原生桥接对象（window.AndroidBridge） */
    inner class NativeBridge {
        @JavascriptInterface
        fun download(taskJson: String) {
            val task = JSONObject(taskJson)
            val url = Uri.parse(task.getString("url"))
            val filename = task.getString("filename")
            val request = DownloadManager.Request(url).apply {
                val headers = task.optJSONObject("headers")
                if (headers != null) {
                    val keys = headers.keys()
                    while (keys.hasNext()) {
                        val key = keys.next()
                        addRequestHeader(key, headers.getString(key))
                    }
                }
                setTitle("GitGreen 下载 - $filename")
                setDescription(filename)
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                setDestinationInExternalFilesDir(
                    this@MainActivity,
                    android.os.Environment.DIRECTORY_DOWNLOADS,
                    "GitGreen/$filename"
                )
                setAllowedOverRoaming(true)
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
                    setMimeType("application/octet-stream")
                }
            }
            // 系统 DownloadManager 原生支持后台下载与断点续传
            val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            dm.enqueue(request)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        webView = findViewById(R.id.web_view)

        // 通过 https 伪域名映射本地 assets，保证 ES Module 与 WebCrypto 安全上下文可用
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: android.webkit.WebResourceRequest
            ): android.webkit.WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }
        }

        // 处理网页中的 <input type="file">，调起系统文件选择器
        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView?,
                callback: ValueCallback<Array<Uri>>?,
                params: FileChooserParams?
            ): Boolean {
                filePathCallback?.onReceiveValue(null)
                filePathCallback = callback
                return try {
                    val intent = params?.createIntent()
                    if (intent == null) {
                        filePathCallback = null
                        false
                    } else {
                        this@MainActivity.startActivityForResult(intent, fileChooserRequestCode)
                        true
                    }
                } catch (e: Exception) {
                    filePathCallback = null
                    false
                }
            }
        }

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
            allowFileAccess = false
            mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        webView.addJavascriptInterface(NativeBridge(), "AndroidBridge")
        webView.loadUrl("https://appassets.androidplatform.net/assets/dist/index.html")
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else @Suppress("DEPRECATION") super.onBackPressed()
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == fileChooserRequestCode) {
            val result =
                if (resultCode == Activity.RESULT_OK && data != null)
                    WebChromeClient.FileChooserParams.parseResult(resultCode, data)
                else null
            filePathCallback?.onReceiveValue(result)
            filePathCallback = null
            return
        }
        @Suppress("DEPRECATION")
        super.onActivityResult(requestCode, resultCode, data)
    }
}
