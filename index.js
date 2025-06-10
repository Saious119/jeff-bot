const crypto = require("node:crypto");
const dayjs = require("dayjs");
const LocalizedFormat = require("dayjs/plugin/localizedFormat");
dayjs.extend(LocalizedFormat);
const utc = require("dayjs/plugin/utc");
dayjs.extend(utc);
const { CronJob } = require("cron");
const {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType,
} = require("discord.js");
const {
  Client,
  GatewayIntentBits,
  ApplicationCommandOptionType,
} = require("discord.js");
const fs = require("fs");

let series = require("./data/series.json");
const { on } = require("node:events");

require("dotenv").config();

const pubKey = process.env.MARVEL_PUB_KEY;
const privKey = process.env.MARVEL_PRIV_KEY;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

const guildId = process.env.GUILD_ID;
if (guildId === undefined) {
  console.error("Guild ID environment variable (GUILD_ID) not provided");
  process.exit(1);
}

let jobs = [];

async function scheduleCronJob() {
  for (let job of jobs) {
    job.stop();
  }
  jobs = [];

  let job = new CronJob(
    "0 7 * * *",
    async function () {
      const guild = client.guilds.cache.get(guildId);

      const channelId = process.env.CHANNEL_ID;
      const channel = await guild.channels.fetch(channelId);

      const comics = await getComics();

      for (let comic of comics) {
        const onSaleDate = dayjs.utc(
          comic.dates.find((date) => date.type === "onsaleDate").date
        );
        const embed = createEmbedFromComic(comic, true);
        if (onSaleDate.format("LL") == dayjs().format("LL")) {
          console.log(onSaleDate.format("LL"));
          console.log(dayjs().format("LL"));
          await channel.send({
            content: `# ${comic.title} is out today`,
            embeds: [embed],
          });
        }
      }
    },
    null,
    true,
    "America/New_York",
    { client }
  );

  jobs.push(job);
}

client.on("ready", async () => {
  console.log("Jeffbot is running");

  await scheduleCronJob();

  const guild = client.guilds.cache.get(guildId);

  if (guild) {
    const commands = guild.commands;

    await commands.create({
      name: "comics_this_week",
      description: "Prints out any comics that have new issues out this week",
    });
    await commands.create({
      name: "print_series",
      description: "Prints out any comics that we are tracking",
    });
    await commands.create({
      name: "add_series",
      description: "Adds a new series to check for updates",
      options: [
        {
          name: "series_id",
          description: "The ID of the series to add",
          type: ApplicationCommandOptionType.String,
          required: true,
        },
      ],
    });
    await commands.create({
      name: "remove_series",
      description: "Removes a series from the list",
      options: [
        {
          name: "series_id",
          description: "The ID of the series to remove",
          type: ApplicationCommandOptionType.String,
          required: true,
        },
      ],
    });
  }
});

function generateActionRow(backDisabled, forwardDisabled, pageNum, numComics) {
  const back = new ButtonBuilder()
    .setCustomId("back")
    .setLabel("◀")
    .setStyle(ButtonStyle.Primary)
    .setDisabled(backDisabled);
  const paginator = new ButtonBuilder()
    .setCustomId("paginator")
    .setLabel(`Comic ${pageNum} of ${numComics}`)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);
  const forward = new ButtonBuilder()
    .setCustomId("forward")
    .setLabel("▶")
    .setStyle(ButtonStyle.Primary)
    .setDisabled(forwardDisabled);
  const row = new ActionRowBuilder().addComponents(back, paginator, forward);

  return row;
}

client.on("interactionCreate", async (interaction) => {
  if (interaction.commandName == "comics_this_week") {
    await interaction.deferReply();
    const comics = await getComics();

    let msg = [];

    if (comics.length == 0) {
      msg.push(`No comics are coming out this week.`);
      await interaction.editReply({ content: msg.join("\n") });
    } else {
      let i = 0;
      const row = generateActionRow(true, false, 1, comics.length);

      const response = await interaction.editReply({
        embeds: [createEmbedFromComic(comics[i], false)],
        components: [row],
        withResponse: true,
      });

      const collector = await response.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 120000,
      });

      collector.on("collect", async (c) => {
        if (c.customId === "back") {
          i--;
          await c.update({
            embeds: [createEmbedFromComic(comics[i], false)],
            components: [
              generateActionRow(i == 0, false, i + 1, comics.length),
            ],
          });
        } else if (c.customId === "forward") {
          i++;
          await c.update({
            embeds: [createEmbedFromComic(comics[i], false)],
            components: [
              generateActionRow(
                false,
                i == comics.length - 1,
                i + 1,
                comics.length
              ),
            ],
          });
        }

        collector.resetTimer();
      });

      collector.on("end", async () => {
        await interaction.editReply({
          embeds: [createEmbedFromComic(comics[i], false)],
          components: [generateActionRow(true, true, i + 1, comics.length)],
        });
      });
    }
  } else if (interaction.commandName == "print_series") {
    const msg = printSeriesList();
    interaction.reply({ content: msg });
  } else if (interaction.commandName == "add_series") {
    await interaction.deferReply();
    const seriesId = interaction.options.getString("series_id");

    let series = await checkSeries(seriesId);

    if (series !== null) {
      addSeries(parseInt(seriesId), series.title);

      await interaction.editReply({
        content: `Added series ${series.title} with id ${seriesId}`,
      });
    } else {
      await interaction.editReply({
        content: `Series ${seriesId} is not a valid series`,
      });
    }
  } else if (interaction.commandName == "remove_series") {
    const seriesId = interaction.options.getString("series_id");

    removeSeries(parseInt(seriesId));

    interaction.reply({
      content: `Removed series with id ${seriesId}`,
    });
  }
});

/**
 * Checks if a series is valid
 * @param {Number} seriesId
 * @returns the series object if valid, null otherwise
 */
async function checkSeries(seriesId) {
  const ts = dayjs().unix().toString();
  const hash = crypto.hash("md5", ts + privKey + pubKey);

  const resp = await fetch(
    `https://gateway.marvel.com/v1/public/series/${seriesId}?ts=${ts}&apikey=${pubKey}&hash=${hash}`
  ).then((resp) => resp.json());

  if (resp.code == 404) {
    return null;
  } else if (resp.code == 200) {
    return resp.data.results[0];
  } else {
    return null;
  }
}

function createEmbedFromComic(comic, isNotification) {
  let embed = new EmbedBuilder()
    .setAuthor({
      name: isNotification ? "New Comic Release" : "Comics Out This Week",
      iconURL: "https://cdn-icons-png.flaticon.com/512/5619/5619623.png",
    })
    .setTitle(comic.title)
    .setURL(comic.urls.find((url) => url.type === "detail").url)
    .addFields({
      name: "Release Date",
      value: `${dayjs(
        comic.dates.find((date) => date.type === "onsaleDate").date
      ).format("LL")}`,
      inline: false,
    });

  let possibleWriter = comic.creators.items.find(
    (item) => item.role === "writer"
  );

  if (possibleWriter != undefined) {
    embed = embed.addFields({
      name: "Writer",
      value: possibleWriter.name,
      inline: true,
    });
  }

  let possiblePenciller = comic.creators.items.find(
    (item) => item.role === "inker"
  );

  if (possiblePenciller != undefined) {
    embed = embed.addFields({
      name: "Penciller",
      value: possiblePenciller.name,
      inline: true,
    });
  }

  let possibleCoverArtist = comic.creators.items.find(
    (item) => item.role === "penciler (cover)"
  );

  if (possibleCoverArtist != undefined) {
    embed = embed.addFields({
      name: "Cover Artist",
      value: possibleCoverArtist.name,
      inline: true,
    });
  }

  embed = embed
    .addFields({
      name: "Description",
      value: `${comic.description}`,
      inline: false,
    })
    .setImage(comic.thumbnail.path + `/portrait_uncanny.jpg`)
    .setColor("#6a97c8")
    .setFooter({
      text: "Update",
    })
    .setTimestamp();

  return embed;
}

/**
 *
 * @param {Number} id - Series ID
 * @param {String} name - Series Name
 * @param {String} dateDescriptor - Time window for comics, can be "lastWeek", "thisWeek", "nextWeek", or "thisMonth""
 * @returns the listing of comics if any, null otherwise
 */
async function getComicsForSeries(id, name, dateDescriptor) {
  const ts = dayjs().unix().toString();
  const hash = crypto.hash("md5", ts + privKey + pubKey);

  const resp = await fetch(
    `https://gateway.marvel.com/v1/public/series/${id}/comics?ts=${ts}&apikey=${pubKey}&hash=${hash}&dateDescriptor=${dateDescriptor}`
  ).then((resp) => resp.json());
  if (resp.data.count > 0) {
    return resp.data.results[0];
  } else {
    console.error("No results this week for series: " + name);
    return null;
  }
}

async function getComics() {
  let comics = [];

  for (let { id, name } of series) {
    const data = await getComicsForSeries(id, name, "thisWeek");

    if (data != null) {
      comics.push(data);
    }
  }

  return comics;
}

function printSeriesList() {
  let msg = [];
  for (let { id, name } of series) {
    msg.push(`Series: ${name} ID: ${id}`);
  }
  return msg.join("\n");
}

function addSeries(id, name) {
  series.push({ id, name });
  fs.writeFileSync("./data/series.json", JSON.stringify(series));
}

function removeSeries(id) {
  series = series.filter((s) => s.id !== id);
  fs.writeFileSync("./data/series.json", JSON.stringify(series));
}

client.login(process.env.JEFFBOT_DISCORD_TOKEN);
