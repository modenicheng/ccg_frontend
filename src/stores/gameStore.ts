import { create } from "zustand";
import { WS } from "../wsClient";
import type { GameState, RoomState } from "../types/store";

export const gameStore = create<GameState>((set, get) => ({
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
  roomState: undefined,
  isHost: false,

  // Action to set the WebSocket instance
  setWS: (ws: WS) => {
    set({ ws });
  },

  // Action to set room state
  setRoomState: (roomState: RoomState) => {
    set({ roomState });
  },

  // Action to set host status
  setIsHost: (isHost: boolean) => {
    set({ isHost });
  },

  // Action to refresh room state
  refreshRoomState: async () => {
    const { roomState } = get();
    if (!roomState) return;

    try {
      const response = await fetch(`http://localhost:8000/api/room/${roomState.roomId}`);
      if (response.ok) {
        const data = await response.json();
        set({ roomState: data });
      }
    } catch (error) {
      console.error('Failed to refresh room state:', error);
    }
  },
}));

export const useGameStore = gameStore;
