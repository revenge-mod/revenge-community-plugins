package dev.kmmiio99o.multiscrobbler.mediasession

import android.graphics.Bitmap
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.PlaybackState
import java.io.ByteArrayOutputStream
import android.util.Base64

internal object MediaSessionExtractor {

    fun extract(session: MediaController): Map<String, Any?> {
        val metadata = session.metadata
        val playbackState = session.playbackState
        val packageName = session.packageName

        val result = mutableMapOf<String, Any?>(
            "packageName" to packageName,
            "sessionTag" to session.tag,
        )

        metadata?.let { meta ->
            result["title"] = meta.getString(MediaMetadata.METADATA_KEY_TITLE)
            result["artist"] = meta.getString(MediaMetadata.METADATA_KEY_ARTIST)
            result["album"] = meta.getString(MediaMetadata.METADATA_KEY_ALBUM)
            result["duration"] = meta.getLong(MediaMetadata.METADATA_KEY_DURATION)
            result["trackNumber"] = meta.getLong(MediaMetadata.METADATA_KEY_TRACK_NUMBER)
            result["discNumber"] = meta.getLong(MediaMetadata.METADATA_KEY_DISC_NUMBER)
            result["genre"] = meta.getString(MediaMetadata.METADATA_KEY_GENRE)
            result["date"] = meta.getString(MediaMetadata.METADATA_KEY_DATE)

            try {
                val art = meta.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART)
                    ?: meta.getBitmap(MediaMetadata.METADATA_KEY_ART)
                if (art != null) {
                    result["albumArtBase64"] = bitmapToBase64(art)
                }
            } catch (_: Throwable) {}
        }

        playbackState?.let { state ->
            result["state"] = state.state
            result["stateLabel"] = stateLabel(state.state)
            // getPosition() is already projected to "now" — no manual adjustment.
            result["position"] = state.position
            result["playbackSpeed"] = state.playbackSpeed
            result["actions"] = state.actions

            val actions = state.actions
            result["canPause"] = (actions and PlaybackState.ACTION_PAUSE) != 0L
            result["canPlay"] = (actions and PlaybackState.ACTION_PLAY) != 0L
            result["canSkipNext"] = (actions and PlaybackState.ACTION_SKIP_TO_NEXT) != 0L
            result["canSkipPrevious"] = (actions and PlaybackState.ACTION_SKIP_TO_PREVIOUS) != 0L
            result["canStop"] = (actions and PlaybackState.ACTION_STOP) != 0L
            result["canSeek"] = (actions and PlaybackState.ACTION_SEEK_TO) != 0L
        }

        try {
            val pm = MediaSessionAccessor.getContext()?.packageManager ?: return result
            val appInfo = pm.getApplicationInfo(packageName, 0)
            result["appName"] = pm.getApplicationLabel(appInfo).toString()
        } catch (_: Throwable) {
            result["appName"] = packageName
        }

        return result
    }

    private fun stateLabel(state: Int): String = when (state) {
        PlaybackState.STATE_PLAYING -> "playing"
        PlaybackState.STATE_PAUSED -> "paused"
        PlaybackState.STATE_BUFFERING -> "buffering"
        PlaybackState.STATE_STOPPED -> "stopped"
        PlaybackState.STATE_NONE -> "none"
        PlaybackState.STATE_CONNECTING -> "connecting"
        PlaybackState.STATE_ERROR -> "error"
        else -> "unknown"
    }

    private fun bitmapToBase64(bitmap: Bitmap): String {
        val stream = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, 80, stream)
        return Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
    }
}
