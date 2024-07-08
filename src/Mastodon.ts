import {login, LoginParams} from 'masto';
import * as fs from "fs";
import Utils from "./Utils";

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
    public readonly hostname: string;
    /**
     * The actual instance, see https://www.npmjs.com/package/mastodon
     * @private
     */
    private readonly instance;
    private _dryrun: boolean;
    private _userInfoCache: Record<string, any> = {}

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

    /**
     * Returns the length, counting a link as 23 characters
     * @param text
     */
    public static length23(text: string): number {
        const splitted = text.split(" ")

        let total = 0;
        for (const piece of splitted) {
            try {
                // This is a link, it counts for 23 characters
               // https://docs.joinmastodon.org/user/posting/#links
               new URL(piece)
               total += 23
            } catch (e) {
                total += piece.length
            }
        }
        // add the spaces
        total += splitted.length - 1
        return total

    }

    public async writeMessage(text: string, options?: CreateStatusParamsBase): Promise<{ id: string }> {

        if (options?.visibility === "direct" && text.indexOf("@") < 0) {
            throw ("Error: you try to send a direct message, but it has no username...")
        }
        if (MastodonPoster.length23(text) > 500) {
            console.log(text.split("\n").map(txt => "  > " + txt).join("\n"))
            throw "Error: text is too long:" + text.length

        }

        if (text.length == 0) {
            console.log("Not posting an empty message")
            return
        }

        if (this._dryrun) {
            console.log("Dryrun enabled - not posting", options?.visibility ?? "public", `message (length ${text.length}, link23: ${MastodonPoster.length23(text)}):
${text.split("\n").map(txt => "  > " + txt).join("\n")}`)
            return {id: "some_id"}
        }
        console.log("Uploading message ("+(options.mediaIds?.length ?? "no"),"attachments):\n", text.substring(0, 25) + "...", `(length ${text.length}, link23: ${MastodonPoster.length23(text)})`)
        console.log(text.split("\n").map(txt => "  > " + txt).join("\n"))
        const statusUpdate = await this.instance.v1.statuses.create({
            visibility: 'public',
            ...(options ?? {}),
            status: text
        })
        console.log("Posted successfully to", statusUpdate.url)
        return statusUpdate
    }


    public async hasNoBot(username: string): Promise<boolean> {
        const info = await this.userInfoFor(username)
        if (info === undefined) {
            return false
        }
        const descrParts = Utils.stripHtmlToInnerText(info.note)?.replace(/-/g, "")?.toLowerCase() ?? ""
        if (descrParts.indexOf("#nobot") >= 0 || descrParts.indexOf("#nomapcompletebot") >= 0) {
            console.log("Found nobot in mastodon description for", username)
            return true
        }
        const nobot = info.fields.find(f => f.name === "nobot")?.value ?? ""
        if (nobot.toLowerCase() === "yes" || nobot.toLowerCase() === "true") {
            console.log("Found nobot in mastodon fields for", username)
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
    } | undefined> {
        if (this._userInfoCache[username]) {
            return this._userInfoCache[username]
        }
        try {
            const acct = await this.instance.v1.accounts.lookup({
                acct: username,
            });
            const info = await this.instance.v1.accounts.fetch(acct.id)
            this._userInfoCache[username] = info
            return info
        } catch (e) {
            console.error("Could not fetch user details for ", username)
            return undefined
        }
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

    static totalLength(overview: string, rest: string[]) {
        return overview.length + rest.join("\n").length + 1
    }
}