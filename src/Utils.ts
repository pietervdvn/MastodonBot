import https from "https";
import * as fs from "fs";
import {DOMParser} from '@xmldom/xmldom'

export default class Utils {
    public static async DownloadJson(url, headers?: any): Promise<any> {
        const data = await Utils.Download(url, headers)
        return JSON.parse(data.content)
    }

    public static Sum(t: (number | undefined)[]) {
        let sum = 0;
        for (const n of t) {
            if (n === undefined || n === null || Number.isNaN(n)) {
                continue
            }
            sum += n
        }
        return sum
    }

    public static TwoDigits(i: number) {
        if (i < 10) {
            return "0" + i
        }
        return "" + i
    }

    public static async DownloadXml(url, headers?: any): Promise<Document> {
        const content = await Utils.Download(url, {...headers, accept: "application/xml"})
        const parser = new DOMParser();
        return parser.parseFromString(content.content, "text/xml");
    }

    public static Download(url, headers?: any): Promise<{ content: string }> {
        return new Promise((resolve, reject) => {
            try {
                headers = headers ?? {}
                headers.accept ??= "application/json"
                const urlObj = new URL(url)
                https.get(
                    {
                        host: urlObj.host,
                        path: urlObj.pathname + urlObj.search,

                        port: urlObj.port,
                        headers: headers,
                    },
                    (res) => {
                        const parts: string[] = []
                        res.setEncoding("utf8")
                        res.on("data", function (chunk) {
                            // @ts-ignore
                            parts.push(chunk)
                        })

                        res.addListener("end", function () {
                            resolve({content: parts.join("")})
                        })
                    }
                )
            } catch (e) {
                reject(e)
            }
        })
    }

    /**
     * Adds commas and a single 'and' between the given items
     *
     * Utils.commasAnd(["A","B","C"]) // => "A, B and C"
     * Utils.commasAnd(["A"]) // => "A"
     * Utils.commasAnd([]) // => ""
     */
    public static commasAnd(items: string[]) {
        if (items.length === 1) {
            return items[0]
        }
        if (items.length === 0) {
            return ""
        }
        const last = items[items.length - 1]
        return items.slice(0, items.length - 1).join(", ") + " and " + last
    }

    public static DownloadBlob(url: string, filepath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            https.get(url, (res) => {
                if (res.statusCode === 200) {
                    res.pipe(fs.createWriteStream(filepath))
                        .on('error', reject)
                        .once('close', () => resolve(filepath));
                } else {
                    // Consume response data to free up memory
                    res.resume();
                    reject(new Error(`Request Failed With a Status Code: ${res.statusCode}`));

                }
            });
        });
    }
}