import type Track from "../lib/Track";
import type Player from "../lib/Player";

export interface ResponseOptions {
    tracks: Track[];
    loadType: string;
    playlistInfo: string;
}

export interface TrackOptions {
    info: {
      uri: string;
      title: string;
      author: string;
      length: number;
      identifier: string;
      isStream: boolean;
      isSeekable: boolean;
    }
    track: string;
}

export interface VoiceChannelStruct {
    guild: {
        id: string;
    };
    textChannel: string | object;
    voiceChannel?: {
        id: string;
    };
    selfMute?: boolean;
    selfDeaf?: boolean;
}

export interface NodeOptions {
    id?: string;
    host: string;
    port: string;
    auth?: string;
    secure?: boolean;
    reconnAfter?: number;
    resumeKey: string | null;
    resumeTout?: number;
    redirects?: boolean;
}

export interface ManagerOptions {
    transfer?: Function;
    player?: Player;
}

export interface VoiceStateUpdateData {
    user_id: string;
    channel_id: string;
    guild_id: string;
}

export interface StatsTypes {
    id?: string;
    host: string;
    connected: boolean;
    stats: {
        cpu: {
            systemLoad: number;
            cores: number;
        }
    }
}

export interface PlayOptions {
    startTime?: number;
    volume?: number;
    noReplace?: boolean;
    pause?: boolean;
}

export interface LavalinkOptions {
    type: string;
    reason: string;
    code: number;
    guildId: string;
}

export interface RoutePlannerReponse {
    class: string;
    details: {
        ipBlock: {
            type: string;
            size: string;
        },
        failingAddresses: [
            {
                address: string;
                failingTimestamp: number;
                failingTime: string;
            },
        ],
        blockIndex: string;
        currentAddressIndex: string;
    }
}
