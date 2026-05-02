import { http } from "./http";
import { mapSong } from "./song";
import type { Song } from "./song";
import { getRoomAuthQueryParams } from "../utils/roomAuth";

import type { BackendSong } from "./song";

export interface RoomSong {
  room_id: string;
  song_id: number;
  song_order?: number | null;
  song: Song;
}

export interface RoomSongsListResponse {
  room_id: string;
  list: RoomSong[];
  total: number;
}

interface BackendRoomSong {
  room_id: string;
  song_id: number;
  song_order?: number | null;
  song: BackendSong;
}

interface BackendRoomSongsListResponse {
  room_id: string;
  list: BackendRoomSong[];
  total: number;
}

const mapRoomSong = (roomSong: BackendRoomSong): RoomSong => ({
  room_id: roomSong.room_id,
  song_id: roomSong.song_id,
  song_order: roomSong.song_order,
  song: mapSong(roomSong.song),
});

export interface RoomSongsListParams {
  offset?: number;
  limit?: number;
  kw?: string;
}

export async function getRoomSongs(
  roomId: string,
  params: RoomSongsListParams = {},
): Promise<RoomSongsListResponse> {
  const { offset = 0, limit = 20, kw } = params;
  const authQuery = getRoomAuthQueryParams(roomId);
  const { data } = await http.get<BackendRoomSongsListResponse>(
    `/api/rooms/${encodeURIComponent(roomId)}/songs/`,
    {
      params: { offset, limit, kw, ...(authQuery ?? {}) },
    },
  );
  const songs = data.list || [];
  const validSongs = songs.filter((rs) => rs.song != null);
  return {
    room_id: data.room_id,
    list: validSongs.map(mapRoomSong),
    total: data.total || 0,
  };
}

export interface AddRoomSongsRequest {
  song_ids: number[];
  append_to_end?: boolean;
}

export async function addSongsToRoom(
  roomId: string,
  payload: AddRoomSongsRequest,
): Promise<RoomSongsListResponse> {
  const authQuery = getRoomAuthQueryParams(roomId);
  const { data } = await http.post<BackendRoomSongsListResponse>(
    `/api/rooms/${encodeURIComponent(roomId)}/songs/`,
    payload,
    {
      params: authQuery ?? undefined,
    },
  );
  return {
    room_id: data.room_id,
    list: data.list.map(mapRoomSong),
    total: data.total,
  };
}

export interface RemoveRoomSongsRequest {
  song_ids: number[];
}

export async function removeSongsFromRoom(
  roomId: string,
  payload: RemoveRoomSongsRequest,
): Promise<RoomSongsListResponse> {
  const authQuery = getRoomAuthQueryParams(roomId);
  const { data } = await http.delete<BackendRoomSongsListResponse>(
    `/api/rooms/${encodeURIComponent(roomId)}/songs/`,
    {
      data: payload,
      params: authQuery ?? undefined,
    },
  );
  return {
    room_id: data.room_id,
    list: data.list.map(mapRoomSong),
    total: data.total,
  };
}

export interface UpdateRoomSongOrderRequest {
  song_id: number;
  new_order?: number | null;
}

export async function updateRoomSongOrder(
  roomId: string,
  payload: UpdateRoomSongOrderRequest,
): Promise<RoomSongsListResponse> {
  const authQuery = getRoomAuthQueryParams(roomId);
  const { data } = await http.put<BackendRoomSongsListResponse>(
    `/api/rooms/${encodeURIComponent(roomId)}/songs/order`,
    payload,
    {
      params: authQuery ?? undefined,
    },
  );
  return {
    room_id: data.room_id,
    list: data.list.map(mapRoomSong),
    total: data.total,
  };
}

export interface BatchUpdateRoomSongOrderRequest {
  orders: UpdateRoomSongOrderRequest[];
}

export async function batchUpdateRoomSongOrder(
  roomId: string,
  payload: BatchUpdateRoomSongOrderRequest,
): Promise<RoomSongsListResponse> {
  const authQuery = getRoomAuthQueryParams(roomId);
  const { data } = await http.put<BackendRoomSongsListResponse>(
    `/api/rooms/${encodeURIComponent(roomId)}/songs/order/batch`,
    payload,
    {
      params: authQuery ?? undefined,
    },
  );
  return {
    room_id: data.room_id,
    list: data.list.map(mapRoomSong),
    total: data.total,
  };
}

export async function clearRoomSongs(roomId: string): Promise<RoomSongsListResponse> {
  const authQuery = getRoomAuthQueryParams(roomId);
  const { data } = await http.delete<BackendRoomSongsListResponse>(
    `/api/rooms/${encodeURIComponent(roomId)}/songs/all`,
    {
      params: authQuery ?? undefined,
    },
  );
  return {
    room_id: data.room_id,
    list: data.list.map(mapRoomSong),
    total: data.total,
  };
}

export async function shuffleRoomSongs(roomId: string): Promise<RoomSongsListResponse> {
  const authQuery = getRoomAuthQueryParams(roomId);
  const { data } = await http.post<BackendRoomSongsListResponse>(
    `/api/rooms/${encodeURIComponent(roomId)}/songs/shuffle`,
    undefined,
    {
      params: authQuery ?? undefined,
    },
  );
  return {
    room_id: data.room_id,
    list: data.list.map(mapRoomSong),
    total: data.total,
  };
}

export async function getRoomSongDetail(
  roomId: string,
  songId: number,
): Promise<RoomSong> {
  const authQuery = getRoomAuthQueryParams(roomId);
  const { data } = await http.get<BackendRoomSong>(
    `/api/rooms/${encodeURIComponent(roomId)}/songs/${songId}`,
    {
      params: authQuery ?? undefined,
    },
  );
  return mapRoomSong(data);
}