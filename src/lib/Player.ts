import { EventEmitter } from "events";
import type { LavalinkOptions, PlayOptions, VoiceChannelStruct } from "../types/types";
import type Manager from "./Manager";
import type Node from "./Node";

/**
 * Represents the Player class
 * @prop {Manager} manager - Manager class
 * @prop {Node} node - Node class
 * @prop {GuildId} guildId - GuildID where player will be initalize, however, it can be an object depends on the library
 * @prop {VoiceChannel} voiceChannel - VoiceChannelID where bot will connect, however, it can be an object depends on the library
 * @prop {TextChannel} textChannel - TextChannelID where bot will send messages of events, however, it can be an object depeds on the library
 * @prop {State} state - An object, inside voice and equalizer properties stays
 * @prop {TrackRepeat} trackRepeat - Boolean value, if true track loop will be enabled, by default disabled
 * @prop {QueueRepeat} queueRepeat - Boolean value, if true queue loop will be enabled, by default disabled
 * @prop {Playing} playing - Boolean value, if true represents the player is playing else no
 * @prop {Paused} paused - Boolean value, if true represents the player is paused else playing
 * @prop {Timestamp} timestamp - Begins from when the first track started
 * @prop {Track} track - Represents the track which is currently playing
 * @prop {VoiceUpdateState} voiceUpdateState - Here two properties exist, sessionId, event
 * @prop {Position} position - Tells where the current track, in playing state, simply position
 * @prop {Volume} volume - Tells what is the volume of current player
 * @prop {Queue} queue - An array where all tracks will be stored
 * @prop {Bands} bands - An object where bands data will be saved
 */
export default class Player extends EventEmitter {
    public manager: Manager;

    public node: Node;

    public guild: string | object;

    public voiceChannel?: string | object;

    public textChannel?: string | object;

    public state: {
        volume: number;
        equalizer: number[];
    };

    public trackRepeat: boolean;

    public queueRepeat: boolean;

    public playing: boolean;

    public paused: boolean;

    public timestamp: number;

    public track: {};

    public voiceUpdateState?: {
        sessionId: string,
        event: unknown
    };

    public position: number;

    public volume: number;

    public queue: string[];

    public bands?: number[];

    constructor(node: Node, options: VoiceChannelStruct, manager: Manager) {
        super();

        this.manager = manager;
        this.node = node;
        this.guild = options.guild?.id ?? options.guild;
        this.voiceChannel = options.voiceChannel?.id ?? options.voiceChannel;
        this.textChannel = options?.textChannel ?? null;
        this.state = {
            volume: 100,
            equalizer: [],
        };
        this.trackRepeat = false;
        this.queueRepeat = false;
        this.playing = false;
        this.paused = false;
        this.timestamp = 0;
        this.track = {};
        this.voiceUpdateState = undefined;
        this.position = 0;
        this.volume = 100;
        this.queue = [];

        this.on("event", (data): void => this.lavalinkEvent(data));
        this.on("playerUpdate", (packet): void => {
            this.state = {
                volume: this.state.volume,
                equalizer: this.state.equalizer,
                ...packet.state,
            };
        });
    }

    /**
     * Play the provided track
     * @param options - See PlayOptions typings
     * @returns {this | null}
     */
    public play(options: PlayOptions = {}): this | null {
        const sound = this.queue[0];
        if (!sound) {
            return null;
        }
        this.playing = true;
        this.track = sound;
        this.timestamp = Date.now();
        this.node.send({
            op: "play",
            guildId: this.guild,
            track: (sound as unknown as { track: string }).track,
            startTime: options?.startTime ?? 0,
            volume: options?.volume ?? 100,
            noReplace: options?.noReplace ?? false,
            pause: options?.pause ?? false,
        });
        return this;
    }

    /**
     * Stop the current playback
     * @param amount - Amount of tracks to skip and stop
     * @returns {this}
     */
    public stop(amount?: number): this {
        if (typeof amount === "number" && amount > 1) {
            if (amount > this.queue.length) {
                throw new RangeError("Cannot skip more than the queue size");
            }
            if (amount < 1) {
                throw new RangeError("Cannot skip less than queue size");
            }
            this.queue.splice(0, amount - 1);
        }
        this.node.send({
            op: "stop",
            guildId: this.guild,
        });
        return this;
    }

    /**
     * Pause/Resume the current playback
     * @param state - Boolean value, if true pause the player, false to resume
     * @returns {this}
     */
    public pause(state: boolean): this {
        if (typeof state !== "boolean") {
            throw new RangeError("Pause function must be pass with boolean value");
        }
        if (!this.queue.length) {
            return this;
        }
        this.playing = !state;
        this.paused = state;
        this.node.send({
            op: "pause",
            guildId: this.guild,
            pause: state,
        });
        return this;
    }

    /**
     * Seek the playback to a specific time
     * @param position - Value to where player will be seeked, in milliseconds
     * @returns {this}
     */
    public seek(position: number): this {
        if (Number.isNaN(position)) {
            throw new RangeError("Position must be a number");
        }
        this.position = position;
        this.node.send({
            op: "seek",
            guildId: this.guild,
            position,
        });
        return this;
    }

    /**
     * Set a volume level to the player
     * @param level - Volume level, by default 100
     * @returns {this}
     */
    public setVolume(level: number): this {
        if (Number.isNaN(level)) {
            throw new RangeError("Volume level must be a number");
        }
        this.volume = level;
        this.node.send({
            op: "volume",
            guildId: this.guild,
            volume: this.volume,
        });
        return this;
    }

    /**
     * Enable/Disable track repeat mode
     * @param mode - True to enable, false to disable
     * @returns {this}
     */
    public setTrackRepeat(mode: boolean): this {
        this.trackRepeat = !!mode;
        return this;
    }

    /**
     * Enable/Disable queue repeat mode
     * @param mode - True to enable, false to disable
     * @returns {this}
     */
    public setQueueRepeat(mode: boolean): this {
        this.queueRepeat = !!mode;
        return this;
    }

    /**
     * Remove all repeat modes
     * @returns {this}
     */
    public removeRepeat(): this {
        this.trackRepeat = false;
        this.queueRepeat = false;
        return this;
    }

    /**
     * Manually set a text channel where messages will be send
     * @param channel - Text channel ID
     * @returns {this}
     */
    public setTextChannel(channel: string): this {
        if (typeof channel !== "string") {
            throw new RangeError("Channel must be a string");
        }
        this.textChannel = channel;
        return this;
    }

    /**
     * Manually set a voice channel (not recommended to use)
     * @param channel - Voice channel ID, will be mark as active
     * @returns {this}
     */
    public setVoiceChannel(channel: string): this {
        if (typeof channel !== "string") {
            throw new RangeError("Channel must be a string");
        }
        this.voiceChannel = channel;
        return this;
    }

    /**
     * Set eualizer and send them to the lavalink node
     * @param bands - An object with band and gain property
     * @returns {this}
     */
    public setEQ(...bands: { band: number, gain: number }[]): this {
        if (!this.playing) {
            throw new Error("Nothing is playing");
        }
        if (bands[0] instanceof Array) {
            bands = bands[0];
        }
        if (!bands.length || !bands.every((band) => JSON.stringify(Object.keys(band).sort()) === "[\"band\",\"gain\"]")) throw new TypeError("Bands must be in an object, with band and gain property.");
        for (const { band, gain } of bands) {
            this.bands![band] = gain;
        }
        this.node.send({
            op: "equalizer",
            guildId: this.guild,
            bands: this.bands?.map((gain, band) => ({ band, gain })),
        });
        return this;
    }

    /**
     * Clear the eqalizer filter
     * @returns {this}
     */
    public clearEQ(): this {
        if (!this.playing) {
            throw new Error("Nothing is playing");
        }
        this.bands = new Array(16).fill(0.0);
        this.node.send({
            op: "equalizer",
            guildId: this.guild,
            bands: this.bands.map((gain, band) => ({ band, gain })),
        });
        return this;
    }

    /**
     * Set karaoke filter and send it to the lavalink node
     * @param level - Filter level
     * @param monoLevel - Monolevel
     * @param filterBand - Filter band
     * @param filterWidth - Width
     * @returns {this}
     */
    public setKaraoke(
        level?: number,
        monoLevel?: number,
        filterBand?: number,
        filterWidth?: number,
    ): this {
        if (!this.playing) {
            throw new Error("Nothing is playing");
        }
        this.node.send({
            op: "filters",
            guildId: this.guild,
            karaoke: {
                level: level || 1.0,
                monoLevel: monoLevel || 1.0,
                filterBand: filterBand || 220.0,
                filterWidth: filterWidth || 100.0,
            },
        });
        return this;
    }

    /**
     * Set timescale filter and send it to the lavalink node
     * @param speed - Audio speed
     * @param pitch - Audio pitch
     * @param rate - In how much rate it will be done (not total)
     * @returns {this}
     */
    public setTimeScale(speed: number, pitch: number, rate: number): this {
        if (!this.playing) {
            throw new Error("Nothing is playing");
        }
        this.node.send({
            op: "filters",
            guildId: this.guild,
            timescale: {
                speed: speed || 1.0,
                pitch: pitch || 1.0,
                rate: rate || 1.0,
            },
        });
        return this;
    }

    /**
     * Set tremolo filter and send it to the lavalink node
     * @param freq - Audio frequency level
     * @param depth - Audio depth (in voice)
     * @returns {this}
     */
    public setTremolo(freq?: number, depth?: number): this {
        if (!this.playing) {
            throw new Error("Nothing is playing");
        }
        this.node.send({
            op: "filters",
            guildId: this.guild,
            tremolo: {
                frequency: freq || 2.0,
                depth: depth || 0.5,
            },
        });
        return this;
    }

    /**
     * Set vibrato filter and send it to the lavalink node
     * @param freq - Audio frequency level
     * @param depth - Audio depnth (in voice)
     * @returns {this}
     */
    public setVibrato(freq?: number, depth?: number): this {
        if (!this.playing) {
            throw new Error("Nothing is playing");
        }
        this.node.send({
            op: "filters",
            guildId: this.guild,
            vibrato: {
                frequency: freq || 2.0,
                depth: depth || 0.5,
            },
        });
        return this;
    }

    /**
     * Set rotation filter and send it to the lavalink node
     * @param rotation - Rotation speed
     * @returns {this}
     */
    public setRotation(rotation: number): this {
        if (!this.playing) {
            throw new Error("Nothing is playing");
        }
        this.node.send({
            op: "filters",
            guildId: this.guild,
            rotation: {
                rotationHz: rotation || 0,
            },
        });
        return this;
    }

    /**
     * Set rotation filter and send it to the lavalink node
     * @param sinOffset - Sine offset value
     * @param sinScale - Sine scale
     * @param cosOffset - Cosine offset value
     * @param cosScale - Consine scale
     * @param tanOffset - Tangent offset value
     * @param tanScale - Tangent scale
     * @param offset - Audio offset
     * @param scale - Audio scale
     * @returns {this}
     */
    public setDistortion(
        sinOffset?: number,
        sinScale?: number,
        cosOffset?: number,
        cosScale?: number,
        tanOffset?: number,
        tanScale?: number,
        offset?: number,
        scale?: number,
    ): this {
        if (!this.playing) {
            throw new Error("Nothing is playing");
        }
        this.node.send({
            op: "filters",
            guildId: this.guild,
            distortion: {
                sinOffset: sinOffset || 0,
                sinScale: sinScale || 1,
                cosOffset: cosOffset || 0,
                cosScale: cosScale || 1,
                tanOffset: tanOffset || 0,
                tanScale: tanScale || 1,
                offset: offset || 0,
                scale: scale || 1,
            },
        });
        return this;
    }

    /**
     * Set channel mix filter and send it to the lavalink node
     * @param leftToLeft - First chunk left and second one left too
     * @param leftToRight - First chunk left and second one right
     * @param rightToRight - First chunk right and second one right too
     * @param rightToLeft First chunk right and second one left
     * @returns {this}
     */
    public setChannelMix(
        leftToLeft?: number,
        leftToRight?: number,
        rightToRight?: number,
        rightToLeft?: number,
    ): this {
        if (!this.playing) {
            throw new Error("Nothing is playing");
        }
        this.node.send({
            op: "filters",
            guildId: this.guild,
            channelMix: {
                leftToLeft: leftToLeft || 1.0,
                leftToRight: leftToRight || 0.0,
                rightToLeft: rightToLeft || 0.0,
                rightToRight: rightToRight || 1.0,
            },
        });
        return this;
    }

    /**
     * Set lowpass filter and send it to the lavalink node
     * @param smooth - How smooth the audio will be
     * @returns {this}
     */
    public setLowPass(smooth: number): this {
        if (!this.playing) {
            throw new Error("Nothing is playing");
        }
        this.node.send({
            op: "filters",
            guildId: this.guild,
            lowPass: {
                smoothing: smooth || 20.0,
            },
        });
        return this;
    }

    /**
     * Clean all applied filters
     * @returns {this}
     */
    public cleanFilters(): this {
        if (!this.playing) {
            throw new Error("Nothing is playing");
        }
        this.node.send({
            op: "filters",
            guildId: this.guild,
        });
        return this;
    }

    /**
     * Connect to the voice channel
     * @param data - An object where sessionId is a string and event is unknown (types)
     * @returns {this}
     */
    public connect(data: { sessionId: string, event: unknown }): this {
        this.voiceUpdateState = data;
        this.node.send({
            op: "voiceUpdate",
            guildId: this.guild,
            ...data,
        });
        return this;
    }

    /**
     * Disconnect from the voice channel
     * @returns {this | null}
     */
    public disconnect(): this | null {
        if (!this.voiceChannel) {
            return null;
        }
        if (this.paused) {
            this.pause(false);
        }
        this.manager.transfer({
            op: 4,
            d: {
                guild_id: this.guild,
                channel_id: null,
                self_mute: false,
                self_deaf: false,
            },
        });
        this.voiceChannel = undefined;
        return this;
    }

    /**
     * Destroy any connection from lavalink
     */
    public destroy(): void {
        this.disconnect();
        this.node.send({
            op: "destroy",
            guildId: this.guild,
        });
        /**
         * Fire up when player has been destroyed
         * @event playerDestroy
         */
        this.manager.emit("playerDestroy", this);
        this.manager.players.delete(this.guild as string);
    }

    /**
     * Lavalink events
     * @param data - See LavalinkOptions typings
     */
    public lavalinkEvent(data: LavalinkOptions): void {
        switch (data.type) {
            case "TrackStartEvent":
                /**
                 * Fire up when player will start to play a track
                 * @event trackStart
                 */
                this.manager.emit("trackStart", this, this.track);
                break;

            case "TrackEndEvent":
                if (this.trackRepeat) {
                    this.play();
                    return;
                }
                if (this.queueRepeat
                    && this.queue.length <= 1
                    && data.reason === "FINISHED") {
                        this.play();
                        return;
                }
                if (this.queue.length <= 1 && data.reason === "FINISHED") {
                    /**
                    * Fire up when queue will be empty, no tracks to play
                    * @event queueEnd
                    */
                    this.manager.emit("queueEnd", this, this.track);
                    this.queue = [];
                    this.stop();
                    this.playing = false;
                    this.paused = false;
                    return;
                 }
                 if (this.queue.length >= 2 && data.reason === "STOPPED") {
                     this.queue.shift();
                     this.play();
                     return;
                 }
                 if (this.queue.length <= 1 && data.reason === "STOPPED") {
                     this.queue = [];
                     this.stop();
                     this.playing = false;
                     this.paused = false;
                     return;
                 }
                 if (this.queue.length >= 2) {
                     this.queue.shift();
                     this.play();
                 }
                 /**
                 * Fire up when player will stop
                 * @event trackEnd
                 */
                 this.manager.emit("trackEnd", this, this.track);
                 break;

            case "TrackStuckEvent":
                this.queue.shift();
                /**
                * Fire up when track will stuck to play
                * @event trackStuck
                */
                this.manager.emit("trackStuck", this, this.track, data);
                break;

            case "TrackExceptionEvent":
                this.queue.shift();
                /**
                 * Fire up when track will encounter with an exception
                 * @event trackException
                 */
                 this.manager.emit("trackException", this, this.track, data);
                 break;

            case "WebSocketClosedEvent":
                if ([4015, 4009].includes(data.code)) {
                    this.manager.transfer({
                        op: 4,
                        d: {
                            guild_id: data.guildId,
                            channel_id: (this.voiceChannel as { id?: string })?.id ?? this.voiceChannel,
                            self_mute: false,
                            self_deaf: false,
                        },
                    });
                }
                /**
                 * Fire up when websocket will close
                 * @event socketClosed
                 */
                this.manager.emit("socketClosed", this, data);
                break;

            default:
                throw new Error(`An unknown event was passed, event: ${data.type}`);
        }
    }
}
