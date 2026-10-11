import { FileModule } from "@revenge-mod/discord/native"

export async function readFileSize(uri: string): Promise<number> {
    const value: unknown = await FileModule.getSize(uri)
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
        throw new Error("File size is unavailable")
    }
    return value
}
