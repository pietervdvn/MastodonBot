import {LoginSettings} from "./Mastodon";

export interface MapCompleteUsageOverview {
    showTopContributors?: boolean,
    showTopThemes?: boolean,

    /**
     * Add a content warning to all posts
     */
    contentWarning?: string,

    /**
     * Term to use in 'created/moved/deleted one point'
     */
    poiName?: "point" | string

    /**
     * Term to use in 'created/moved/deleted n points'
     */
    poisName?: "points" | string
    
    report?:{
        overpassQuery: string,
        /**
         * Values {total} and {date} will be substituted
         */
        post: string
        /**
         * Default: global bbox
         * Use something like `[bbox:51.19999983412068,2.8564453125,51.41976382669736,3.416748046875]` if only a certain region should be sent
         */
        bbox?: string
    }

    /**
     * The number of days to look back. 
     */
    numberOfDays?: 1 | number
    
    /**
     * Only show changes made with this theme.
     * If omitted: show all themes
     */
    themeWhitelist?: string[]
    /**
     * Show a thank you note
     */
    showThankYou?: boolean | true
    
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
    actions: MapCompleteUsageOverview []

   
}