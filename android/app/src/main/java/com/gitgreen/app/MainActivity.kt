package com.gitgreen.app

import android.Manifest
import android.app.Activity
import android.app.DownloadManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.provider.Settings
import android.util.Base64
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.FileProvider
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
 * - 下载闭环：完成后发系统通知，并向前端回传可打开的文件 Uri
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
    private val notificationPermissionCode = 1002

    /** 已完成后可直接打开/分享的落盘文件（展示路径 + 可授予读权限的 Uri） */
    private data class SavedFile(val uri: String, val displayPath: String)

    companion object {
        private const val CHANNEL_ID = "gitgreen_downloads"
        private const val CHANNEL_NAME = "下载通知"
    }

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
                    val saved = publishToDownloads(filename, tmp)
                    postDone(id, saved)
                    notifyDone(id, filename, saved)
                } catch (e: Exception) {
                    postError(id, e.message ?: "保存失败")
                    notifyError(id, filename, e.message ?: "保存失败")
                } finally {
                    tmp?.delete()
                }
            }
        }

        /** 打开已下载文件（优先使用系统应用查看） */
        @JavascriptInterface
        fun openFile(uri: String) = this@MainActivity.openSavedFile(uri)

        /** 调起 APK 安装（下载软件场景） */
        @JavascriptInterface
        fun installApk(uri: String) = this@MainActivity.installApk(uri)

        /** 打开系统「下载」界面 */
        @JavascriptInterface
        fun openDownloadDir() = this@MainActivity.openDownloadDir()

        /** 分享已下载文件 */
        @JavascriptInterface
        fun shareFile(uri: String, mime: String?) = this@MainActivity.shareFile(uri, mime)

        /** 申请通知权限（Android 13+ 下载前调用，用于完成后弹系统通知） */
        @JavascriptInterface
        fun requestNotificationPermission() = this@MainActivity.requestNotificationPermission()
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

    /** App 内流式下载：边下边回传进度，同时更新系统通知，完成后落盘到系统下载目录 */
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
                            notifyProgress(id, safeName, loaded, total)
                            lastPost = now
                        }
                    }
                }
            }
            if (cancelledIds.contains(id)) throw RuntimeException("已取消")
            postProgress(id, loaded, if (total > 0) total else loaded)
            val saved = publishToDownloads(safeName, tmp)
            postDone(id, saved)
            notifyDone(id, safeName, saved)
        } catch (e: Exception) {
            if (cancelledIds.contains(id)) {
                postError(id, "已取消")
                NotificationManagerCompat.from(this).cancel(id.hashCode())
            } else {
                postError(id, e.message ?: "下载失败")
                notifyError(id, safeName, e.message ?: "下载失败")
            }
        } finally {
            activeConnections.remove(id)
            cancelledIds.remove(id)
            conn?.disconnect()
            tmp?.delete()
        }
    }

    /** 保存到系统下载目录：Q+ 走 MediaStore（无需权限），低版本落到应用外部下载目录并由 FileProvider 暴露 */
    private fun publishToDownloads(name: String, tmp: File): SavedFile {
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
            return SavedFile(uri.toString(), "${Environment.DIRECTORY_DOWNLOADS}/GitGreen/$name")
        }
        val baseDir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: filesDir
        val targetDir = File(baseDir, "GitGreen").apply { mkdirs() }
        val target = File(targetDir, name)
        tmp.inputStream().use { input -> FileOutputStream(target).use { input.copyTo(it) } }
        val shareUri = FileProvider.getUriForFile(this, "$packageName.fileprovider", target)
        return SavedFile(shareUri.toString(), target.absolutePath)
    }

    /* ---------------- 打开 / 安装 / 分享 / 目录 ---------------- */

    private fun buildViewIntent(uriStr: String, mime: String): Intent =
        Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(Uri.parse(uriStr), mime)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }

    private fun openSavedFile(uriStr: String) {
        if (uriStr.isEmpty()) {
            postNativeError("文件地址无效，请到下载目录查看")
            return
        }
        try {
            startActivity(buildViewIntent(uriStr, guessMime(uriStr)))
        } catch (e: Exception) {
            postNativeError("无法打开文件：${e.message ?: "没有可用的应用"}")
        }
    }

    private fun installApk(uriStr: String) {
        if (uriStr.isEmpty()) {
            postNativeError("安装包地址无效，请到下载目录查看")
            return
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !packageManager.canRequestPackageInstalls()) {
                startActivity(
                    Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName"))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                )
                postNativeError("请允许本应用安装未知来源应用后，再次点击安装")
                return
            }
            startActivity(buildViewIntent(uriStr, "application/vnd.android.package-archive"))
        } catch (e: Exception) {
            postNativeError("无法安装：${e.message ?: "安装器不可用"}")
        }
    }

    private fun openDownloadDir() {
        try {
            startActivity(Intent(DownloadManager.ACTION_VIEW_DOWNLOADS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: Exception) {
            postNativeError("无法打开下载目录：${e.message ?: "请手动打开文件管理器"}".trim())
        }
    }

    private fun shareFile(uriStr: String, mime: String?) {
        if (uriStr.isEmpty()) return
        try {
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = mime?.takeIf { it.isNotEmpty() } ?: guessMime(uriStr)
                putExtra(Intent.EXTRA_STREAM, Uri.parse(uriStr))
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            startActivity(Intent.createChooser(intent, "分享文件").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: Exception) {
            postNativeError("分享失败：${e.message ?: "没有可用的应用"}")
        }
    }

    /* ---------------- 系统通知 ---------------- */

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply { description = "软件下载进度与完成提醒" }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                notificationPermissionCode
            )
        }
    }

    private fun canNotify(): Boolean =
        Build.VERSION.SDK_INT < 33 ||
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private fun notifyProgress(id: String, filename: String, loaded: Long, total: Long) {
        if (!canNotify()) return
        val percent = if (total > 0) ((loaded * 100) / total).toInt().coerceIn(0, 100) else 0
        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("正在下载 $filename")
            .setContentText(if (total > 0) "已完成 $percent%" else "已下载 ${loaded / 1024} KB")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setProgress(100, percent, total <= 0)
        postNotification(id, builder.build())
    }

    private fun notifyDone(id: String, filename: String, saved: SavedFile) {
        if (!canNotify()) return
        val pending = PendingIntent.getActivity(
            this,
            id.hashCode(),
            buildViewIntent(saved.uri, guessMime(filename)),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val text = "$filename 已保存到 ${saved.displayPath}"
        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle("下载完成")
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setAutoCancel(true)
            .setContentIntent(pending)
        postNotification(id, builder.build())
    }

    private fun notifyError(id: String, filename: String, message: String) {
        if (!canNotify()) return
        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_error)
            .setContentTitle("下载失败")
            .setContentText("$filename：$message")
            .setAutoCancel(true)
        postNotification(id, builder.build())
    }

    private fun postNotification(id: String, notification: Notification) {
        try {
            NotificationManagerCompat.from(this).notify(id.hashCode(), notification)
        } catch (_: SecurityException) {
            /* 未授予通知权限时忽略 */
        }
    }

    /* ---------------- 前端回调 ---------------- */

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

    private fun postDone(id: String, saved: SavedFile) {
        val safePath = saved.displayPath.replace("\\", "\\\\").replace("'", "\\'")
        val safeUri = saved.uri.replace("\\", "\\\\").replace("'", "\\'")
        evaluateJs("window.__gitgreenDownloadDone && window.__gitgreenDownloadDone('$id','$safePath','$safeUri')")
    }

    private fun postError(id: String, message: String) {
        val safeMsg = escapeJs(message)
        evaluateJs("window.__gitgreenDownloadError && window.__gitgreenDownloadError('$id','$safeMsg')")
    }

    private fun postNativeError(message: String) {
        evaluateJs("window.__gitgreenNativeError && window.__gitgreenNativeError('${escapeJs(message)}')")
    }

    private fun escapeJs(text: String): String =
        text.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ").replace("\r", " ")

    private fun evaluateJs(script: String) {
        runOnUiThread { webView.evaluateJavascript(script, null) }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        webView = findViewById(R.id.web_view)

        createNotificationChannel()

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
