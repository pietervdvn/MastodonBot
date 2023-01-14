import {LoginSettings} from "./Mastodon";

export default interface Config {
    /**
     * Default: https://www.openstreetmap.org
     */
    osmBackend?: string,
    /**
     * Directory to place caching files.
     * If undefined: no caching will be used
     */
    cacheDir?: string,

    /**
     * Authentication options for mastodon
     */
    mastodonAuth: LoginSettings & {
        /** IF set: prints to console instead of to Mastodon*/
        dryrun?: boolean
    },
    postSettings:{
        topContributorsNumberToShow: number,
        topThemesNumberToShow: number
    }
}