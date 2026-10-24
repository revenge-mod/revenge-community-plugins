package dev.kmmiio99o.multiscrobbler.mediasession

import android.app.NotificationManager
import android.content.Context
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.os.Handler
import android.os.Looper

internal object MediaSessionAccessor {
    private var context: Context? = null
    private var mediaSessionManager: MediaSessionManager? = null
    private var activeListener: MediaSessionManager.OnActiveSessionsChangedListener? = null
    var cachedSessions: List<MediaController> = emptyList()
        private set

    fun setContext(appContext: Context) {
        context = appContext
    }

    fun getContext(): Context? = context

    fun getManager(): MediaSessionManager? {
        if (mediaSessionManager != null) return mediaSessionManager
        val ctx = context ?: return null

        // Reflection: MediaSessionManager(NotificationManager)
        try {
            val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
                ?: return null
            val msmClass = Class.forName("android.media.session.MediaSessionManager")
            val ctor = msmClass.getDeclaredConstructor(NotificationManager::class.java)
            ctor.isAccessible = true
            mediaSessionManager = ctor.newInstance(nm) as MediaSessionManager
            return mediaSessionManager
        } catch (_: Throwable) {}

        return null
    }

    fun ensureListener() {
        if (activeListener != null) return
        val msm = getManager() ?: return
        val handler = Handler(Looper.getMainLooper())

        activeListener = MediaSessionManager.OnActiveSessionsChangedListener { sessions ->
            cachedSessions = sessions ?: emptyList()
        }

        try {
            // Android 11+ rejects a fabricates listener ComponentName that is not
            // an enabled NotificationListenerService. Register with null so the
            // host can still observe the sessions it has visibility into.
            msm.addOnActiveSessionsChangedListener(activeListener!!, null, handler)
            cachedSessions = msm.getActiveSessions(null)
        } catch (_: Throwable) {}
    }

    fun getActiveSessions(): List<MediaController> {
        ensureListener()
        val msm = getManager() ?: return emptyList()
        return try {
            cachedSessions = msm.getActiveSessions(null)
            cachedSessions
        } catch (_: Throwable) {
            cachedSessions
        }
    }
}
