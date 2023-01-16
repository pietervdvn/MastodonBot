import Utils from "./Utils";
import * as fs from "fs";

export interface UserInfo {
    "id": number,
    "display_name": string,
    "account_created": string,
    "description": string,
    "contributor_terms": { "agreed": boolean, "pd": boolean },
    "img": { "href": string },
    "roles": [],
    "changesets": { "count": number },
    "traces": { "count": number },
    "blocks": { "received": { "count": number, "active": number } },
}

export default class OsmUserInfo {
    private static readonly max_cache_age_seconds = 7 * 24 * 60 * 60;
    private readonly _userId: number;
    private readonly _backend: string;
    private _userData: UserInfo = undefined
    private readonly _cachingPath: string | undefined;

    constructor(userId: number, options?:
        {
            osmBackend?: string,
            cacheDir?: string
        }) {
        if(userId === undefined || userId === null || Number.isNaN(userId)){
            throw new Error("Invalid userid: " + userId)
        }
        this._userId = userId;
        this._backend = options?.osmBackend ?? "https://www.openstreetmap.org/";
        if (options?.cacheDir) {
            this._cachingPath = options?.cacheDir + "/userinfo_" + userId + ".json"
        }
        if (!this._backend.endsWith("/")) {
            this._backend += "/"
        }

    }
    
    public async GetMastodonLink(): Promise<string | undefined> {
        const mastodonLinks = await this.getMeLinks()

        if (mastodonLinks.length <= 0) {
            return undefined
        }
        
        const url = new URL(mastodonLinks[0])
        return url.pathname.substring(1) + "@" + url.host
    } 

    public async getMeLinks(): Promise<string[]> {
        const userdata = await this.getUserInfo()
        const div = document.createElement("div")
        div.innerHTML = userdata.description
        const links = Array.from(div.getElementsByTagName("a"))
        const meLinks = links.filter(link => link.getAttribute("rel")?.split(" ")?.indexOf("me") >= 0)
        return meLinks.map(link => link.href.toString())
    }

    public async getUserInfo(): Promise<UserInfo> {
        if (this._userData) {
            return this._userData
        }
        if (this._cachingPath !== undefined && fs.existsSync(this._cachingPath)) {
            const cacheCreatedTime: Date = fs.statSync(this._cachingPath).birthtime
            const cacheAgeInSeconds = (Date.now() - cacheCreatedTime.getTime()) / 1000
            if (cacheAgeInSeconds > OsmUserInfo.max_cache_age_seconds) {
                console.log("Cache is old, unlinking...")
            }else{
                
                try {
                    this._userData = JSON.parse(fs.readFileSync(this._cachingPath, "utf8"))
                    return this._userData
                } catch (e) {
                    fs.unlinkSync(this._cachingPath)
                }
            }
        }
        const url = `${this._backend}api/0.6/user/${this._userId}.json`
        console.log("Looking up user info about ", this._userId)
        const res = await Utils.DownloadJson(url);
        this._userData = res.user
        if (this._cachingPath !== undefined) {
            fs.writeFileSync(this._cachingPath, JSON.stringify(this._userData), "utf8")
        }
        return this._userData
    }

}