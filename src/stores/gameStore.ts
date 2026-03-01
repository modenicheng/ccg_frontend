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
  scores: [],

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

  // Action to set scores
  setScores: (scores: import("../types/store").PlayerScore[]) => {
    set({ scores });
  },

  // Action to refresh room state
  refreshRoomState: async () => {
    const { roomState } = get();
    if (!roomState) return;

    try {
      const data = await getRoomInfo(roomState.roomId);
      // Map RoomInfoResponse (simplified) to RoomState
      const statusCode = data.status === "playing" ? 1 : data.status === "ended" ? 2 : 0;
      const nextRoomState: RoomState = {
        // Keep existing full objects
        ...roomState,
        // Update fields from simplified API
        roomId: data.roomId,
        title: data.title ?? "",
        status: data.status,
        statusCode,
        description: data.description ?? null,
        hostPlayerId: data.hostPlayerId,
        playersSimple: data.players,
        tagGroupsSimple: data.tagGroups,
        playProgress: data.playProgress,
        startPositionPercent: data.startPositionPercent ?? 0,
        songQueue: data.songQueue,
        // song_start_range_percent not provided, keep existing
        // answer_queue not provided, keep existing
        // playback_status not provided, keep existing
        // players and tag_groups keep existing (full objects)
      };

      set({ roomState: nextRoomState });
    } catch (error) {
      console.error('Failed to refresh room state:', error);
    }
  },
}));

export const useGameStore = gameStore;
