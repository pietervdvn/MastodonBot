# Mastodon-Bot

This is a bot which is built to post a daily message about mapcomplete-usage.

## How it works

It fetches latest changesets from OsmCha, processes them and posts them to Mastodon.

Changesets which have the `add-image`-tag are downloaded from the OSM-api and crawled for images, of which some are picked to add to the posts.

Note that the image selection process is opinionated: some themes (artwork, nature, trees, ...) have a higher probability of being picked.
Furthermore, it tries to pick at most one image per contributor - so images by the same contributor will only be used if there are more images to add then contributors.

## Disabling mentions

You can indicate this to the bot in the following way:

### On Mastodon

- You can mute or block the bot so that you won't see the posts. Your user account on OpenStreetMap or your Mastodon-username will still be mentioned in the posts
- You can add the hashtag `#nobot` or `#no-mapcomplete-bot` to your profile description. The bot will not mention you with your Mastodon-handle, but it will still post your OSM-username, your pictures and a report of your contributions

### On your OSM-user profile:

- Add `#no-bot` or `#no-mapcomplete-bot` to your user profile and your contributions (map changes and pictures) will not be included in the bot at all
- Add `#nobotmention` or `#nomapcompletebotmention` to your user profile. Your contributions and pictures will still be listed in the bot, with your OSM-username. However, your OSM-username will _not_ be replaced by your Mastodon-handle, thus _not_ pinging you.
