import {LoginSettings} from "./Mastodon";

export interface MapCompleteUsageOverview {
    topContributorsNumberToShow: number,
    topThemesNumberToShow: number,

    /**
     * The number of days to look back. 
     */
    numberOfDays?: 1 | number
    
    /**
     * Only show changes made with this theme.
     * If omitted: show all themes
     */
    themeWhitelist?: string[]
    
}

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
    actions: {mapCompleteUsageOverview : MapCompleteUsageOverview} []
}