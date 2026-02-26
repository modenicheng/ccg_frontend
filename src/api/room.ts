import { http } from "./http.ts";

export interface CreateRoomResponse {
  roomId: string;
  playerId: string;
  token: string;
}

export interface RoomInfoResponse {
  roomId: string;
  hostPlayerId: string;
  status: string;
  title?: string | null;
  description?: string | null;
  players: string[];
  songQueue: string[];
  tagGroups: Record<string, string[]>;
  playProgress: number;
  startPositionPercent?: number;
}

export interface PatchRoomRequest {
  song_queue?: string[];
  title?: string;
  description?: string;
  tag_groups?: Record<string, string[]>;
}

export async function createRoom(): Promise<CreateRoomResponse> {
  const { data } = await http.post<CreateRoomResponse>("/api/room/");
  return data;
}

export async function getRoomInfo(roomId: string): Promise<RoomInfoResponse> {
  const { data } = await http.get<RoomInfoResponse>(
    `/api/room/${encodeURIComponent(roomId)}`,
  );
  return data;
}

export async function patchRoomInfo(
  roomId: string,
  payload: PatchRoomRequest,
): Promise<RoomInfoResponse> {
  const { data } = await http.patch<RoomInfoResponse>(
    `/api/room/${encodeURIComponent(roomId)}`,
    payload,
  );
  return data;
}
