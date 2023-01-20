import * as fakedom from "fake-dom"
import * as fs from "fs"
import MastodonPoster from "./Mastodon";
import OsmCha, {ChangeSetData} from "./OsmCha";
import Config, {MapCompleteUsageOverview} from "./Config";
import {Postbuilder} from "./Postbuilder";
import Utils from "./Utils";

export class Main {

    private readonly _config: Config;

    constructor(config: string | Config) {
        if(config === undefined){
            console.log("Needs an argument: path of config file")
            throw "No path given"
        }
        if (typeof config === "string") {
            this._config = JSON.parse(fs.readFileSync(config, {encoding: "utf-8"}))
        } else {
            this._config = config;
        }
        this._config.osmBackend ??= "https://www.openstreetmap.org"
    }

    async main() {
        const poster = await MastodonPoster.construct(this._config.mastodonAuth)

        if (fakedom === undefined || window === undefined) {
            throw "FakeDom not initialized"
        }
        console.log("Starting...")
        if (this._config.cacheDir !== undefined && !fs.existsSync(this._config.cacheDir)) {
            fs.mkdirSync(this._config.cacheDir)
            console.log("Created the caching directory at", this._config.cacheDir)
        }


        const start = Date.now()
        try {

            for (const action of this._config.actions) {
                console.log("Running action", action)
                await this.runMapCompleteOverviewAction(poster, action)
            }

            const end = Date.now()
            const timeNeeded = Math.floor((end - start) / 1000)
        } catch (e) {
            console.error(e)
            const end = Date.now()
            const timeNeeded = Math.floor((end - start) / 1000)
            await poster.writeMessage("@pietervdvn@en.osm.town Running MapComplete bot failed in " + timeNeeded + "seconds, the error is " + e, {
                visibility: "direct"
            })
        }

    }

    private async runMapCompleteOverviewAction(poster: MastodonPoster, action: MapCompleteUsageOverview) {
        console.log("Fetching recent changesets...")
        const osmcha = new OsmCha(this._config)
        const today = new Date()

        let changesets: ChangeSetData[] = []
        const days = action.numberOfDays ?? 1
        if (days < 1) {
            throw new Error("Invalid config: numberOfDays should be >= 1")
        }
        for (let i = 0; i < days; i++) {
            const targetDay = new Date(today.getTime() - 24 * 60 * 60 * 1000 * (i + 1))
            let changesetsDay: ChangeSetData[] = await osmcha.DownloadStatsForDay(targetDay.getUTCFullYear(), targetDay.getUTCMonth() + 1, targetDay.getUTCDate())
            for (const changeSetDatum of changesetsDay) {
                if (changeSetDatum.properties.theme === undefined) {
                    console.warn("Changeset", changeSetDatum.id, " does not have theme given")
                } else {
                    changesets.push(changeSetDatum)
                }
            }

        }

        if (action.themeWhitelist?.length > 0) {
            const allowedThemes = new Set(action.themeWhitelist)
            const beforeCount = changesets.length
            changesets = changesets.filter(cs => allowedThemes.has(cs.properties.theme))
            if (changesets.length == 0) {
                console.log("No changesets found for themes", action.themeWhitelist.join(", "))
                return console.log("No changesets found for themes", action.themeWhitelist.join(", "))
            }
            console.log("Filtering for ", action.themeWhitelist, "yielded", changesets.length, "changesets (" + beforeCount + " before)")
        }

        console.log("Building post...")
        await new Postbuilder(action, this._config, poster, changesets).buildMessage(today.getUTCFullYear() + "-" + Utils.TwoDigits(today.getUTCMonth() + 1) + "-" + Utils.TwoDigits(today.getUTCDate() - 1))

    }


}


new Main(process.argv[2]).main().then(_ => console.log("All done"))
