import Histogram from "./Histogram";
import Utils from "./Utils";
import {ChangeSetData} from "./OsmCha";
import OsmUserInfo from "./OsmUserInfo";
import Config, {MapCompleteUsageOverview} from "./Config";
import MastodonPoster from "./Mastodon";
import Overpass from "./Overpass";
import ImageUploader from "./ImageUploader";

type ImageInfo = { image: string, changeset: ChangeSetData }

export class Postbuilder {
    private static readonly metakeys = [
        "answer",
        "create",
        "add-image",
        "move",
        "delete",
        "plantnet-ai-detection",
        "link-image"
    ]
    private readonly _config: MapCompleteUsageOverview;
    private readonly _globalConfig: Config

    private readonly _poster: MastodonPoster;
    private readonly _changesetsMade: ChangeSetData[];

    constructor(config: MapCompleteUsageOverview, globalConfig: Config, poster: MastodonPoster, changesetsMade: ChangeSetData[]) {
        this._globalConfig = globalConfig;
        this._poster = poster;
        this._config = config;
        // Ignore 'custom' themes, they can be confusing for uninitiated users and give ugly link + we don't endorse them
        this._changesetsMade = changesetsMade.filter(cs => !cs.properties.theme.startsWith("http://") && !cs.properties.theme.startsWith("https://"))
        ;
    }

    public async buildMessage(date: string): Promise<void> {
        const changesets = this._changesetsMade
        let lastPostId: string = undefined


        if (this._config.report) {
            const report = this._config.report
            const overpass = new Overpass(report)
            const data = await overpass.query()
            const ids = data.elements.map(e => e.type + "/" + e.id)
            const total = new Set<string>(ids).size
            const date = data.osm3s.timestamp_osm_base.substring(0, 10)
            lastPostId = (await this._poster.writeMessage(
                report.post.replace(/{total}/g, "" + total).replace(/{date}/g, date),
                {spoilerText: this._config.contentWarning}
            )).id
        }

        const perContributor = new Histogram(changesets, cs => cs.properties.uid)
        const topContributors = perContributor.sortedByCount({
            countMethod: cs => {
                let sum = 0
                for (const metakey of Postbuilder.metakeys) {
                    if (cs.properties[metakey]) {
                        sum += cs.properties[metakey]
                    }
                }
                return sum
            }
        });


        const totalStats = this.getStatisticsFor()
        const {
            totalImagesCreated,
            randomImages,
            totalImageContributorCount
        } = await this.prepareImages(changesets)
        const imageUploader = new ImageUploader(randomImages, this._poster, this._globalConfig)

        let timePeriod = "yesterday"
        if (this._config.numberOfDays > 1) {
            timePeriod = "in the past " + this._config.numberOfDays + " days"
        }


        if (this._config.showTopContributors && topContributors.length > 0) {
            const singleTheme = this._config?.themeWhitelist?.length === 1 ? "/" + this._config.themeWhitelist[0] : ""
            const toSend: string[] = [
                `${perContributor.keys().length} people made ${totalStats.total} changes ${timePeriod} to #OpenStreetMap using https://mapcomplete.org${singleTheme}`,
                ""
            ]

            // We group contributors that only contributed to 'etymology' as they otherwise spam the first entry

            const {
                alreadyMentioned,
                message
            } = await this.GroupTopcontributorsForTheme("etymology", topContributors, perContributor)
            if (message?.length > 0) {
                toSend.push(message)
            }

            for (const topContributor of topContributors) {
                const uid = topContributor.key
                if (alreadyMentioned.has(uid)) {
                    continue
                }
                const changesetsMade = perContributor.get(uid)
                try {
                    const userInfo = new OsmUserInfo(Number(uid), this._globalConfig)
                    const {nobot} = await userInfo.hasNoBotTag()
                    if (nobot) {
                        continue
                    }
                    const overview = await this.createOverviewForContributor(uid, changesetsMade)
                    if (MastodonPoster.totalLength(overview, toSend) > 500) {
                        break
                    }
                    toSend.push(overview)
                } catch (e) {
                    console.error("Could not add contributor " + uid, e)
                }
            }
            lastPostId = (await this._poster.writeMessage(toSend.join("\n"),
                {
                    inReplyToId: lastPostId,
                    mediaIds: await imageUploader.attemptToUpload(4),
                    spoilerText: this._config.contentWarning
                })).id
        }

        const perTheme = new Histogram(changesets, cs => {
            return cs.properties.theme;
        })

        const mostPopularThemes = perTheme.sortedByCount({
            countMethod: cs => this.getStatisticsFor([cs]).total,
            dropZeroValues: true
        })
        if (this._config.showTopThemes && mostPopularThemes.length > 0) {
            const toSend = []
            for (const theme of mostPopularThemes) {
                const themeId = theme.key
                const changesetsMade = perTheme.get(themeId)
                const overview = await this.createOverviewForTheme(themeId, changesetsMade)
                if (MastodonPoster.totalLength(overview, toSend) > 500) {
                    break
                }
                toSend.push(overview)
            }

            lastPostId = (await this._poster.writeMessage(toSend.join("\n"), {
                inReplyToId: lastPostId,
                mediaIds: await imageUploader.attemptToUpload(4),
                spoilerText: this._config.contentWarning
            })).id
        }


        const images = await imageUploader.attemptToUpload(4)
        const authors = Array.from(new Set(imageUploader.getCurrentAuthors()))
        if (authors.length > 0) {
            let imageCount = totalImagesCreated === 1 ? "one image" : totalImagesCreated + " images"
            let contributors = totalImageContributorCount === 1 ? "One contributor": totalImageContributorCount+" contributors"
            let contributorCountMultiple =  `${contributors} uploaded ${imageCount}.`
            let thankYou = (this._config.showThankYou ?? true) ?  "\nA big thanks to everyone who is contributing!\n\n" : ""
            await this._poster.writeMessage([
                    contributorCountMultiple + "\n",
                    "Images in this thread are randomly selected from them and were made by: ",
                    ...authors,
                    thankYou,
                    "All changes were made on " + date + (this._config.numberOfDays > 1 ? ` or at most ${this._config.numberOfDays} days before` : "")

                ].join("\n"), {
                    inReplyToId: lastPostId,
                    mediaIds: images,
                    spoilerText: this._config.contentWarning
                }
            )
        }


    }

    private getStatisticsFor(changesetsMade?: ChangeSetData[]): {
        total: number,
        answered?: number,
        created?: number,
        addImage?: number,
        deleted: number,
        moved?: number,
        summaryText?: string
    } {

        const stats: Record<string, number> = {}
        changesetsMade ??= this._changesetsMade
        let total = 0
        for (const changeset of changesetsMade) {
            for (const metakey of Postbuilder.metakeys) {
                if (changeset.properties[metakey]) {
                    stats[metakey] = (stats[metakey] ?? 0) + changeset.properties[metakey]
                    total += changeset.properties[metakey]
                }
            }
        }

        let overview: string[] = []
        const {answer, move, create} = stats
        const deleted = stats.delete
        const images = stats["add-image"]
        const plantnetDetected = stats["plantnet-ai-detection"]
        const linkedImages = stats["link-image"]
        const poi = this._config.poiName ?? "point"
        const pois = this._config.poisName ?? "points"
        if (create) {
            if (create == 1) {
                overview.push("added a " + poi)
            } else {
                overview.push("added " + create + " " + pois)
            }
        }
        if (answer) {
            if (answer == 1) {
                overview.push("answered a question")
            } else {
                overview.push("answered " + answer + " questions")
            }
        }
        if (images) {
            if (images == 1) {
                overview.push("uploaded an image")
            } else {
                overview.push("uploaded " + images + " images")
            }
        }

        if (move) {
            if (move == 1) {
                overview.push("moved a " + poi)
            } else {
                overview.push("moved " + move + " " + pois)
            }
        }

        if (deleted) {
            if (deleted == 1) {
                overview.push("deleted a " + poi)
            } else {
                overview.push("deleted " + deleted + " " + pois)
            }
        }

        if (plantnetDetected) {
            if (plantnetDetected == 1) {
                overview.push("detected a plant species with plantnet.org")
            } else {
                overview.push("detected " + plantnetDetected + " plant species with plantnet.org")
            }
        }

        if (linkedImages) {
            if (linkedImages == 1) {
                overview.push("linked an image")
            } else {
                overview.push("linked " + linkedImages + " images")
            }
        }

        let summaryText = Utils.commasAnd(overview)

        return {
            total: total,
            addImage: stats["add-image"],
            deleted: stats.delete,
            answered: stats.answer,
            moved: stats.move,
            summaryText
        }

    }

    private async createOverviewForContributor(uid: string, changesetsMade: ChangeSetData[]): Promise<string> {
        const userinfo = new OsmUserInfo(Number(uid), this._globalConfig)
        const inf = await userinfo.getUserInfo()

        const themes = new Histogram(changesetsMade, cs => cs.properties.theme)

        let username = await userinfo.GetMastodonUsername(this._poster) ?? inf.display_name

        const statistics = this.getStatisticsFor(changesetsMade)

        let thematicMaps = " with the thematic maps " + Utils.commasAnd(themes.keys())
        if (this._config?.themeWhitelist?.length === 1) {
            thematicMaps = ""
        } else if (themes.keys().length === 1) {
            thematicMaps = " with the thematic map " + Utils.commasAnd(themes.keys())
        }

        return username + " " + statistics.summaryText + thematicMaps
    }

    private async createOverviewForTheme(theme: string, changesetsMade: ChangeSetData[]): Promise<string> {
        const statistics = this.getStatisticsFor(changesetsMade)
        const contributorCount = new Set(changesetsMade.map(cs => cs.properties.uid)).size

        let contribCountStr = contributorCount + " contributors"
        if (contributorCount == 1) {
            contribCountStr = "a contributor"
        }
        return `${contribCountStr} ${statistics.summaryText} on https://mapcomplete.org/${theme}`
    }

    /**
     * Creates a new list of images, sorted by priority.
     * It tries to order them in such a way that the number of contributors is as big as possible.
     * However, it is biased to select pictures from certain themes too
     * @param images
     */
    private selectImages(images: ImageInfo[]):
        ImageInfo[] {

        const themeBonus = {
            climbing: 1,
            rainbow_crossings: 1,
            binoculars: 2,
            artwork: 2,
            ghost_bikes: 1,
            trees: 2,
            bookcases: 1,
            playgrounds: 1,
            aed: 1,
            benches: 1,
            nature: 1
        }

        const alreadyEncounteredUid = new Map<string, number>()

        const result: ImageInfo[] = []
        for (let i = 0; i < images.length; i++) {
            let bestImageScore: number = -999999999
            let bestImageOptions: ImageInfo[] = []

            for (const image of images) {
                const props = image.changeset.properties
                const uid = "" + props.uid

                if (result.findIndex(i => i.image === image.image) >= 0) {
                    continue
                }

                let score = 0
                if (alreadyEncounteredUid.has(uid)) {
                    score -= 100 * alreadyEncounteredUid.get(uid)
                }
                score += themeBonus[props.theme] ?? 0

                if (score > bestImageScore) {
                    bestImageScore = score
                    bestImageOptions = [image]
                } else if (score === bestImageScore) {
                    bestImageOptions.push(image)
                }
            }

            const ri = Math.floor((bestImageOptions.length - 1) * Math.random())
            const randomBestImage = bestImageOptions[ri]
            result.push(randomBestImage)
            const theme = randomBestImage.changeset.properties.theme
            themeBonus[theme] = (themeBonus[theme] ?? 0) - 1
            const uid = randomBestImage.changeset.properties.uid
            alreadyEncounteredUid.set(uid, (alreadyEncounteredUid.get(uid) ?? 0) + 1)
            console.log("Selecting image", randomBestImage.image, " by ", randomBestImage.changeset.properties.user + " with score " + bestImageScore)
        }

        return result
    }

    private async GroupTopcontributorsForTheme(theme: string, topContributors: {
        key: string;
        count: number
    }[], perContributor: Histogram<ChangeSetData>, maxCount = 3): Promise<{
        alreadyMentioned: Set<string>;
        message: string
    }> {
        const alreadyMentioned = new Set<string>()
        const etymologyContributors: { username: string }[] = []
        for (const topContributor of topContributors) {
            const uid = topContributor.key
            const changesetsMade = perContributor.get(uid)
            if (changesetsMade.find(cs => cs.properties.theme !== theme)) {
                continue
            }
            // This is an etymology-only contributor
            alreadyMentioned.add(uid)
            const userInfo = new OsmUserInfo(Number(uid), this._globalConfig)
            const {nobot} = await userInfo.hasNoBotTag()
            if (nobot) {
                continue
            }
            const info = await userInfo.getUserInfo()
            const username = await userInfo.GetMastodonUsername(this._poster) ?? info.display_name
            etymologyContributors.push({username})
        }
        let message: string
        if (etymologyContributors.length <= 1) {
            return {
                alreadyMentioned: new Set<string>(),
                message: undefined
            }
        }
        if (etymologyContributors.length <= 4) {
            message = `${Utils.commasAnd(etymologyContributors.map(c => c.username))} contributed with thematic map ${theme}`
        } else {
            message = `${etymologyContributors.slice(0, 3).map(c => c.username).join(", ")} and ${etymologyContributors.length - 3} others contributed with thematic map ${theme}`

        }

        return {
            alreadyMentioned,
            message
        }
    }

    private async prepareImages(changesets: ChangeSetData[]): Promise<{
        randomImages: { image: string, changeset: ChangeSetData }[],
        totalImagesCreated: number,
        totalImageContributorCount: number
    }> {
        const withImage: ChangeSetData[] = changesets.filter(cs => cs.properties["add-image"] > 0)
        const totalImagesCreated = Utils.Sum(withImage.map(cs => cs.properties["add-image"]))

        const images: ImageInfo[] = []
        const seenURLS = new Set<string>()
        for (const changeset of withImage) {

            const userinfo = new OsmUserInfo(Number(changeset.properties.uid), this._globalConfig)
            const {nobot} = await userinfo.hasNoBotTag()
            if (nobot) {
                console.log("Not indexing images of user", changeset.properties.user)
                continue
            }

            const url = this._globalConfig.osmBackend + "/api/0.6/changeset/" + changeset.id + "/download"
            const osmChangeset = await Utils.DownloadXml(url)
            const osmChangesetTags: { k: string, v: string }[] = Array.from(osmChangeset.getElementsByTagName("tag"))
                .map(tag => ({k: tag.getAttribute("k"), v: tag.getAttribute("v")}))
                .filter(kv => kv.k.startsWith("panoramax"))

            for (const kv of osmChangesetTags) {
                if (seenURLS.has(kv.v)) {
                    continue
                }
                seenURLS.add(kv.v)
                images.push({image: kv.v, changeset})
            }
        }

        const randomImages: ImageInfo[] = this.selectImages(images)

        return {
            randomImages,
            totalImagesCreated,
            totalImageContributorCount: new Set(withImage.map(cs => cs.properties.uid)).size
        }
    }
}