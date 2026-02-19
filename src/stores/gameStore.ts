interface audioState {
    volume: number;
    isPlaying: boolean;
}
interface audioMeta {
    albumId: number;
    albumName: string;
    artistId: number;
    artistName: string;
    duration: number;
    title: string;
    tags?: string[];
    coverUrl?: string;
    audioUrl?: string;
}

interface gameState {
    audio: audioState;
    audioMeta: audioMeta;
    nextAudioMeta: audioMeta | null; // For preloading the audio
    
}