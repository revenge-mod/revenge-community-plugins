package dev.kmmiio99o.multiscrobbler.mediasession

import android.app.Application
import android.content.Context
import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedBridge
import de.robv.android.xposed.XposedHelpers

internal object MediaSessionHooks {
    private var installed = false

    fun install(classLoader: ClassLoader) {
        if (installed) return

        // Try to grab the application context directly first
        try {
            val activityThreadClass = XposedHelpers.findClass("android.app.ActivityThread", classLoader)
            val currentActivityThread = activityThreadClass.getDeclaredMethod("currentActivityThread")
            val at = currentActivityThread.invoke(null)
            if (at != null) {
                val getApplication = activityThreadClass.getDeclaredMethod("getApplication")
                val app = getApplication.invoke(at) as? Application
                if (app != null) {
                    MediaSessionAccessor.setContext(app.applicationContext)
                    installed = true
                    return
                }
            }
        } catch (_: Throwable) {}

        // Fallback: hook Application.onCreate
        try {
            val appClass = XposedHelpers.findClass("android.app.Application", classLoader)
            val onCreateMethod = appClass.getDeclaredMethod("onCreate")
            XposedBridge.hookMethod(onCreateMethod, object : XC_MethodHook() {
                override fun afterHookedMethod(param: MethodHookParam) {
                    try {
                        val app = param.thisObject as? Application ?: return
                        MediaSessionAccessor.setContext(app.applicationContext)
                        installed = true
                    } catch (_: Throwable) {}
                }
            })
        } catch (_: Throwable) {}
    }
}
