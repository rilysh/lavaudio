import { Client } from "eris";
import { Manager } from "../dist/index.js";

const nodes = [
    {
        id: "Node 1",
        host: "localhost",
        port: 1337,
        auth: "test",
        secure: false,
    },
];

const client = new Client("TOKEN", {
    intents: ["guilds", "guildMessages", "guildVoiceStates"]
});

client.manager = new Manager(client, nodes, {
    transfer: (data) => {
        const guild = client.guilds.get(data.d.guild_id);
        if (guild) guild.shard.sendWS(data.op, data.d);
    },
});

client.manager.on("nodeConnect", (node) => {
    console.log(`${node.tag || node.host} has been connected.`);
});

client.manager.on("trackStart", (player, track) => {
    player.textChannel.createMessage(`Now playing \`${track.title}\``);
});

client.manager.on("trackEnd", (player, track) => {
    player.textChannel.createMessage("Track ended");
});

client.manager.on("queueEnd", (player) => {
    player.textChannel.createMessage("Queue ended");
});

client.on("ready", () => {
    client.manager.start(client.user.id);
    console.log(`${client.user.username} has been online!`);
});

client.on("rawWS", (packet) => {
    client.manager.packetUpdate(packet);
});

client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    const prefix = "?";
    const args = message.content.slice(prefix.length).trim().split(/ +/g);
    const cmd = args.shift().toLowerCase();

    switch (cmd) {
        case "play": {
            if (!message.member.voiceState.channelID) return message.channel.createMessage({ content: "You are not on a voice channel" });

            const player = await client.manager.create({
                guild: message.guildID,
                voiceChannel: message.member.voiceState.channelID,
                textChannel: message.channel,
                selfDeaf: true,
                selfMute: false,
            });

            const resolve = await client.manager.resolveTrack(args.join(" "));
            switch (resolve.loadType) {
                case "NO_RESULTS":
                    message.channel.createMessage({ content: "There are no results found." });
                break;

                case "TRACK_LOADED":
                    player.queue.push(resolve.tracks[0]);
                    message.channel.createMessage({ content: `Added: \`${resolve.tracks[0].title}\`` });
                    if (!player.playing && !player.paused) return player.play();
                break;

                case "PLAYLIST_LOADED":
                    resolve.tracks.forEach((track) => player.queue.push(track));
                    message.channel.createMessage({ content: `Added: \`${resolve.tracks.length}\`` });
                    if (!player.playing && !player.paused) return player.play();
                break;

                case "SEARCH_RESULT":
                    player.queue.push(resolve.tracks[0]);
                    message.channel.createMessage({ content: `Added: ${resolve.tracks[0].title}` });
                    if (!player.playing) return player.play();
                break;

                default:
                    break;
            }
            break;
        }

        case "stop": {
            const player = client.manager.get(message.guildID);
            player.destroy();
            break;
        }

        case "pause": {
            const player = client.manager.get(message.guildID);
            if (!player.paused) {
                player.pause(true);
                break;
            }
            player.pause(false);
            break;
        }

        case "skip": {
            const player = client.manager.get(message.guildID);
            player.stop();
            break;
        }

        case "seek": {
            if (!args[0] || Number.isNaN(args[0])) {
                return message.channel.createMessage({ content: "Baka, provide seek time!" });
            }
            const player = client.manager.get(message.guildID);
            if (!player.playing) {
                return message.channel.createMessage({ content: "I'm not playing anything..." });
            }
            player.seek(args[0]);
            break;
        }

        case "volume": {
            if (!args[0] || Number.isNaN(args[0])) {
                return message.channel.createMessage({ content: "Hey, send me some limit of the volume" });
            }
            const player = client.manager.get(message.guildID);
            player.setVolume(args[0]);
            break;
        }

        case "timescale": {
            const player = client.manager.get(message.guildID);
            player.setTimeScale(1.3, 1.3);
            break;
        }

        default: {
            message.channel.createMessage({ content: "Unknown command" });
            break;
        }
    }
});

client.connect();
