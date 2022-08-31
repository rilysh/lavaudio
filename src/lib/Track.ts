import type { TrackOptions } from "../types/types";

export default class Track {
    public uri: string;

    public title: string;

    public author: string;

    public duration: number;

    public identifier: string;

    public isStream: boolean;

    public isSeekable: boolean;

    public track: string;

    public thumbnail: string | null;

    constructor(data: TrackOptions) {
      this.uri = data.info.uri;
      this.title = data.info.title;
      this.author = data.info.author;
      this.duration = data.info.length;
      this.identifier = data.info.identifier;
      this.isStream = data.info.isStream;
      this.isSeekable = data.info.isSeekable;
      this.track = data.track;
      this.thumbnail = `https://i.ytimg.com/vi/${data.info.identifier}/maxresdefault.jpg` || null;
    }
}
