import { create } from "zustand";
import { WS } from "../wsClient";
import { AudioManager } from "../audioPlayer";

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
  audioMeta?: audioMeta;
  nextAudioMeta?: audioMeta; // For preloading the audio
  ws?: WS;
  audioManager?: AudioManager;

  setWS: (ws: WS) => void;
  setAudioManager: (audioManager: AudioManager) => void;
}

export const useGameStore = create<gameState>((set, get) => ({
  audio: {
    volume: 1.0,
    isPlaying: false,
  },
  audioMeta: {
    albumId: 0,
    albumName: "",
    artistId: 0,
    artistName: "",
    duration: 0,
    title: "",
    tags: [],
    coverUrl: "",
    audioUrl: "",
  },
  nextAudioMeta: undefined,
  ws: undefined,
  audioManager: undefined,

  // Action to set the WebSocket instance
  setWS: (ws: WS) => {
    set({ ws });
  },
  setAudioManager: (audioManager: AudioManager) => {
    set({ audioManager });
  },
}));
