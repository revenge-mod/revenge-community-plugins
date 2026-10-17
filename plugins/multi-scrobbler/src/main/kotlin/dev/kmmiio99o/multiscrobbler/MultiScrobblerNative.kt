@file:JvmName("MultiScrobblerNative")

package dev.kmmiio99o.multiscrobbler

import io.github.revenge.plugins.plugin

val multiScrobblerNative = plugin {
	start {
		dev.kmmiio99o.multiscrobbler.mediasession.MediaSessionHooks.install(classLoader)
		dev.kmmiio99o.multiscrobbler.mediasession.MediaSessionBridge.register(this)
	}
}
