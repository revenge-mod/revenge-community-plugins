@file:JvmName("GifCollections")

package com.benjii.gifcollections

import android.content.ContentValues
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import io.github.revenge.bridge.asDelegate
import io.github.revenge.plugins.plugin
import io.github.revenge.xposed.api.registerNativeAsyncMethod
import java.io.File
import java.io.ByteArrayOutputStream
import java.util.UUID
import org.json.JSONObject

@Suppress("UNUSED")
val gifCollections = plugin {
    start {
        withAppContext { context ->
            registerNativeAsyncMethod("revenge-next.gif-collections.readBackup") { args ->
                check(enabled) { "GIF Collections is disabled." }
                val value by args.asDelegate().string()
                val uri = Uri.parse(value)
                require(uri.scheme == "content") { "Choose a backup using the file picker." }
                checkNotNull(context.contentResolver.openInputStream(uri)).use { input ->
                    val output = ByteArrayOutputStream()
                    val buffer = ByteArray(8192)
                    var count = input.read(buffer)
                    while (count != -1) {
                        require(output.size() + count <= 16 * 1024 * 1024) { "Backup is too large." }
                        output.write(buffer, 0, count)
                        count = input.read(buffer)
                    }
                    output.toString("UTF-8")
                }
            }
            registerNativeAsyncMethod("revenge-next.gif-collections.export") { args ->
                check(enabled) { "GIF Collections is disabled." }
                val json by args.asDelegate().string()
                require(json.toByteArray(Charsets.UTF_8).size <= 16 * 1024 * 1024) { "Backup is too large." }
                JSONObject(json)
                val filename = "gif-collections-${UUID.randomUUID()}.json"
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val resolver = context.contentResolver
                    val values = ContentValues().apply {
                        put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
                        put(MediaStore.MediaColumns.MIME_TYPE, "application/json")
                        put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                        put(MediaStore.MediaColumns.IS_PENDING, 1)
                    }
                    val uri = checkNotNull(resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)) {
                        "Could not create the backup in Downloads."
                    }
                    try {
                        checkNotNull(resolver.openOutputStream(uri)).bufferedWriter(Charsets.UTF_8).use { it.write(json) }
                        values.clear()
                        values.put(MediaStore.MediaColumns.IS_PENDING, 0)
                        check(resolver.update(uri, values, null, null) == 1) { "Could not finish saving the backup." }
                    } catch (error: Throwable) {
                        resolver.delete(uri, null, null)
                        throw error
                    }
                } else {
                    @Suppress("DEPRECATION")
                    val directory = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                    check(directory.isDirectory || directory.mkdirs()) { "Could not open Downloads." }
                    val file = File(directory, filename)
                    try {
                        file.writeText(json, Charsets.UTF_8)
                    } catch (error: Throwable) {
                        file.delete()
                        throw error
                    }
                }
                filename
            }
        }
    }
}
