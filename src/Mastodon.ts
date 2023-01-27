import {login, LoginParams} from 'masto';
import * as fs from "fs";

export interface LoginSettings {
    url: string,
    accessToken: string
}

export interface CreateStatusParamsBase {
    /** ID of the status being replied to, if status is a reply */
    readonly inReplyToId?: string | null;
    /** Mark status and attached media as sensitive? */
    readonly sensitive?: boolean | null;
    /** Text to be shown as a warning or subject before the actual content. Statuses are generally collapsed behind this field. */
    readonly spoilerText?: string | null;
    /** Visibility of the posted status. Enumerable oneOf public, unlisted, private, direct. */
    readonly visibility?: "public" | "unlisted" | "private" | "direct" | null;
    /** ISO 639 language code for this status. */
    readonly language?: string | null;

    readonly mediaIds?: readonly string[];

}

export default class MastodonPoster {
    /**
     * The actual instance, see https://www.npmjs.com/package/mastodon
     * @private
     */
    private readonly instance;
    private _dryrun: boolean;
    private _userInfoCache: Record<string, any> = {}
    public readonly hostname: string;

    private constructor(masto, dryrun: boolean, hostname: string) {
        this.instance = masto
        this._dryrun = dryrun;
        this.hostname = hostname
    }

    public static async construct(settings: LoginParams & { dryrun?: boolean }) {
        return new MastodonPoster(await login(settings), settings.dryrun ?? false, 
            new URL(settings.url).hostname
            )
    }

    public async writeMessage(text: string, options?: CreateStatusParamsBase): Promise<{ id: string }> {

        if (options?.visibility === "direct" && text.indexOf("@") < 0) {
            throw ("Error: you try to send a direct message, but it has no username...")
        }
        if (text.length > 500) {
            console.log(text.split("\n").map(txt => "  > " + txt).join("\n"))
            throw "Error: text is too long:" + text.length

        }

        if (text.length == 0) {
            console.log("Not posting an empty message")
            return
        }

        if (this._dryrun) {
            console.log("Dryrun enabled - not posting", options?.visibility ?? "public", "message: \n" + text.split("\n").map(txt => "  > " + txt).join("\n"))
            return {id: "some_id"}
        }
        const statusUpate = await this.instance.v1.statuses.create({
            visibility: 'public',
            ...(options ?? {}),
            status: text
        })
        console.log("Posted to", statusUpate.url)
        console.log(text.split("\n").map(txt => "  > " + txt).join("\n"))
        return statusUpate
    }

    public async hasNoBot(username: string): Promise<boolean> {
        const info = await this.userInfoFor(username)
        const descrParts = info.note?.replace(/-/g, "")?.toLowerCase()?.split(" ") ?? []
        if (descrParts.indexOf("#nobot") >= 0 || descrParts.indexOf("#nomapcompletebot") >= 0) {
            return true
        }
        const nobot = info.fields.find(f => f.name === "nobot")?.value ?? ""
        if (nobot.toLowerCase() === "yes" || nobot.toLowerCase() === "true") {
            return true
        }
        return false
    }

    public async userInfoFor(username: string): Promise<{
        id: string,
        /*Fully qualified user name*/
        acct: string
        displayname: string,
        bot: boolean,
        /* User-set biography */
        note: string,
        url: string,
        avatar: string,
        avatarStatic: string,
        header: string,
        headerStatic: string,
        followersCount: number,
        followingCount: number,
        statusesCount: number,
        fields: { name: string, value: string }[]
    }> {
        if (this._userInfoCache[username]) {
            return this._userInfoCache[username]
        }
        const acct = await this.instance.v1.accounts.lookup({
            acct: username,
        });
        const info = await this.instance.v1.accounts.fetch(acct.id)
        this._userInfoCache[username] = info
        return info
    }

    /**
     * Uploads the image; returns the id of the image
     * @param path
     * @param description
     */
    public async uploadImage(path: string, description: string): Promise<string> {
        if (this._dryrun) {
            console.log("As dryrun is enabled: not uploading ", path)
            return "some_id"
        }
        console.log("Uploading", path)
        try {

            const mediaAttachment = await this.instance.v2.mediaAttachments.create({
                file: new Blob([fs.readFileSync(path)]),
                description
            })
            return mediaAttachment.id
        } catch (e) {
            console.log("Could not upload image " + path + " due to ", e, "Trying again...")
            const mediaAttachment = await this.instance.v2.mediaAttachments.create({
                file: new Blob([fs.readFileSync(path)]),
                description
            })
            return mediaAttachment.id
        }
    }
}