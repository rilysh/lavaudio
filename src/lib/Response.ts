import type { ResponseOptions, TrackOptions } from "../types/types";
import Track from "./Track";

export default class Response {
  public tracks: Track[];

  public loadType: string;

  public playlistInfo: string;

  constructor(data: ResponseOptions) {
      this.tracks = data.tracks.map((track) => new Track(track as unknown as TrackOptions));
      this.loadType = data.loadType;
      this.playlistInfo = data.playlistInfo;
    }
}
