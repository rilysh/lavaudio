import { EventEmitter } from "events";
import http, { type IncomingMessage, type RequestOptions } from "http";
import https from "https";
import type {
    ManagerOptions,
    NodeOptions,
    ResponseOptions,
    RoutePlannerReponse,
    StatsTypes,
    VoiceChannelStruct,
    VoiceStateUpdateData,
} from "../types/types";
import Node from "./Node";
import Player from "./Player";
import Response from "./Response";

/**
 * Represents the Manager class
 * @prop {Client} client - Library client that will be used
 * @prop {ListOfNodes} listOfNodes - (Private) an array where all nodes will be cached
 * @prop {Nodes} nodes - Here all lavalink nodes will be arranged
 * @prop {Players} players - All players in all guilds will be stay here
 * @prop {VoiceStates} voiceStates - Regarding each guild, voice state event data will be cached
 * @prop {VoiceServers} voiceServers - Regarding each guild, voice server event data will be cached
 * @prop {User} user - Application client id
 * @prop {Transfer} transfer - Function where you need to provide each shard to send audio buffer
 * @prop {Player} player - Player class
 */
export default class Manager extends EventEmitter {
    public readonly client: unknown;

    private listOfNodes: Array<string>;

    public nodes: Map<string, NodeOptions>;

    public players: Map<string, Player>;

    public voiceStates: Map<string, unknown>;

    public voiceServers: Map<string, unknown>;

    public user?: string;

    public transfer: Function;

    public player?: Player;

    constructor(client: unknown, nodes: string[], options: ManagerOptions = {
        transfer: undefined,
    }) {
        super();
        if (!client) {
            throw new Error("Parameter Client is missing or an error occurred");
        }
        if (!options.transfer) {
            throw new Error("Transfer is a required function inside manager class");
        }
        this.client = client;
        this.listOfNodes = nodes;

        this.nodes = new Map<string, NodeOptions>();
        this.players = new Map<string, Player>();
        this.voiceStates = new Map<string, unknown>();
        this.voiceServers = new Map<string, unknown>();

        this.user = undefined;
        this.transfer = options.transfer;
    }

    /**
     * Set the node(s) to a map
     * @param options - See NodeOptions typings
     * @returns {Node}
     */
    public buildNode(options: NodeOptions): Node {
        const node = new Node(this, options);
        if (options.id) {
            this.nodes.set(options.id, node);
            node.connect();
            return node;
        }
        this.nodes.set(options.host, node);
        node.connect();
        return node;
    }

    /**
     * Create audio instance
     * @param data - See VoiceChannelStruct typings
     * @returns {Player | NodeOptions}
     */
    public create(data: VoiceChannelStruct = {
        guild: {
            id: "",
        },
        textChannel: "",
    }): Player | NodeOptions {
        const player = this.players.get(data.guild?.id ?? data.guild);
        if (player) return player;
        this.transfer({
            op: 4,
            d: {
              guild_id: data.guild?.id ?? data.guild,
              channel_id: data.voiceChannel?.id ?? data.voiceChannel,
              self_mute: data.selfMute ?? false,
              self_deaf: data.selfDeaf ?? false,
          },
      });
      return this.spawnPlayer(data);
    }

    /**
     * Identify the bot by it's unique client id, all data will be passed
     * regarding the id
     * @param botID - String value
     */
    public start(botID?: string): void {
        if (!botID) {
            throw new Error("BotID is missing, provide it to start function");
        }
        if (typeof botID !== "string") {
            throw new TypeError("BotID must be a string");
        }
        this.user = botID;
        this.listOfNodes?.forEach((node) => this.buildNode(node as unknown as NodeOptions));
    }

    /**
     * Function to update voice server (Discord's side)
     * @param data - Object, inside there's `guild_id` which will be a string
     * @returns {boolean}
     */
    public voiceServersUpdate(data: { guild_id: string }): boolean {
        this.voiceServers.set(data.guild_id, data);
        return this.connectionProcess(data.guild_id);
    }

    /**
     * Function to update voice state (Discord's side)
     * @param data - See VoiceStateUpdateData typings
     * @returns {boolean | void}
     */
    public voiceStateUpdate(data: VoiceStateUpdateData): boolean | void {
        if (data.user_id !== this.user) return;
        if (data.channel_id) {
            this.voiceStates.set(data.guild_id, data);
            // eslint-disable-next-line consistent-return
            return this.connectionProcess(data.guild_id);
        }
        this.voiceServers.delete(data.guild_id);
        this.voiceStates.delete(data.guild_id);
    }

    /**
     * Function to manage voice states
     * @param packet - Object, inside packet there's `t` which is a string
     * and `d` which typing is VoiceStateUpdateData
     * @return {void}
     */
    public packetUpdate(packet: { t: string, d: VoiceStateUpdateData }): void {
        if (packet.t === "VOICE_SERVER_UPDATE") {
            this.voiceServersUpdate(packet.d);
        }
        if (packet.t === "VOICE_STATE_UPDATE") {
            this.voiceStateUpdate(packet.d);
        }
    }

    /**
     * Create connection with player
     * @param guildId - String value
     * @returns {boolean}
     */
    public connectionProcess(guildId: string): boolean {
        const server = this.voiceServers.get(guildId);
        const state = this.voiceStates.get(guildId) as { session_id: string };
        if (!server) return false;
        const player = this.players.get(guildId) as Player;
        if (!player) return false;

        player.connect({
            sessionId: state ? state.session_id : player.voiceUpdateState!.sessionId,
            event: server,
        });
        return true;
    }

    /**
     * Sort least used nodes
     * @returns {NodeOptions[]}
     */
    public get leastUsedNodes(): NodeOptions[] {
        return [...this.nodes.values()]
        .filter((node) => (node as Node as { connected: boolean }).connected)
        .sort((a, b) => {
            const aLoad: number = (a as unknown as StatsTypes).stats.cpu ? ((a as unknown as StatsTypes).stats.cpu.systemLoad / (a as unknown as StatsTypes).stats.cpu.cores) * 100 : 0;
            const bLoad: number = (b as unknown as StatsTypes).stats.cpu ? ((b as unknown as StatsTypes).stats.cpu.systemLoad / (b as unknown as StatsTypes).stats.cpu.cores) * 100 : 0;
            return aLoad - bLoad;
        });
    }

    /**
     * After all of these, now spawn the player
     * @param data - See VoiceChannelStruct typings
     * @returns {NodeOptions | Player}
     */
    public spawnPlayer(data: VoiceChannelStruct): NodeOptions | Player {
        const guild = data.guild?.id ?? data.guild;
        const spawnedNodes = this.nodes.get(guild as string);
        if (spawnedNodes) return spawnedNodes;
        if (this.leastUsedNodes.length === 0) {
            throw new Error("No nodes are connected");
        }
        const node = this.nodes.get(this.leastUsedNodes[0].id
            || this.leastUsedNodes[0].host);
        if (!node) throw new Error("No nodes are connected");

        const player = new Player(node as Node, data, this);
        this.players.set(guild, player);

        return player;
    }

    /**
     * Resolve track from lavalink, like query
     * @param track - String value
     * @param source - String value
     * @returns {Promise<Response>}
     */
    public async resolveTrack(track: string, source: string): Promise<Response> {
        const node = this.leastUsedNodes[0];
        if (!node) {
            throw new Error("No nodes are connected");
        }
        const regex = /https?:\/\//;
        if (!regex.test(track)) {
            track = `${source || "yt"}search:${track}`;
        }
        const result = await this.request<ResponseOptions>(node as unknown as NodeOptions, "loadtracks", `identifier=${encodeURIComponent(track)}`);
        /**
         * Fire up on "debug" event
         * @event debug
         */
        this.emit("debug", result);
        if (!result) {
            throw new Error("No results found.");
        }
        return new Response(result);
    }

    /**
     * Decode track from lavalink
     * @param track - String value
     * @returns {Promise<unknown>}
     */
    // Note: The return type is unknown so the value can't be predictable anymore
    public async decodeTrack(track: string): Promise<unknown> {
        const node = this.leastUsedNodes[0];
        if (!node) {
            throw new Error("No nodes are connected");
        }
        const result = await this.request<{ status: number }>(node as unknown as NodeOptions, "decodetrack", `track=${track}`);
        /**
         * Fire up on "debug" event
         * @event debug
         */
        this.emit("debug", result);
        if (result.status === 500) {
            return null;
        }
        return result;
    }

    /**
     * Get the route planner status
     * @returns {Promise<RoutePlannerReponse>}
     */
    public async getRoutePlanner(): Promise<RoutePlannerReponse> {
        const node = this.leastUsedNodes[0];
        if (!node) {
            throw new Error("No nodes are connected");
        }
        const result = await this.request<RoutePlannerReponse>(node, "/routeplanner/status");
        return result;
    }

    /**
     * Unmark a failed address from lavalink
     * @param address - Failing IP or URL
     * @returns {Promise<boolean>}
     */
    public async unmarkFailedAddress(address: string): Promise<boolean> {
       const status = await this.routeFreePost(address, "address");
       return status === 204;
    }

    /**
     * Unmark all failed address from lavalink
     * @param address - Failing IP or URL
     * @returns {Promise<boolean>}
     */
    public async unmarkAllFailedAddress(address: string): Promise<boolean> {
        const status = await this.routeFreePost(address, "all");
       return status === 204;
    }

    /**
     * Request to the lavalink
     * @param node - See NodeOptions typings
     * @param endpoint - String value
     * @param param - String value
     * @returns {Promise<T>}
     */
    public async request<T>(node: NodeOptions, endpoint: string, param?: string): Promise<T> {
        const httpMod = node.secure ? https : http;
        return new Promise((resolve) => {
            httpMod.get(`http${node.secure ? "s" : ""}://${node.host}:${node.port}/${endpoint}${param ? `?${param}` : ""}`, {
                headers: {
                    Authorization: node?.auth ?? "",
                },
            }, (cb: IncomingMessage): void => {
                let data = "";
                cb.on("data", (chunk: string): void => {
                    data += chunk;
                });
                cb.on("end", (): void => resolve(JSON.parse(data)));
                cb.once("error", (e: Error): Error => {
                    throw new Error(`Failed to request to the lavalink.\n\nLogs: ${e}`);
                });
            }).on("error", (e: Error): Error => {
                throw new Error(`Failed to request to the lavalink.\n\nLogs: ${e}`);
            });
        });
    }

    /**
     * Create a post request to the lavalink's route endpoint
     * @param address - Failing IP or URL
     * @param endpoint - All failing IPs or a particular address
     * @returns {Promise<boolean>}
     */
    private async routeFreePost(address: string, endpoint: string): Promise<number> {
        const node = this.leastUsedNodes[0];
        if (!node) {
            throw new Error("No nodes are connected");
        }
        const httpMod = node.secure ? https : http;
        const options = {
            hostname: node.host,
            port: node.port,
            path: `/routeplanner/free/${endpoint}`,
            headers: {
                authorization: node?.auth ?? "",
                "content-type": "application/json",
            },
            body: JSON.stringify({
                address,
            }),
            method: "POST",
        } as RequestOptions;
        return new Promise((resolve) => {
            httpMod.request(options, () => {
                resolve(204);
            });
        });
    }

    /**
     * Get player object regarding specific guild id
     * @param guildId - String value
     * @returns {Player}
     */
    public get(guildId: string): Player {
        return this.players.get(guildId)!;
    }
}
