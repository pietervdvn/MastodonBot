import {ChangeSetData} from "./OsmCha";
import MastodonPoster from "./Mastodon";
import OsmUserInfo from "./OsmUserInfo";
import Utils from "./Utils";
import Config from "./Config";
import {ImageData, Panoramax, PanoramaxXYZ} from "panoramax-js";

export default class ImageUploader {
    private readonly _imageQueue: { image: string; changeset: ChangeSetData }[];
    private _poster: MastodonPoster;
    private _authors: string[] = []

    private readonly _globalConfig: Config


    constructor(imageQueue: { image: string, changeset: ChangeSetData }[], poster: MastodonPoster, config: Config) {
        this._imageQueue = imageQueue;
        this._poster = poster;
        this._globalConfig = config
    }

    public getCurrentAuthors() {
        return [...this._authors]
    }

    public async attemptToUpload(targetcount: number): Promise<string[]> {
        const mediaIds = []
        while (mediaIds.length < targetcount && this._imageQueue.length > 0) {
            const first = this._imageQueue[0]
            try {
                const id = await this.uploadFirstImage()
                mediaIds.push(id)
            } catch (e) {
                console.error("Could not upload image! ", first.image, e)
                console.log("Trying again")
                try {
                    const id = await this.uploadFirstImage()
                    mediaIds.push(id)
                } catch (e) {
                    console.error("Retry could not upload image! ", first.image, e)
                }
            }
        }
        return mediaIds
    }

    private async uploadFirstImage(): Promise<string> {
        const image = this._imageQueue.shift()
        const cs = image.changeset.properties
        let authorName = cs.user
        try {
            const authorInfo = new OsmUserInfo(Number(cs.uid), this._globalConfig)
            authorName = (await authorInfo.GetMastodonUsername(this._poster)) ?? cs.user
        } catch (e) {
            console.log("Could not fetch more info about contributor", authorName, cs.uid, "due to", e)
        }
        if (this._globalConfig.mastodonAuth.dryrun) {
            console.log("Not uploading/downloading image:" + image.image + " dryrun")
            this._authors.push(authorName)
            return "dummy_id"
        }
        console.log("Fetching attribution for", image.image)
        let imageData: ImageData = undefined
        try {

            const p = new Panoramax("https://panoramax.mapcomplete.org")
            imageData = await p.imageInfo(image.image)
        } catch (e) {
            const p = new PanoramaxXYZ()
            imageData = await p.imageInfo(image.image)

        }
        const path = this._globalConfig.cacheDir + "/image_" + image.image
        console.log("Fetching image:", imageData.assets.sd.href)
        await Utils.DownloadBlob(imageData.assets.sd.href, path)
        const mediaId = await this._poster.uploadImage(path, "Image taken by " + authorName + ", available under " + imageData.properties["geovisio:license"] + ". It is made with the thematic map " + image.changeset.properties.theme + " in changeset https://openstreetmap.org/changeset/" + image.changeset.id)

        this._authors.push(authorName)
        return mediaId
    }


}