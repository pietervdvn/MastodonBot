import * as fakedom from "fake-dom"
import * as fs from "fs"
import MastodonPoster from "./Mastodon";
import OsmCha, {ChangeSetData} from "./OsmCha";
import Config from "./Config";
import * as configF from "../config/config.json"
import {Postbuilder} from "./Postbuilder";

export class Main {
     
    private readonly _config: Config;

    constructor(config: Config) {
        this._config = config;
    }

    async main() {

        if (fakedom === undefined || window === undefined) {
            throw "FakeDom not initialized"
        }
        console.log("Starting...")
        if (this._config.cacheDir !== undefined && !fs.existsSync(this._config.cacheDir)) {
            fs.mkdirSync(this._config.cacheDir)
            console.log("Created the caching directory at", this._config.cacheDir)
        }

        const poster = await MastodonPoster.construct(this._config.mastodonAuth)

        console.log("Fetching recent changesets...")
        const osmcha = new OsmCha(this._config)
        const today = new Date()
        let changesets: ChangeSetData[] = await osmcha.DownloadStatsForDay(today.getUTCFullYear(), today.getUTCMonth() + 1,  today.getUTCDate() - 1)
      
        console.log("Building post...")
        await new Postbuilder(this._config, poster, changesets).buildMessage(today.getUTCFullYear()+"-"+ (today.getUTCMonth() + 1) +  (today.getUTCDate() - 1))

    }


}


new Main(configF).main().then(_ => console.log("All done"))
