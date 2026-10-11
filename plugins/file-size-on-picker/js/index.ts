import {
    React,
    ReactNative,
} from "@revenge-mod/react"

import { beforeJSX } from "@revenge-mod/react/jsx-runtime"
import { readFileSize } from "./file-size"

const { View, Text, Pressable } = ReactNative

const sizeCache = new Map<string, number>()

function formatBytes(bytes: number, decimals = 2): string {
    if (!+bytes) return "0 Bytes"

    const k = 1024
    const dm = decimals < 0 ? 0 : decimals

    const sizes = [
        "Bytes",
        "KB",
        "MB",
        "GB",
        "TB",
        "PB",
        "EB",
        "ZB",
        "YB",
    ]

    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return `${parseFloat(
        (bytes / Math.pow(k, i)).toFixed(dm),
    )} ${sizes[i]}`
}

function SizeTag({ url }: { url: string }) {
    const cached = sizeCache.get(url)

    const [size, setSize] = React.useState<number | null>(
        cached ?? null,
    )

    const [loading, setLoading] = React.useState(
        cached === undefined,
    )

    React.useEffect(() => {
        if (cached !== undefined) {
            setSize(cached)
            setLoading(false)
            return
        }

        let cancelled = false
        setSize(null)
        setLoading(true)

        readFileSize(url)
            .then(value => {
                if (cancelled) return

                sizeCache.set(url, value)
                setSize(value)
                setLoading(false)
            })
            .catch(() => {
                if (cancelled) return

                setLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [url])

    return React.createElement(
        Text,
        {
            style: styles.sizeText,
        },
        loading ? "..." : size === null ? "Unavailable" : formatBytes(size),
    )
}

const styles = {
    sizeTagWrapper: {
        position: "relative" as const,
    },

    sizeTag: {
        backgroundColor: "#1e1f2280",
        borderRadius: 4,
        paddingHorizontal: 4,
        paddingVertical: 2,
        position: "absolute" as const,
        top: 3,
        left: 3,
    },

    sizeText: {
        includeFontPadding: false,
        fontSize: 10,
        color: "white",
        fontWeight: "700" as const,
    },
}

let unpatch: (() => any) | undefined

export default plugin({
    start() {
        unpatch = beforeJSX(
            Pressable,
            (args) => {
                const props = args[1] as any

                if (!props || props.modifiedByFileSizeOnPicker) {
                    return args
                }

                const children = props.children

                if (
                    !Array.isArray(children) ||
                    !children[0]
                ) {
                    return args
                }

                const localImageSource =
                    children[0]?.props?.localImageSource

                if (!localImageSource?.uri) {
                    return args
                }

                props.modifiedByFileSizeOnPicker = true

                props.children = React.createElement(
                    View,
                    {
                        style: styles.sizeTagWrapper,
                    },
                    children,
                    React.createElement(
                        View,
                        {
                            style: styles.sizeTag,
                        },
                        React.createElement(SizeTag, {
                            url: localImageSource.uri,
                        }),
                    ),
                )

                return args
            },
        )
    },

    stop() {
        unpatch?.()
        unpatch = undefined
    },
})
