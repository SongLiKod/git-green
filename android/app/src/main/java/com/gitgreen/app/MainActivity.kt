package com.gitgreen.app

import android.app.Activity
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * GitGreen Android 客户端（WebView 套静态资源）
 * - 全部远程运维能力：加载打包进 APK 的 Vue3 静态资源
 * - 软件内下载：原生在 App 内流式下载并回传进度，完成后保存到系统下载目录
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    /** 原生下载线程池（与网络 IO 解耦，不阻塞 WebView） */
    private val downloadPool = Executors.newCachedThreadPool()
    private val activeConnections = ConcurrentHashMap<String, HttpURLConnection>()
    private val cancelledIds = ConcurrentHashMap.newKeySet<String>()

    /** 文件选择回调（供 <input type="file"> 导入配置 / 还原备份使用） */
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private val fileChooserRequestCode = 1001

    /** 注入给前端的原生桥接对象（window.AndroidBridge） */
    inner class NativeBridge {
        @JavascriptInterface
        fun download(taskJson: String) {
            val task = JSONObject(taskJson)
            val id = task.optString("id", System.currentTimeMillis().toString())
            val url = task.getString("url")
            val filename = task.optString("filename", "download.bin")
            val headers = task.optJSONObject("headers")
            downloadPool.execute { streamDownload(id, url, filename, headers) }
        }

        @JavascriptInterface
        fun cancel(id: String) {
            cancelledIds.add(id)
            activeConnections.remove(id)?.disconnect()
        }

        @JavascriptInterface
        fun saveBase64(taskJson: String) {
            val task = JSONObject(taskJson)
            val id = task.optString("id", System.currentTimeMillis().toString())
            val filename = sanitize(task.optString("filename", "gitgreen.bin"))
            val base64 = task.getString("base64")
            downloadPool.execute {
                var tmp: File? = null
                try {
                    tmp = File(cacheDir, "save_$id.bin")
                    FileOutputStream(tmp).use { it.write(Base64.decode(base64, Base64.DEFAULT)) }
                    val path = publishToDownloads(filename, tmp)
                    postDone(id, path)
                } catch (e: Exception) {
                    postError(id, e.message ?: "保存失败")
                } finally {
                    tmp?.delete()
                }
            }
        }
    }

    /** 建立连接并跟随重定向，返回已就绪（2xx）的连接 */
    private fun openStream(id: String, urlStr: String, headers: JSONObject?): HttpURLConnection {
        var currentUrl = urlStr
        var redirects = 0
        while (true) {
            val conn = (URL(currentUrl).openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = false
                connectTimeout = 15000
                readTimeout = 30000
                requestMethod = "GET"
            }
            // 仅在首个请求携带自定义头：重定向到签名地址后不能再带 Authorization（会与签名冲突）
            if (redirects == 0) {
                headers?.let { h ->
                    val keys = h.keys()
                    while (keys.hasNext()) {
                        val key = keys.next()
                        conn.setRequestProperty(key, h.getString(key))
                    }
                }
            }
            activeConnections[id] = conn
            val code = conn.responseCode
            if (code in 300..399) {
                val location = conn.getHeaderField("Location")
                if (!location.isNullOrEmpty() && redirects < 10) {
                    redirects++
                    currentUrl = location
                    conn.disconnect()
                    continue
                }
                throw RuntimeException("重定向异常 HTTP $code")
            }
            if (code !in 200..299) throw RuntimeException("HTTP $code")
            return conn
        }
    }

    /** App 内流式下载：边下边回传进度，完成后落盘到系统下载目录 */
    private fun streamDownload(id: String, urlStr: String, filename: String, headers: JSONObject?) {
        val safeName = sanitize(filename)
        var tmp: File? = null
        var conn: HttpURLConnection? = null
        try {
            tmp = File(cacheDir, "dl_$id.tmp")
            conn = openStream(id, urlStr, headers)
            val total = conn.contentLengthLong.takeIf { it > 0 } ?: -1L
            var loaded = 0L
            var lastPost = 0L
            val buffer = ByteArray(64 * 1024)
            conn.inputStream.use { input ->
                FileOutputStream(tmp).use { out ->
                    while (true) {
                        if (cancelledIds.contains(id)) throw RuntimeException("已取消")
                        val len = input.read(buffer)
                        if (len < 0) break
                        out.write(buffer, 0, len)
                        loaded += len
                        val now = System.currentTimeMillis()
                        if (now - lastPost >= 200) {
                            postProgress(id, loaded, total)
                            lastPost = now
                        }
                    }
                }
            }
            if (cancelledIds.contains(id)) throw RuntimeException("已取消")
            postProgress(id, loaded, if (total > 0) total else loaded)
            val path = publishToDownloads(safeName, tmp)
            postDone(id, path)
        } catch (e: Exception) {
            if (cancelledIds.contains(id)) postError(id, "已取消") else postError(id, e.message ?: "下载失败")
        } finally {
            activeConnections.remove(id)
            cancelledIds.remove(id)
            conn?.disconnect()
            tmp?.delete()
        }
    }

    /** 保存到系统下载目录：Q+ 走 MediaStore（无需权限），低版本落到应用外部下载目录 */
    private fun publishToDownloads(name: String, tmp: File): String {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, name)
                put(MediaStore.MediaColumns.MIME_TYPE, guessMime(name))
                put(MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/GitGreen")
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
            val resolver = contentResolver
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: throw RuntimeException("无法创建下载文件")
            resolver.openOutputStream(uri)?.use { out -> tmp.inputStream().use { it.copyTo(out) } }
                ?: throw RuntimeException("无法写入下载文件")
            values.clear()
            values.put(MediaStore.MediaColumns.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
            return "${Environment.DIRECTORY_DOWNLOADS}/GitGreen/$name"
        }
        val baseDir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: filesDir
        val targetDir = File(baseDir, "GitGreen").apply { mkdirs() }
        val target = File(targetDir, name)
        tmp.inputStream().use { input -> FileOutputStream(target).use { input.copyTo(it) } }
        return target.absolutePath
    }

    private fun sanitize(name: String): String {
        val cleaned = name.replace(Regex("[\\\\/:*?\"<>|]"), "_").trim()
        return if (cleaned.isEmpty()) "gitgreen.bin" else cleaned
    }

    private fun guessMime(name: String): String {
        val lower = name.lowercase()
        return when {
            lower.endsWith(".zip") -> "application/zip"
            lower.endsWith(".apk") -> "application/vnd.android.package-archive"
            lower.endsWith(".png") -> "image/png"
            lower.endsWith(".jpg") || lower.endsWith(".jpeg") -> "image/jpeg"
            lower.endsWith(".txt") || lower.endsWith(".log") -> "text/plain"
            lower.endsWith(".json") -> "application/json"
            else -> "application/octet-stream"
        }
    }

    private fun postProgress(id: String, loaded: Long, total: Long) {
        evaluateJs("window.__gitgreenDownloadProgress && window.__gitgreenDownloadProgress('$id',$loaded,$total)")
    }

    private fun postDone(id: String, path: String) {
        val safePath = path.replace("\\", "\\\\").replace("'", "\\'")
        evaluateJs("window.__gitgreenDownloadDone && window.__gitgreenDownloadDone('$id','$safePath')")
    }

    private fun postError(id: String, message: String) {
        val safeMsg = message.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ")
        evaluateJs("window.__gitgreenDownloadError && window.__gitgreenDownloadError('$id','$safeMsg')")
    }

    private fun evaluateJs(script: String) {
        runOnUiThread { webView.evaluateJavascript(script, null) }
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

    override fun onDestroy() {
        downloadPool.shutdownNow()
        super.onDestroy()
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
