import Utils from "./Utils";
import * as fs from "fs";


export interface ChangeSetData {
    id: number
    type: "Feature"
    geometry: {
        type: "Polygon"
        coordinates: [number, number][][]
    }
    properties: {
        check_user: null
        reasons: []
        tags: []
        features: []
        user: string
        uid: string
        editor: string
        comment: string
        comments_count: number
        source: string
        imagery_used: string
        date: string
        reviewed_features: []
        create: number
        modify: number
        delete: number
        area: number
        is_suspect: boolean
        harmful: any
        checked: boolean
        check_date: any
        host: string
        theme: string
        imagery: string
        language: string,
        tag_changes: Record<string, string[]>
    }
}

export default class OsmCha {
    private readonly urlTemplate =
        "https://osmcha.org/api/v1/changesets/?date__gte={start_date}&date__lte={end_date}&page={page}&comment=%23mapcomplete&page_size=100"

    private readonly _cachepath: string

    constructor(options?: { cacheDir?: string }) {
        if (options?.cacheDir) {
            this._cachepath = options?.cacheDir + "/osmcha_"
        }
    }

    public async DownloadStatsForDay(
        year: number,
        month: number,
        day: number
    ): Promise<ChangeSetData[]> {
        const path = this._cachepath + "_" + year + "_" + Utils. TwoDigits(month) + "_" + Utils. TwoDigits(day) + ".json";
        if (fs.existsSync(path)) {
            try {
                return JSON.parse(fs.readFileSync(path, "utf8")).features
            } catch (e) {
                fs.unlinkSync(path)
            }
        }
        let page = 1
        let allFeatures = []
        let endDay = new Date(year, month - 1 /* Zero-indexed: 0 = january*/, day + 1)
        let endDate = `${endDay.getFullYear()}-${Utils.TwoDigits(
            endDay.getMonth() + 1
        )}-${Utils.TwoDigits(endDay.getDate())}`
        let url = this.urlTemplate
            .replace(
                "{start_date}",
                year + "-" + Utils.TwoDigits(month) + "-" + Utils.TwoDigits(day)
            )
            .replace("{end_date}", endDate)
            .replace("{page}", "" + page)

        let headers = {
            "User-Agent":
                "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:86.0) Gecko/20100101 Firefox/86.0",
            "Accept-Language": "en-US,en;q=0.5",
            Referer:
                "https://osmcha.org/?filters=%7B%22date__gte%22%3A%5B%7B%22label%22%3A%222020-07-05%22%2C%22value%22%3A%222020-07-05%22%7D%5D%2C%22editor%22%3A%5B%7B%22label%22%3A%22mapcomplete%22%2C%22value%22%3A%22mapcomplete%22%7D%5D%7D",
            "Content-Type": "application/json",
            Authorization: "Token 6e422e2afedb79ef66573982012000281f03dc91",
            DNT: "1",
            Connection: "keep-alive",
            TE: "Trailers",
            Pragma: "no-cache",
            "Cache-Control": "no-cache",
        }

        while (url) {
            const result = await Utils.DownloadJson(url, headers)
            page++
            allFeatures.push(...result.features)
            if (result.features === undefined) {
                console.log("ERROR", result)
                return
            }
            url = result.next
        }
        allFeatures = allFeatures.filter(f => f !== undefined && f !== null)
        allFeatures.forEach((f) => {
            f.properties = {...f.properties, ...f.properties.metadata}
            delete f.properties.metadata
            f.properties.id = f.id
        })

        if (this._cachepath) {
            fs.writeFileSync(
                path,
                JSON.stringify({features: allFeatures}),
                "utf8"
            )
        }

        return allFeatures
    }
}