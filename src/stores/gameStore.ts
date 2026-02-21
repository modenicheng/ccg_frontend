import { create } from "zustand";
import { WS } from "../wsClient";
import type { GameState } from "../types/store";

export const useGameStore = create<GameState>((set) => ({
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
  user: {
    id: 0,
    username: "",
    suffix: "",
    token: "",
    isOwner: false,
  },

  // Action to set the WebSocket instance
  setWS: (ws: WS) => {
    set({ ws });
  },
}));
