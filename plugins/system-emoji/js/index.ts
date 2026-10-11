import { callNativeMethodSync } from '@revenge-mod/modules/native'
import { before } from '@revenge-mod/patcher'
import { ReactNative, ReactJSXRuntime } from '@revenge-mod/react'
import type { PluginApi } from '@revenge-mod/plugins/types'
import type { ImageStyle, StyleProp } from 'react-native'

declare module '@revenge-mod/modules/native' {
    interface NativeMethods {
        'contrabag.systememoji.artwork': [[emoji: string, pixels: number], string | null]
    }
}

function decodeAssetEmoji(uri: unknown): string | null {
    if (typeof uri !== 'string') return null
    const match = /^asset:\/emoji-([0-9a-f-]+)\.png$/i.exec(uri)
    if (!match) return null
    try {
        return String.fromCodePoint(...match[1].split('-').map(part => Number.parseInt(part, 16)))
    } catch {
        return null
    }
}

function imageSize(style: StyleProp<ImageStyle>): number | null {
    const flat = ReactNative.StyleSheet.flatten(style)
    const size = flat?.width
    return typeof size === 'number' && Number.isFinite(size) && size > 0 && flat?.height === size ? size : null
}

export default plugin({
    start({ cleanup, plugin: owner }: PluginApi) {
        const artwork = new Map<string, string>()
        let retryAt = 0
        let reportedFailure = false
        const report = (error: unknown) => {
            if (!reportedFailure) {
                reportedFailure = true
                owner.reportError(error)
            }
        }
        cleanup(() => artwork.clear())

        const render = (emoji: string, size: number): string | null => {
            const pixels = Math.max(16, Math.min(256, Math.ceil(size * ReactNative.PixelRatio.get())))
            const key = `${emoji}:${pixels}`
            const cached = artwork.get(key)
            if (cached) return cached
            if (Date.now() < retryAt) return null
            try {
                const uri = callNativeMethodSync('contrabag.systememoji.artwork', [emoji, pixels])
                if (typeof uri === 'string' && uri.startsWith('data:image/png;base64,')) {
                    if (artwork.size >= 256) artwork.delete(artwork.keys().next().value!)
                    artwork.set(key, uri)
                    return uri
                }
                report(new Error('System Emoji native artwork is unavailable'))
            } catch (error) {
                report(error)
            }
            retryAt = Date.now() + 1000
            return null
        }

        const replaceMenuImage = (args: Parameters<typeof ReactJSXRuntime.jsx>) => {
            try {
                const props = args[1] as any
                const srcEmoji = decodeAssetEmoji(props?.src)
                const sourceEmoji = decodeAssetEmoji(props?.source?.uri)
                const emoji = srcEmoji ?? sourceEmoji
                if (!emoji) return args
                const size = imageSize(props.fastImageStyle) ?? imageSize(props.style)
                if (!size) return args
                const uri = render(emoji, size)
                if (uri) args[1] = {
                    ...props,
                    ...(srcEmoji ? { src: uri } : {}),
                    ...(sourceEmoji ? { source: { ...props.source, uri } } : {}),
                }
            } catch (error) {
                report(error)
            }
            return args
        }
        cleanup(before(ReactJSXRuntime, 'jsx', replaceMenuImage))
        cleanup(before(ReactJSXRuntime, 'jsxs', replaceMenuImage))

    },
})
