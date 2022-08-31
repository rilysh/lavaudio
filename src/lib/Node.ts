import WebSocket from "ws";
import type { NodeOptions } from "../types/types";
import type Manager from "./Manager";

/**
 * Represents the Node class
 * @prop {ID} id - Node id or name of the node
 * @prop {Host} host - Host URL or IP to access the lavalink
 * @prop {Port} port - Port to connect
 * @prop {Auth} auth - Password of that node connection
 * @prop {Secure} secure - Support SSL to that provided IP? If yes, true else false
 * @prop {ReconnAfter} reconnAfter - Reconnect to the lavalink aftter provided seconds
 * @prop {ResumeKey} resumeKey - Resume the session of your lavalink bt passing the resumekey
 * @prop {ResumeTout} resumeTout - After how long resuming will be cancelled
 * @prop {Redirects} redirects - Support redirecting? If yes, true else false
 * @prop {Stats} stats - Node status object
 * @prop {Connected} connected - Check if player is connected
 * @prop {Reconn} reconn - Provided Node.JS timeout feature
 * @prop {#WS} ws - Private variable for websocket
 * @prop {#PacketQueue} packetQueue - Private packets queue which was came from websocket
 * @prop {Manager} manager - Represents manager class
 * @prop {Penalties} penalties - Counts how mch penalties client goot
 */
export default class Node {
    public id?: string;

    public host: string;

    public port: string;

    public auth: string;

    public secure: boolean;

    public reconnAfter: number;

    public resumeKey: string | null;

    public resumeTout: number;

    public redirects?: boolean;

    public stats: {
        players: number;
        playingPlayers: number;
        uptime: number;
        memory: {
            free: number;
            used: number;
            allocated: number;
            reservable: number;
        };
        cpu: {
            cores: number;
            systemLoad: number;
            lavalinkLoad: number;
        }; frameStats: {
            sent: number;
            nulled: number;
            deficit: number;
        };
    };

    public connected: boolean;

    public reconn?: ReturnType<typeof setTimeout>;

    #ws?: WebSocket;

    #packetQueue: string[];

    public manager: Manager;

    private penalties?: number;

    constructor(manager: Manager, options: NodeOptions = {
        host: "",
        port: "",
        resumeKey: null,
    }) {
        this.manager = manager;
        // TODO: Create a random ID
        this.id = options?.id;
        this.host = options.host;
        this.port = options.port;
        this.auth = options?.auth ?? "";
        this.secure = options?.secure ?? false;
        this.reconnAfter = options?.reconnAfter ?? 5e+3;
        this.resumeKey = options?.resumeKey ?? null;
        this.resumeTout = options?.resumeTout ?? 60;
        this.redirects = options?.redirects ?? false;

        this.stats = {
            players: 0,
            playingPlayers: 0,
            uptime: 0,
            memory: {
                free: 0,
                used: 0,
                allocated: 0,
                reservable: 0,
            },
            cpu: {
                cores: 0,
                systemLoad: 0,
                lavalinkLoad: 0,
            },
            frameStats: {
                sent: 0,
                nulled: 0,
                deficit: 0,
            },
        };
        this.connected = false;
        this.#ws = undefined;
        this.#packetQueue = [];
    }

    /**
     * Calculate penalties to the node
     * calcPenalties(): Taken from https://github.com/rilysh/vulkava-fork/blob/962f00e954b438bfd04dbc9b87b40b9f40b0cdb5/lib/Node.ts#L137 
     */
    private calcPenalties(): void {
        const cpuPenalty = 1.05 ** (100 * this.stats.cpu.systemLoad) * 10 - 10;

        let deficitFramePenalty = 0;
        let nullFramePenalty = 0;

        if (this.stats.frameStats) {
            deficitFramePenalty = 1.03 ** (500 * (this.stats.frameStats.deficit / 3000)) * 600 - 600;
            nullFramePenalty = 1.03 ** (500 * (this.stats.frameStats.nulled / 3000)) * 300 - 300;
            nullFramePenalty *= 2;
        }

        this.penalties = Math.floor(cpuPenalty + deficitFramePenalty + nullFramePenalty + this.stats.playingPlayers);
    }

    /**
     * Connect with lavalink websocket
     */
    public connect(): void {
        if (this.#ws) {
            this.#ws.close();
        }

        const headers = {
            Authorization: this.auth,
            "User-Id": this.manager.user,
            "Client-Name": "lavaudio", // TODO: Add version in format {client}/{version}
        };
        if (this.resumeKey) {
            Object.assign(headers, { "Resume-Key": this.resumeKey });
        }
        this.#ws = new WebSocket(`ws${this.secure ? "s" : ""}:${this.host}:${this.port}/`, {
            headers,
            followRedirects: this.redirects,
        });
        this.#ws.on("open", this.open.bind(this));
        this.#ws.on("error", this.error.bind(this));
        this.#ws.on("message", this.message.bind(this));
        this.#ws.on("close", this.close.bind(this));
    }

    /**
     * (Private) Listen "open" websocket connection
     */
    private open(): void {
        if (this.reconn) {
            clearTimeout(this.reconn);
        }
        if (this.resumeKey) {
            this.send({ op: "configureResuming", key: this.resumeKey, timeout: this.resumeTout });
        }

        /**
         * Fire up when node gets connected
         * @event nodeConnect
         */
        this.manager.emit("nodeConnect", this);
        this.connected = true;
    }

    /**
     * (Private) Listen "message" websocket connection
     * @param payload - Buffer data
     */
    private message(payload: Buffer): void {
        if (Array.isArray(payload)) {
            payload = Buffer.concat(payload);
        } else if (payload instanceof ArrayBuffer) {
            payload = Buffer.from(payload);
        }

        const packet = JSON.parse(payload as unknown as string);
        if (packet.op && packet.op === "stats") {
            this.stats = { ...packet };
            this.calcPenalties();
        }
        const player = this.manager.players.get(packet.guildId);
        if (packet.guildId && player) player.emit(packet.op, packet);

        packet.node = this;
        /**
         * Fire up when raw packets / or sending raw data
         * @event raw
         */
        this.manager.emit("raw", packet);
    }

    /**
     * (Private) Listen "close" websocket connection
     * @param code - A number when websocket will be close
     * @returns {void}
     */
    private close(code: number): void {
        this.manager.emit("nodeClose", code, this);
        if (code !== 1000) {
            this.reconnect();
            return;
        }
    }

    /**
     * (Private) Listen "error" websocket event
     * @param code - A number when websocket will encounter with an error
     * @returns {void}
     */
    private error(code: number): void {
        this.manager.emit("nodeError", code, this);
        this.reconnect();
        return;
    }

    /**
     * Reconnect to the websocket
     */
    public reconnect(): void {
        this.reconn = setTimeout(() => {
            this.connected = false;
            this.#ws?.removeAllListeners();
            this.#ws = undefined;
            this.manager.emit("nodeReconnect", this);
            this.connect();
        }, this.reconnAfter);
    }

    /**
     * Destroy all websocket connection
     * @param reason - A optional reason, can be useful for logging
     */
    public destroy(reason = "destroy"): void {
        this.#ws?.close(1000, reason);
        this.#ws = undefined;
        this.manager.nodes.delete(this.host ?? this.id);
    }

    /**
     * JSON Stringify all packets and push the to the queue
     * @param payload - An object but can be anything
     * @returns {number | void}
     */
    public send(payload: object): number | void {
        const packet = JSON.stringify(payload);
        if (!this.connected) {
            return this.#packetQueue.push(packet);
        }
        return this.sendPacket(packet);
    }

    /**
     * (Private) Send packets to the websocket
     * @param payload - A string but can be anything
     */
    private sendPacket(payload: string): void {
        this.#ws?.send(payload, (e) => {
            if (e) return e;
            return null;
        });
    }
}
