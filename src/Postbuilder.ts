import Histogram from "./Histogram";
import Utils from "./Utils";
import {ChangeSetData} from "./OsmCha";
import OsmUserInfo from "./OsmUserInfo";
import Config from "./Config";
import MastodonPoster from "./Mastodon";
import ImgurAttribution from "./ImgurAttribution";

type ImageInfo = { image: string, changeset: ChangeSetData, tags: Record<string, string[]> }

export class Postbuilder {
    private static readonly metakeys = [
        "answer",
        "add-image",
        "move",
        "delete",
        "plantnet-ai-detection",
        "link-image"
    ]
    private readonly _config: Config;
    private readonly _poster: MastodonPoster;
    private readonly _changesetsMade: ChangeSetData[];

    constructor(config: Config, poster: MastodonPoster, changesetsMade: ChangeSetData[]) {
        this._poster = poster;
        this._config = config;
        // Ignore 'custom' themes, they can be confusing for uninitiated users and give ugly link + we don't endorse them
        this._changesetsMade = changesetsMade.filter(cs => !cs.properties.theme.startsWith("http://") && !cs.properties.theme.startsWith("https://"))
        ;
    }


    getStatisticsFor(changesetsMade?: ChangeSetData[]): { total: number, addImage?: number, deleted: number, answered?: number, moved?: number, summaryText?: string } {

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
        const {answer, move} = stats
        const deleted = stats.delete
        const images = stats["add-image"]
        const plantnetDetected = stats["plantnet-ai-detection"]
        const linkedImages = stats["link-image"]
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
                overview.push("moved one point")
            } else {
                overview.push("moved " + move + " points")
            }
        }

        if (deleted) {
            if (deleted == 1) {
                overview.push("delted one deleted")
            } else {
                overview.push("deleted " + deleted + " points")
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
        const userinfo = new OsmUserInfo(Number(uid), this._config)
        const inf = await userinfo.getUserInfo()
        const mastodonLinks = await userinfo.getMeLinks()

        const themes = new Histogram(changesetsMade, cs => cs.properties.theme)

        let username = inf.display_name
        if (mastodonLinks.length > 0) {
            const url = new URL(mastodonLinks[0])
            username = url.pathname.substring(1) + "@" + url.host
        }
        const statistics = this.getStatisticsFor(changesetsMade)

        let thematicMaps = "maps " + Utils.commasAnd(themes.keys())
        if (themes.keys().length === 1) {
            thematicMaps = "map " + Utils.commasAnd(themes.keys())
        }

        return username + " " + statistics.summaryText + " with the thematic " + thematicMaps
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
                const uid = ""+props.uid


                if (result.indexOf(image) >= 0) {
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
        }

        return result
    }

    public async buildMessage(): Promise<void> {
        const changesets = this._changesetsMade
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
        const {totalImagesCreated, attachmentIds, imgAuthors, totalImageContributorCount} = await this.prepareImages(changesets, 12)

        let toSend: string[] = [
            "Today, " + perContributor.keys().length + " different persons made " + totalStats.total + " changes to #OpenStreetMap using https://mapcomplete.osm.be .\n",
        ]

        for (let i = 0; i < this._config.postSettings.topContributorsNumberToShow - 1 && i < topContributors.length; i++) {
            const uid = topContributors[i].key
            const changesetsMade = perContributor.get(uid)
            try {
                const overview = await this.createOverviewForContributor(uid, changesetsMade)
                if (overview.length + toSend.join("\n").length > 500) {
                    break
                }
                toSend.push(" - " + overview)
            } catch (e) {
                console.error("Could not add contributor " + uid, e)
            }

        }

        const firstPost = await this._poster.writeMessage(toSend.join("\n"), {mediaIds: attachmentIds.slice(0, 4)})
        toSend = []

        const perTheme = new Histogram(changesets, cs => {
            return cs.properties.theme;
        })

        const mostPopularThemes = perTheme.sortedByCount({
            countMethod: cs => this.getStatisticsFor([cs]).total,
            dropZeroValues: true
        })
        toSend.push("")
        for (let i = 0; i < this._config.postSettings.topThemesNumberToShow && i < mostPopularThemes.length; i++) {
            const theme = mostPopularThemes[i].key
            const changesetsMade = perTheme.get(theme)
            toSend.push(await this.createOverviewForTheme(theme, changesetsMade))
        }

        const secondPost = await this._poster.writeMessage(toSend.join("\n"), {
            inReplyToId: firstPost["id"],
            mediaIds: attachmentIds.slice(4, 8)
        })
        
        await this._poster.writeMessage([
            "In total, "+totalImageContributorCount+" different contributors uploaded "+totalImagesCreated+" images.\n",
            "Images in this thread are randomly selected from them and were made by: ",
            ...Array.from(new Set<string>(imgAuthors)).map(auth => "- "+auth )
            
        ].join("\n"),{
            inReplyToId: secondPost["id"],
            mediaIds: attachmentIds.slice(8,12)
        })
        
        
    }

    private async prepareImages(changesets: ChangeSetData[], targetCount: number = 4): Promise<{ imgAuthors: string[], attachmentIds: string[], totalImagesCreated: number, totalImageContributorCount: number }> {
        const withImage: ChangeSetData[] = changesets.filter(cs => cs.properties["add-image"] > 0)
        const totalImagesCreated = Utils.Sum(withImage.map(cs => cs.properties["add-image"]))

        const images: ImageInfo[] = []
        for (const changeset of withImage) {
            const tags = changeset.properties.tag_changes
            for (const key in tags) {
                if (!key.startsWith("image")) {
                    continue
                }
                const values: string[] = tags[key]
                for (const image of values) {
                    images.push({image, changeset, tags})
                }
            }
        }

        const randomImages: ImageInfo[] = this.selectImages(images, targetCount)
        const attachmentIds: string[] = []
        const imgAuthors: string[] = []
        for (const randomImage of randomImages) {
            const id = randomImage.image.substring(randomImage.image.lastIndexOf("/") + 1)
            const path = this._config.cacheDir + "/image_" + id
            await Utils.DownloadBlob(randomImage.image, path)
            const attribution = await ImgurAttribution.DownloadAttribution(randomImage.image)
            const mediaId = await this._poster.uploadImage(path, "Image taken by " + attribution.author + ", available under " + attribution.license + ". It is made with the thematic map "+randomImage.changeset.properties.theme+" in changeset https://openstreetmap.org/changeset/"+randomImage.changeset.id)
            attachmentIds.push(mediaId)
            imgAuthors.push(attribution.author)
        }
        return {attachmentIds, imgAuthors, totalImagesCreated, totalImageContributorCount: new Set(changesets.map(cs => cs.properties.uid)).size}
    }
}