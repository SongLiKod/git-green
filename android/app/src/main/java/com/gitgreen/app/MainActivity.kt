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
    /** 正在写入的分片文件键（防止同一资源被并发写坏） */
    private val activePartKeys = ConcurrentHashMap.newKeySet<String>()

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

    /** 服务端判定 Range 起点越界（本地分片与远端已不一致），需丢弃分片从头下载 */
    private class RangeNotSatisfiableException : RuntimeException("HTTP 416")

    /**
     * 建立连接并跟随重定向，返回已就绪（2xx）的连接。
     * @param rangeStart >0 时带 `Range: bytes=n-` 断点续传；Range 必须每一跳都带，
     * 因为真正返回数据的是重定向后的签名地址，只在首跳带会退化成整包下载。
     */
    private fun openStream(id: String, urlStr: String, headers: JSONObject?, rangeStart: Long = 0L): HttpURLConnection {
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
            if (rangeStart > 0) conn.setRequestProperty("Range", "bytes=$rangeStart-")
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
            if (code == 416) throw RangeNotSatisfiableException()
            if (code !in 200..299) throw RuntimeException("HTTP $code")
            return conn
        }
    }

    /**
     * App 内流式下载（支持断点续传）：边下边回传进度，同时更新系统通知，完成后落盘到系统下载目录。
     *
     * 续传要点：
     * 1. 分片按「下载地址 + 文件名」落 cacheDir，同资源再次发起时能找到上次的半成品；
     * 2. 请求带 Range，服务端回 206 → 追加写；回 200 → 说明不接受续传，丢弃分片覆盖重下；
     * 3. 只有「成功」或「用户主动取消」才清理分片，其它失败保留，供下次继续下载。
     */
    private fun streamDownload(id: String, urlStr: String, filename: String, headers: JSONObject?) {
        val safeName = sanitize(filename)
        val partKey = stablePartKey(urlStr, filename)
        val tmp = File(cacheDir, "dl_$partKey.tmp")
        // 同一资源只允许一个下载线程持有分片文件，避免两个线程同时 append 写坏半成品
        if (!activePartKeys.add(partKey)) {
            activeConnections.remove(id)
            cancelledIds.remove(id)
            postError(id, "该文件正在下载中，请勿重复发起")
            return
        }
        var finished = false
        var cancelled = false
        try {
            try {
                runStreamDownload(id, urlStr, headers, safeName, tmp, allowResume = true)
            } catch (e: RangeNotSatisfiableException) {
                // 本地分片已超过远端总长（资源被替换或分片损坏），丢弃后从头下载
                tmp.delete()
                runStreamDownload(id, urlStr, headers, safeName, tmp, allowResume = false)
            }
            finished = true
        } catch (e: Exception) {
            cancelled = cancelledIds.contains(id)
            if (cancelled) {
                postError(id, "已取消")
                NotificationManagerCompat.from(this).cancel(id.hashCode())
            } else {
                postError(id, e.message ?: "下载失败")
                notifyError(id, safeName, e.message ?: "下载失败")
            }
        } finally {
            activeConnections.remove(id)
            cancelledIds.remove(id)
            activePartKeys.remove(partKey)
            // 成功或用户取消 → 清理分片；其余失败保留分片，供下次断点续传
            if (finished || cancelled) tmp.delete()
        }
    }

    /**
     * 同一「下载地址 + 文件名」始终映射到同一个分片文件。
     * String.hashCode 的取值由语言规范固定，跨进程/跨版本稳定，可安全用作缓存键。
     */
    private fun stablePartKey(url: String, filename: String): String =
        Integer.toHexString(url.hashCode() * 31 + filename.hashCode())

    /** 单次连接的完整下载流程：定位分片 → Range 续传 → 流式写入 → 完整性校验 → 落盘 */
    private fun runStreamDownload(
        id: String,
        urlStr: String,
        headers: JSONObject?,
        safeName: String,
        tmp: File,
        allowResume: Boolean
    ) {
        val existing = if (allowResume && tmp.exists()) tmp.length() else 0L
        val conn = openStream(id, urlStr, headers, existing)
        try {
            // 只有 206 说明服务端接受了续传；200 表示整包重来，必须丢掉旧分片
            val resumed = existing > 0 && conn.responseCode == 206
            if (existing > 0 && !resumed) tmp.delete()
            val total = resolveTotal(conn, resumed, existing)
            var loaded = if (resumed) existing else 0L
            var lastPost = 0L
            val buffer = ByteArray(64 * 1024)
            // 续传时先回传一次，让前端进度条直接跳到已下载的位置
            if (resumed) {
                postProgress(id, loaded, total)
                notifyProgress(id, safeName, loaded, total)
            }
            conn.inputStream.use { input ->
                FileOutputStream(tmp, resumed).use { out ->
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
            // 连接被静默截断时 read 直接返回 -1 而不抛异常，必须校验字节数，
            // 否则会把半成品当完整文件发布到下载目录
            if (total > 0 && loaded < total) throw RuntimeException("下载中断（$loaded/$total），可继续下载")
            postProgress(id, loaded, if (total > 0) total else loaded)
            val saved = publishToDownloads(safeName, tmp)
            postDone(id, saved)
            notifyDone(id, safeName, saved)
        } finally {
            conn.disconnect()
        }
    }

    /**
     * 清理超过 7 天的下载分片：分片会在下载失败时保留供续传，
     * 若用户再也没回来，这些半成品会一直占着 cacheDir。
     */
    private fun purgeStaleParts() {
        val deadline = System.currentTimeMillis() - 7L * 24 * 60 * 60 * 1000
        cacheDir.listFiles()?.forEach { f ->
            if (f.isFile && f.name.startsWith("dl_") && f.name.endsWith(".tmp") && f.lastModified() < deadline) {
                f.delete()
            }
        }
    }

    /** 解析本次下载的总字节数：续传（206）读 Content-Range，整包（200）读 Content-Length */
    private fun resolveTotal(conn: HttpURLConnection, resumed: Boolean, existing: Long): Long {
        if (resumed) {
            val total = conn.getHeaderField("Content-Range")
                ?.substringAfter("/", "")
                ?.trim()
                ?.takeIf { it != "*" }
                ?.toLongOrNull()
            if (total != null && total > 0) return total
            val remaining = conn.contentLengthLong
            return if (remaining > 0) existing + remaining else -1L
        }
        return conn.contentLengthLong.takeIf { it > 0 } ?: -1L
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
        purgeStaleParts()

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
