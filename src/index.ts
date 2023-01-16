import * as fakedom from "fake-dom"
import * as fs from "fs"
import MastodonPoster from "./Mastodon";
import OsmCha, {ChangeSetData} from "./OsmCha";
import Config, {MapCompleteUsageOverview} from "./Config";
import * as configF from "../config/config.json"
import {Postbuilder} from "./Postbuilder";
import Utils from "./Utils";

export class Main {

    private readonly _config: Config;

    constructor(config: Config) {
        this._config = config;
        this._config.osmBackend ??= "https://www.openstreetmap.org"
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

        const notice = await poster.writeMessage("@pietervdvn@en.osm.town Starting MapComplete bot...", {
            visibility: "direct"
        })
        const start = Date.now()
        try {

            for (const action of this._config.actions) {
                console.log("Running action", action)
                await this.runMapCompleteOverviewAction(poster, action)
            }

            const end = Date.now()
            const timeNeeded = Math.floor((end - start) / 1000)
            await poster.writeMessage("Finished running MapComplete bot, this took " + timeNeeded + "seconds", {
                inReplyToId: notice.id,
                visibility: "direct"
            })
        } catch (e) {
            console.error(e)
            const end = Date.now()
            const timeNeeded = Math.floor((end - start) / 1000)
            await poster.writeMessage("Running MapComplete bot failed in " + timeNeeded + "seconds, the error is " + e, {
                inReplyToId: notice.id,
                visibility: "direct"
            })
        }

    }

    private async runMapCompleteOverviewAction(poster: MastodonPoster, action: { mapCompleteUsageOverview: MapCompleteUsageOverview }) {
        console.log("Fetching recent changesets...")
        const osmcha = new OsmCha(this._config)
        const today = new Date()

        const overviewSettings = action.mapCompleteUsageOverview
        let changesets: ChangeSetData[] = []
        const days = overviewSettings.numberOfDays ?? 1
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

        if (overviewSettings.themeWhitelist?.length > 0) {
            const allowedThemes = new Set(overviewSettings.themeWhitelist)
            const beforeCount = changesets.length
            changesets = changesets.filter(cs => allowedThemes.has(cs.properties.theme))
            if (changesets.length == 0) {
                console.log("No changesets found for themes", overviewSettings.themeWhitelist.join(", "))
                return console.log("No changesets found for themes", overviewSettings.themeWhitelist.join(", "))
            }
            console.log("Filtering for ", overviewSettings.themeWhitelist, "yielded", changesets.length, "changesets (" + beforeCount + " before)")
        }

        console.log("Building post...")
        await new Postbuilder(overviewSettings, this._config, poster, changesets).buildMessage(today.getUTCFullYear() + "-" + Utils.TwoDigits(today.getUTCMonth() + 1) + "-" + Utils.TwoDigits(today.getUTCDate() - 1))

    }


}


new Main(configF).main().then(_ => console.log("All done"))
