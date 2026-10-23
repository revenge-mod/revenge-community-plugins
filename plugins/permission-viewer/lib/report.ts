/** Facade so components outside the `start` scope can reach the plugin reporter. */

interface Reporter {
	reportError(error: unknown): void
}

let reporter: Reporter | undefined

export function setReporter(plugin: Reporter | undefined) {
	reporter = plugin
}

export function reportError(error: unknown) {
	reporter?.reportError(error)
}
