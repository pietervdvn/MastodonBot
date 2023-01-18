import Histogram from "./Histogram";
import Utils from "./Utils";
import {ChangeSetData} from "./OsmCha";
import OsmUserInfo from "./OsmUserInfo";
import Config, {MapCompleteUsageOverview} from "./Config";
import MastodonPoster from "./Mastodon";
import ImgurAttribution from "./ImgurAttribution";
import Overpass from "./Overpass";

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


    getStatisticsFor(changesetsMade?: ChangeSetData[]): { total: number, 
        answered?: number,
        created?: number,
        addImage?: number, 
        deleted: number, 
        moved?: number, 
        summaryText?: string } {

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
        if(create){
            if (create == 1) {
                overview.push("added one "+poi)
            } else {
                overview.push("added " + create +" "+pois)
            }
        }
        if (answer) {
            if (answer == 1) {
                overview.push("answered one question")
            } else {
                overview.push("answered " + answer + " questions")
            }
        }
        if (images) {
            if (images == 1) {
                overview.push("uploaded one image")
            } else {
                overview.push("uploaded " + images + " images")
            }
        }

        if (move) {
            if (move == 1) {
                overview.push("moved one "+poi)
            } else {
                overview.push("moved " + move + " "+pois)
            }
        }

        if (deleted) {
            if (deleted == 1) {
                overview.push("deleted one "+poi)
            } else {
                overview.push("deleted " + deleted + " "+pois)
            }
        }

        if (plantnetDetected) {
            if (plantnetDetected == 1) {
                overview.push("detected one plant species with plantnet.org")
            } else {
                overview.push("detected " + plantnetDetected + " plant species with plantnet.org")
            }
        }

        if (linkedImages) {
            if (linkedImages == 1) {
                overview.push("linked one linked")
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


    async createOverviewForContributor(uid: string, changesetsMade: ChangeSetData[]): Promise<string> {
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

    async createOverviewForTheme(theme: string, changesetsMade: ChangeSetData[]): Promise<string> {
        const statistics = this.getStatisticsFor(changesetsMade)
        const contributorCount = new Set(changesetsMade.map(cs => cs.properties.uid)).size

        let contribCountStr = contributorCount + " contributors"
        if (contributorCount == 1) {
            contribCountStr = "one contributor"
        }
        return `${contribCountStr} ${statistics.summaryText} on https://mapcomplete.osm.be/${theme}`
    }

    public selectImages(images: ImageInfo[], targetCount: number = 4):
        ImageInfo[] {
        if (images.length <= targetCount) {
            return images
        }
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
        for (let i = 0; i < targetCount; i++) {
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

    public async buildMessage(date: string): Promise<void> {
        const changesets = this._changesetsMade
        let lastPostId: string = undefined


        if(this._config.report){
            const report = this._config.report
            const overpass = new Overpass(report)
            const data = await overpass.query()
            const total = data.elements.length
            const date = data.osm3s.timestamp_osm_base.substring(0, 10)
            lastPostId = (await this._poster.writeMessage(
                report.post.replace(/{total}/g, ""+total).replace(/{date}/g, date)
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
            attachmentIds,
            imgAuthors,
            totalImageContributorCount
        } = await this.prepareImages(changesets, 12)

        let timePeriod = "Yesterday"
        if (this._config.numberOfDays > 1) {
            timePeriod = "In the past " + this._config.numberOfDays + " days"
        }
        const singleTheme = this._config?.themeWhitelist?.length === 1 ? "/" + this._config.themeWhitelist[0] : ""
        let toSend: string[] = [
            `${timePeriod}, ${perContributor.keys().length} persons made ${totalStats.total} changes to #OpenStreetMap using https://mapcomplete.osm.be${singleTheme} .
`,
        ]

        if (this._config.showTopContributors && topContributors.length > 0) {
            for (const topContributor of topContributors) {
                const uid = topContributor.key
                const changesetsMade = perContributor.get(uid)
                try {
                    const userInfo = new OsmUserInfo(Number(uid))
                    const {nobot} = await userInfo.hasNoBotTag()
                    if (nobot) {
                        continue
                    }
                    const overview = await this.createOverviewForContributor(uid, changesetsMade)
                    if (overview.length + toSend.join("\n").length > 500) {
                        break
                    }
                    toSend.push(" - " + overview)
                } catch (e) {
                    console.error("Could not add contributor " + uid, e)
                }
            }
            lastPostId = (await this._poster.writeMessage(toSend.join("\n"), {mediaIds: attachmentIds.slice(0, 4)})).id
            toSend = []
        }

        const perTheme = new Histogram(changesets, cs => {
            return cs.properties.theme;
        })

        const mostPopularThemes = perTheme.sortedByCount({
            countMethod: cs => this.getStatisticsFor([cs]).total,
            dropZeroValues: true
        })
        if (this._config.showTopThemes && mostPopularThemes.length > 0) {

            for (const theme of mostPopularThemes) {
                const themeId = theme.key
                const changesetsMade = perTheme.get(themeId)
                const overview = await this.createOverviewForTheme(themeId, changesetsMade)
                if (overview.length + toSend.join("\n").length > 500) {
                    break
                }
                toSend.push(overview)
            }

            lastPostId = (await this._poster.writeMessage(toSend.join("\n"), {
                inReplyToId: lastPostId,
                mediaIds: attachmentIds.slice(4, 8)
            })).id
            toSend = []
        }


        const authorNames = Array.from(new Set<string>(imgAuthors))
        await this._poster.writeMessage([
                "In total, " + totalImageContributorCount + " different contributors uploaded " + totalImagesCreated + " images.\n",
                "Images in this thread are randomly selected from them and were made by: ",
                ...authorNames.map(auth => "- " + auth),
                "",
                "All changes were made on " + date + (this._config.numberOfDays > 1 ? ` or at most ${this._config.numberOfDays} days before` : "")

            ].join("\n"), {
                inReplyToId: lastPostId,
                mediaIds: attachmentIds.slice(8, 12)
            }
        )


    }

    private async prepareImages(changesets: ChangeSetData[], targetCount: number = 4): Promise<{ imgAuthors: string[], attachmentIds: string[], totalImagesCreated: number, totalImageContributorCount: number }> {
        const withImage: ChangeSetData[] = changesets.filter(cs => cs.properties["add-image"] > 0)
        const totalImagesCreated = Utils.Sum(withImage.map(cs => cs.properties["add-image"]))

        const images: ImageInfo[] = []
        const seenURLS = new Set<string>()
        for (const changeset of withImage) {

            const userinfo = new OsmUserInfo(Number(changeset.properties.uid))
            const {nobot} = await userinfo.hasNoBotTag()
            if (nobot) {
                console.log("Not indexing images of user", changeset.properties.user)
                continue
            }

            const url = this._globalConfig.osmBackend + "/api/0.6/changeset/" + changeset.id + "/download"
            const osmChangeset = await Utils.DownloadXml(url)
            const osmChangesetTags: { k: string, v: string }[] = Array.from(osmChangeset.getElementsByTagName("tag"))
                .map(tag => ({k: tag.getAttribute("k"), v: tag.getAttribute("v")}))
                .filter(kv => kv.k.startsWith("image"))

            for (const kv of osmChangesetTags) {
                if (seenURLS.has(kv.v)) {
                    continue
                }
                seenURLS.add(kv.v)
                images.push({image: kv.v, changeset})
            }
        }

        const randomImages: ImageInfo[] = this.selectImages(images, targetCount)
        const attachmentIds: string[] = []
        const imgAuthors: string[] = []
        for (const randomImage of randomImages) {

            const cs = randomImage.changeset.properties
            let authorName = cs.user
            try {
                const authorInfo = new OsmUserInfo(Number(cs.uid), this._globalConfig)
                authorName = (await authorInfo.GetMastodonUsername(this._poster)) ?? cs.user
            } catch (e) {
                console.log("Could not fetch more info about contributor", authorName, cs.uid, "due to", e)
            }
            imgAuthors.push(authorName)
            if (this._globalConfig.mastodonAuth.dryrun) {
                console.log("Not uploading/downloading image:" + randomImage.image + " dryrun")
                continue
            }
            const attribution = await ImgurAttribution.DownloadAttribution(randomImage.image)
            const id = randomImage.image.substring(randomImage.image.lastIndexOf("/") + 1)
            const path = this._globalConfig.cacheDir + "/image_" + id
            await Utils.DownloadBlob(randomImage.image, path)
            const mediaId = await this._poster.uploadImage(path, "Image taken by " + authorName + ", available under " + attribution.license + ". It is made with the thematic map " + randomImage.changeset.properties.theme + " in changeset https://openstreetmap.org/changeset/" + randomImage.changeset.id)
            attachmentIds.push(mediaId)

        }
        return {
            attachmentIds,
            imgAuthors,
            totalImagesCreated,
            totalImageContributorCount: new Set(withImage.map(cs => cs.properties.uid)).size
        }
    }
}