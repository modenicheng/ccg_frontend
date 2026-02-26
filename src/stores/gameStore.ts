import { create } from "zustand";
import { WS } from "../wsClient";
import type { GameState, RoomState } from "../types/store";
import { getRoomInfo } from "../api/room";

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
    token: "",
    isOwner: false,
    roomId: "",
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
      const data = await getRoomInfo(roomState.roomId);
      const nextRoomState: RoomState = {
        ...roomState,
        ...data,
        status: data.status as RoomState["status"],
        startPositionPercent:
          data.startPositionPercent ?? roomState.startPositionPercent,
      };

      set({ roomState: nextRoomState });
    } catch (error) {
      console.error('Failed to refresh room state:', error);
    }
  },
}));

export const useGameStore = gameStore;
