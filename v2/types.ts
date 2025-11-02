
export interface UserData {
    code: string;
    visible: boolean;
    link: string;
    unlockCode: string;
}

export interface PeerStream {
    peerId: string;
    stream: MediaStream;
}
