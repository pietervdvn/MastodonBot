import Utils from "./Utils";

export default class ImgurAttribution {

    // MUST be private to prevent other people stealing this key! That I'll push this to github later on is not relevant
    private static ImgurApiKey = "7070e7167f0a25a"

    /**
     * Download the attribution from a given URL
     */
    public static async DownloadAttribution(url: string): Promise<{license: string, author: string}> {
        const hash = url.substr("https://i.imgur.com/".length).split(".jpg")[0]

        const apiUrl = "https://api.imgur.com/3/image/" + hash
        const response = await Utils.DownloadJson(apiUrl,  {
            Authorization: "Client-ID " + ImgurAttribution.ImgurApiKey,
        })

        const descr: string = response.data.description ?? ""
        const data: any = {}
        for (const tag of descr.split("\n")) {
            const kv = tag.split(":")
            const k = kv[0]
            data[k] = kv[1]?.replace(/\r/g, "")
        }
        return data
    }
}