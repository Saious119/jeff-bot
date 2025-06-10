# Jeffbot

A discord bot that uses the [Marvel Comic API](https://developer.marvel.com/) to notify upon upcoming releases of comic books.

## Setup

Create an application in the [Discord Developer Portal](https://discord.com/developers/applications). Add a bot to the server that you wish to run this in. The permissions I gave it are the following:

scopes:

- applications.commands
- bot

permissions:

- Read message history
- Send messages
- Send messages in Threads
- Use Slash Commands
- View Channels

Create a .env file and add the following fields

- `JEFFBOT_DISCORD_TOKEN`: Get a discord bot token from the Discord developer portal
- `MARVEL_PUB_KEY`: Public key from Marvel API dashboard
- `MARVEL_PRIV_KEY`: Private key from Marvel API dashboard
- `GUILD_ID`: ID of discord server you are running this on
- `CHANNEL_ID`: ID of the channel that will post automatic notifications of new releases

Also, create a file at `data/series.json` file that will list the IDs for each series. If you go to a series from this page: [https://www.marvel.com/comics/series](https://www.marvel.com/comics/series), the series ID will be in the URL.

For example:

```json
[
  { "id": 38806, "name": "Ultimate Black Panther (2024)" },
  { "id": 38809, "name": "Ultimate Spider-Man (2024)" },
  { "id": 38865, "name": "Ultimates (2024)" }
]
```

Finally run `npm install`, and `node index.js`

## Features

- at 7:00am et it will post a message in a provided channel using the `CHANNEL_ID` env variable of if there are any new releases on that given day.
- the `/comics_this_week` slash command will post if any of the series you track have releases in the upcoming week
- `/next_issue` will take a series ID and output when the next issue is released
- `/add_series`: will take in a series ID and save the fields to the series.json file
- `/remove_series` does the opposite and removes a series
- `/print_series` will list all of the series being tracked
