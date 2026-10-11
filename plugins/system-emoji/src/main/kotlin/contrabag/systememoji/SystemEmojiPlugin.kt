@file:JvmName("SystemEmojiPlugin")

package contrabag.systememoji

import android.graphics.Bitmap
import android.util.Base64
import java.io.ByteArrayOutputStream
import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.text.SpannableString
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ReplacementSpan
import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedBridge
import io.github.revenge.plugins.plugin
import io.github.revenge.xposed.api.registerNativeMethod
import java.util.concurrent.atomic.AtomicInteger
import java.util.ArrayDeque
import java.util.WeakHashMap
import android.widget.ImageView

private const val ARTWORK = "contrabag.systememoji.artwork"
private const val STATUS = "contrabag.systememoji.reactions.status"
private var session: EmojiSession? = null

@Suppress("UNUSED")
val systemEmojiPlugin = plugin {
    start {
        session?.close()
        val next = EmojiSession()
        session = next
        registerNativeMethod(STATUS) { next.status() }
        registerNativeMethod(ARTWORK) { args -> next.artwork(args) }
        try {
            next.install(classLoader)
            try {
                next.installMessages(classLoader)
            } catch (error: Throwable) {
                next.recordError(error)
                log.i("System Emoji: message hooks unavailable; Discord rendering retained: $error")
            }
            try {
                next.installPicker(classLoader)
            } catch (error: Throwable) {
                next.recordError(error)
                log.i("System Emoji: native picker unavailable; Discord picker retained: $error")
            }
            if (startedLate) requireReload()
            log.i("System Emoji: native hooks installed; refresh the channel")
        } catch (error: Throwable) {
            next.recordError(error)
            next.close()
            log.i("System Emoji: hooks unavailable: $error")
        }
    }
    stop {
        session?.close()
        session = null
        registerNativeMethod(STATUS) { mapOf("active" to false) }
        registerNativeMethod(ARTWORK) { null }
        requireReload()
        log.i("System Emoji: hooks removed; reload to refresh existing pills")
    }
}

private class EmojiSession {
    @Volatile private var active = false
    @Volatile private var messagesActive = false
    @Volatile private var pickerActive = false
    private val pickerCells = WeakHashMap<Any, PickerCell>()
    private val pickerReplacements = AtomicInteger()
    private val pickerErrors = AtomicInteger()
    private val artworkRenders = AtomicInteger()
    @Volatile private var lastError = ""
    private val depth = ThreadLocal<Int>()
    private val messageScopes = ThreadLocal<ArrayDeque<MessageScope>>()
    private val hooks = mutableListOf<XC_MethodHook.Unhook>()
    private val reactionCalls = AtomicInteger()
    private val replacements = AtomicInteger()
    private val errors = AtomicInteger()
    private val messageCalls = AtomicInteger()
    private val messageReplacements = AtomicInteger()
    private val spoilerBypasses = AtomicInteger()
    private val revealedSpoilerReplacements = AtomicInteger()

    fun status(): Map<String, Any> = mapOf(
        "active" to active,
        "messagesActive" to messagesActive,
        "pickerActive" to pickerActive,
        "pickerReplacements" to pickerReplacements.get(),
        "pickerErrors" to pickerErrors.get(),
        "artworkRenders" to artworkRenders.get(),
        "messageCalls" to messageCalls.get(),
        "messageReplacements" to messageReplacements.get(),
        "spoilerBypasses" to spoilerBypasses.get(),
        "revealedSpoilerReplacements" to revealedSpoilerReplacements.get(),
        "renderer" to "fixed-slot-v4",
        "reactionCalls" to reactionCalls.get(),
        "unicodeReplacements" to replacements.get(),
        "errors" to errors.get(),
        "lastError" to lastError,
    )

    fun artwork(args: List<Any?>): String? {
        if (!active) return null
        val text = args.getOrNull(0) as? String ?: return null
        val size = (args.getOrNull(1) as? Number)?.toInt() ?: return null
        if (text.isEmpty() || text.length > 64 || size !in 16..256) return null
        return try {
            val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
            try {
                val drawable = SystemEmojiDrawable(text, size)
                drawable.setBounds(0, 0, size, size)
                drawable.draw(Canvas(bitmap))
                val output = ByteArrayOutputStream()
                check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, output))
                val uri = "data:image/png;base64," + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP)
                artworkRenders.incrementAndGet()
                uri
            } finally {
                bitmap.recycle()
            }
        } catch (error: Throwable) {
            recordError(error)
            null
        }
    }

    fun recordError(error: Throwable) {
        errors.incrementAndGet()
        lastError = "${error.javaClass.simpleName}: ${error.message ?: "unknown error"}"
    }

    fun install(loader: ClassLoader) {
        fun cls(name: String) = Class.forName(name, false, loader)
        val reactionView = cls("com.discord.reactions.ReactionView")
        val unicodeClass = cls("com.discord.emoji.RenderableEmoji\$Unicode")
        val surrogates = unicodeClass.getDeclaredField("surrogates").apply { isAccessible = true }
        check(surrogates.type == String::class.java) { "Unexpected Unicode.surrogates type" }
        val reactionMethod = reactionView.getDeclaredMethod(
            "setReaction",
            cls("com.discord.reactions.ReactionView\$Reaction"),
            cls("com.discord.reactions.ReactionView\$ReactionsTheme"),
        )
        val builderClass = cls("com.facebook.drawee.span.DraweeSpanStringBuilder")
        check(SpannableStringBuilder::class.java.isAssignableFrom(builderClass)) {
            "Unexpected emoji span builder"
        }
        val renderer = cls("com.discord.emoji.RenderableEmojiKt").getDeclaredMethod(
            "renderEmojiInto",
            builderClass,
            cls("com.discord.emoji.RenderableEmoji"),
            cls("android.content.Context"),
            Integer.TYPE,
            java.lang.Boolean.TYPE,
            Integer.TYPE,
            cls("kotlin.jvm.functions.Function1"),
        )
        check(renderer.returnType == Void.TYPE) { "Unexpected renderEmojiInto return type" }
        check(reactionMethod.returnType == Void.TYPE) { "Unexpected setReaction return type" }

        hooks += XposedBridge.hookMethod(reactionMethod, object : XC_MethodHook() {
            override fun beforeHookedMethod(param: MethodHookParam) {
                depth.set((depth.get() ?: 0) + 1)
                if (active) reactionCalls.incrementAndGet()
            }

            override fun afterHookedMethod(param: MethodHookParam) {
                val remaining = (depth.get() ?: 1) - 1
                if (remaining <= 0) depth.remove() else depth.set(remaining)
            }
        })
        hooks += XposedBridge.hookMethod(renderer, object : XC_MethodHook() {
            override fun beforeHookedMethod(param: MethodHookParam) {
                if (!active) return
                val messageScope = messageScopes.get()?.peek()
                if (messageScope?.allowed == false) return
                val isMessage = messagesActive && messageScope?.allowed == true
                if (!isMessage && (depth.get() ?: 0) == 0) return
                val emoji = param.args[1]
                if (!unicodeClass.isInstance(emoji)) return
                val builder = param.args[0] as? SpannableStringBuilder ?: return
                val originalLength = builder.length
                try {
                    val text = surrogates.get(emoji) as? String ?: return
                    if (text.isEmpty() || text == "©" || text == "®" || text == "™") return
                    val sizePx = param.args[3] as? Int ?: return
                    if (sizePx <= 0) return
                    val alignment = param.args[5] as? Int ?: return
                    val drawable = SystemEmojiDrawable(text, sizePx)
                    val imageSpan = SystemEmojiSpan(drawable, sizePx, alignment, messageScope?.background)
                    val span = SpannableString(text)
                    span.setSpan(imageSpan, 0, span.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                    builder.append(span)
                    param.setResult(null)
                    replacements.incrementAndGet()
                    if (isMessage) {
                        messageReplacements.incrementAndGet()
                        if (messageScope?.background != null) revealedSpoilerReplacements.incrementAndGet()
                    }
                } catch (error: Throwable) {
                    if (builder.length > originalLength) builder.delete(originalLength, builder.length)
                    recordError(error)
                }
            }
        })
        active = true
    }

    fun installMessages(loader: ClassLoader) {
        fun cls(name: String) = Class.forName(name, false, loader)
        val contextClass = cls("com.discord.chat.presentation.textutils.RenderContext")
        val spoilerExists = contextClass.getDeclaredMethod("spoilerExists")
        check(spoilerExists.returnType == java.lang.Boolean.TYPE)
        val spoilerIsRevealed = contextClass.getDeclaredMethod("spoilerIsRevealed")
        check(spoilerIsRevealed.returnType == java.lang.Boolean.TYPE)
        val getTheme = contextClass.getDeclaredMethod("getTheme")
        val getBackground = getTheme.returnType.getMethod("getSpoilerRevealedBackground")
        check(getBackground.returnType == Integer.TYPE)
        val method = cls("com.discord.chat.presentation.textutils.EmojiRendererKt").getDeclaredMethod(
            "renderEmoji",
            cls("com.facebook.drawee.span.DraweeSpanStringBuilder"),
            cls("com.discord.chat.bridge.contentnode.EmojiContentNode"),
            contextClass,
        )
        check(method.returnType == Void.TYPE)
        hooks += XposedBridge.hookMethod(method, object : XC_MethodHook() {
            override fun beforeHookedMethod(param: MethodHookParam) {
                val scopes = messageScopes.get() ?: ArrayDeque<MessageScope>().also { messageScopes.set(it) }
                var scope = MessageScope(false)
                try {
                    val context = param.args[2]
                    val hasSpoiler = spoilerExists.invoke(context) as Boolean
                    val revealed = hasSpoiler && spoilerIsRevealed.invoke(context) as Boolean
                    val allowed = messagesActive && (!hasSpoiler || revealed) && scopes.none { !it.allowed }
                    val background = if (allowed && revealed) {
                        getBackground.invoke(getTheme.invoke(context)) as Int
                    } else null
                    scope = MessageScope(allowed, background)
                    if (messagesActive) {
                        messageCalls.incrementAndGet()
                        if (hasSpoiler && !revealed) spoilerBypasses.incrementAndGet()
                    }
                } catch (error: Throwable) {
                    recordError(error)
                }
                scopes.push(scope)
            }

            override fun afterHookedMethod(param: MethodHookParam) {
                val scopes = messageScopes.get() ?: return
                if (!scopes.isEmpty()) scopes.pop()
                if (scopes.isEmpty()) messageScopes.remove()
            }
        })
        messagesActive = true
    }

    fun installPicker(loader: ClassLoader) {
        fun cls(name: String) = Class.forName(name, false, loader)
        val holderClass = cls("com.discord.emoji_picker.EmojiPickerViewHolder\$Emoji")
        val itemClass = cls("com.discord.emoji_picker.EmojiPickerItem\$Emoji")
        val unicodeClass = cls("com.discord.emoji.UnicodeEmojis\$Emoji")
        val viewClass = cls("com.facebook.drawee.view.SimpleDraweeView")
        val hierarchyClass = cls("com.facebook.drawee.generic.GenericDraweeHierarchy")
        fun field(owner: Class<*>, name: String) = owner.getDeclaredField(name).apply { isAccessible = true }
        val itemField = field(holderClass, "emojiItem")
        val viewField = field(holderClass, "emojiView")
        val sizeField = field(holderClass, "emojiSize")
        val urlField = field(holderClass, "emojiUrl")
        val unicodeField = field(itemClass, "unicode")
        check(unicodeField.type == unicodeClass && urlField.type == String::class.java)
        check(ImageView::class.java.isAssignableFrom(viewClass))
        val getSurrogates = unicodeClass.getDeclaredMethod("getSurrogates").apply { isAccessible = true }
        check(getSurrogates.returnType == String::class.java)
        val getHierarchy = viewClass.getMethod("getHierarchy")
        val setController = viewClass.getMethod("setController", cls("com.facebook.drawee.interfaces.DraweeController"))
        val setImage = hierarchyClass.declaredMethods.single {
            it.returnType == Void.TYPE && it.parameterTypes.contentEquals(
                arrayOf(Drawable::class.java, java.lang.Float.TYPE, java.lang.Boolean.TYPE),
            )
        }.apply { isAccessible = true }
        val updateImage = holderClass.getDeclaredMethod("updateImage", java.lang.Boolean.TYPE, java.lang.Boolean.TYPE)
        check(updateImage.returnType == Void.TYPE)

        hooks += XposedBridge.hookMethod(updateImage, object : XC_MethodHook() {
            override fun beforeHookedMethod(param: MethodHookParam) {
                if (!active || !pickerActive) return
                val holder = param.thisObject
                try {
                    val item = itemField.get(holder) ?: return
                    val unicode = unicodeField.get(item)
                    if (unicode == null) {
                        synchronized(pickerCells) { pickerCells.remove(holder) }
                        return
                    }
                    val text = getSurrogates.invoke(unicode) as? String ?: return
                    val size = (sizeField.get(holder) as? Number)?.toInt() ?: return
                    if (text.isEmpty() || size <= 0) return
                    val view = viewField.get(holder) as ImageView
                    val hierarchy = getHierarchy.invoke(view)
                    check(hierarchyClass.isInstance(hierarchy))
                    val cached = synchronized(pickerCells) { pickerCells[holder] }
                    val cell = if (cached != null && cached.text == text && cached.size == size) cached
                        else PickerCell(text, size, PickerEmojiDrawable(text, size))

                    setController.invoke(view, *arrayOf<Any?>(null))
                    urlField.set(holder, null)
                    view.background = null
                    setImage.invoke(hierarchy, cell.drawable, 1f, true)
                    synchronized(pickerCells) { pickerCells[holder] = cell }
                    param.setResult(null)
                    pickerReplacements.incrementAndGet()
                } catch (error: Throwable) {
                    try { urlField.set(holder, null) } catch (_: Throwable) {}
                    synchronized(pickerCells) { pickerCells.remove(holder) }
                    pickerErrors.incrementAndGet()
                    recordError(error)
                }
            }
        })
        pickerActive = true
    }

    fun close() {
        active = false
        messagesActive = false
        pickerActive = false
        hooks.asReversed().forEach { hook ->
            try { hook.unhook() } catch (error: Throwable) { recordError(error) }
        }
        hooks.clear()
        synchronized(pickerCells) { pickerCells.clear() }
    }
}

private data class MessageScope(val allowed: Boolean, val background: Int? = null)

private data class PickerCell(val text: String, val size: Int, val drawable: Drawable)

private class PickerEmojiDrawable(text: String, private val size: Int) : Drawable() {
    private val glyph = SystemEmojiDrawable(text, size)
    init { setBounds(0, 0, size, size) }
    override fun getIntrinsicWidth(): Int = size
    override fun getIntrinsicHeight(): Int = size
    override fun onBoundsChange(bounds: Rect) { glyph.bounds = bounds }
    override fun draw(canvas: Canvas) { glyph.draw(canvas) }
    override fun setAlpha(alpha: Int) { glyph.alpha = alpha; invalidateSelf() }
    override fun setColorFilter(colorFilter: ColorFilter?) { glyph.colorFilter = colorFilter; invalidateSelf() }
    @Suppress("DEPRECATION")
    override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
}

private class SystemEmojiSpan(
    private val drawable: Drawable,
    private val sizePx: Int,
    private val alignment: Int,
    background: Int? = null,
) : ReplacementSpan() {
    private val backgroundPaint = background?.let { Paint().apply { color = it } }
    private fun slotTop(metrics: Paint.FontMetricsInt): Int = when (alignment) {
        0 -> metrics.descent - sizePx
        2 -> metrics.ascent + (metrics.descent - metrics.ascent - sizePx) / 2
        else -> -sizePx
    }

    override fun getSize(
        paint: Paint, text: CharSequence, start: Int, end: Int,
        fm: Paint.FontMetricsInt?,
    ): Int {
        if (fm != null) {
            val top = slotTop(fm)
            val bottom = top + sizePx
            fm.ascent = minOf(fm.ascent, top)
            fm.top = minOf(fm.top, top)
            fm.descent = maxOf(fm.descent, bottom)
            fm.bottom = maxOf(fm.bottom, bottom)
        }
        return sizePx
    }

    override fun draw(
        canvas: Canvas, text: CharSequence, start: Int, end: Int,
        x: Float, top: Int, y: Int, bottom: Int, paint: Paint,
    ) {
        val saved = canvas.save()
        try {
            canvas.translate(x, (y + slotTop(paint.fontMetricsInt)).toFloat())
            backgroundPaint?.let { canvas.drawRect(0f, 0f, sizePx.toFloat(), sizePx.toFloat(), it) }
            drawable.draw(canvas)
        } finally {
            canvas.restoreToCount(saved)
        }
    }
}

private class SystemEmojiDrawable(private val emoji: String, sizePx: Int) : Drawable() {
    private val glyphPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.SUBPIXEL_TEXT_FLAG).apply {
        typeface = Typeface.create("sans-serif", Typeface.NORMAL)
        textSize = sizePx.toFloat()
    }
    private val ink = Rect()

    init {
        setBounds(0, 0, sizePx, sizePx)
        glyphPaint.getTextBounds(emoji, 0, emoji.length, ink)
        if (ink.isEmpty) {
            val metrics = glyphPaint.fontMetricsInt
            ink.set(0, metrics.ascent, kotlin.math.ceil(glyphPaint.measureText(emoji)).toInt(), metrics.descent)
        }
        check(!ink.isEmpty) { "System emoji has no drawable bounds" }
    }

    override fun draw(canvas: Canvas) {
        val box = bounds
        if (box.isEmpty) return
        val scale = minOf(1f, box.width().toFloat() / ink.width(), box.height().toFloat() / ink.height())
        val saved = canvas.save()
        try {
            canvas.clipRect(box)
            canvas.translate(box.exactCenterX(), box.exactCenterY())
            canvas.scale(scale, scale)
            canvas.drawText(emoji, -ink.exactCenterX(), -ink.exactCenterY(), glyphPaint)
        } finally {
            canvas.restoreToCount(saved)
        }
    }

    override fun setAlpha(alpha: Int) {
        glyphPaint.alpha = alpha
        invalidateSelf()
    }

    override fun setColorFilter(colorFilter: ColorFilter?) {
        glyphPaint.colorFilter = colorFilter
        invalidateSelf()
    }

    @Suppress("DEPRECATION")
    override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
}
