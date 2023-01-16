import {login, LoginParams} from 'masto';
import * as fs from "fs";
import {stat} from "fs";

export interface LoginSettings {
    url: string,
    accessToken:  string
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
    private readonly instance ;
    private _dryrun: boolean;
    private constructor(masto, dryrun: boolean) {
        this.instance = masto
        this._dryrun = dryrun;
    }
    
    public async doStuff(){
    }
    
    public async writeMessage(text: string, options?: CreateStatusParamsBase): Promise<{id: string}>{
        if(this._dryrun){  
            console.log("Dryrun enabled - not posting",options?.visibility??"public","message: \n" + text.split("\n").map(txt => "  > "+txt).join("\n"))
            return {id: "some_id"}
        }
        const statusUpate = await this.instance.v1.statuses.create({
            visibility: 'public',
            ...(options??{}),
            status: text
        })
        console.dir(statusUpate)
        console.log("Posted to", statusUpate.url)
        console.log(text.split("\n").map(txt => "  > "+txt).join("\n"))
        return statusUpate
    }
    
    public static async construct(settings: LoginParams & {dryrun?: boolean}) {
        return new MastodonPoster(await login(settings), settings.dryrun ?? false)
    }


    /**
     * Uploads the image; returns the id of the image
     * @param path
     * @param description
     */
   public async uploadImage(path: string, description: string): Promise<string> {
        if(this._dryrun){
            console.log("As dryrun is enabled: not uploading ", path)
            return "some_id"
        }
        console.log("Uploading", path)
        const mediaAttachment = await this.instance.v2.mediaAttachments.create({
            file: new Blob([fs.readFileSync(path)]),
            description
        })
        return mediaAttachment.id
    }
}