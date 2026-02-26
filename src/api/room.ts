import { http } from "./http.ts";

export interface CreateRoomRequest {
  title: string;
  hostName: string;
}

export interface UserLoginInfo {
  username: string;
  token: string;
  isOwner: boolean;
  id: number;
}

export interface CreateRoomResponse {
  roomId: string;
  host: UserLoginInfo;
}

export interface JoinRoomRequest {
  roomId: string;
  username: string;
}

export interface JoinRoomResponse {
  roomId: string;
  user: UserLoginInfo;
}

interface BackendCreateRoomResponse {
  room_id: string;
  host: {
    id: number;
    username: string;
    is_owner: boolean;
    token: string;
  };
}

interface BackendJoinRoomResponse {
  room_id: string;
  user: {
    id: number;
    username: string;
    is_owner: boolean;
    token: string;
  };
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

export async function createRoom(
  payload: CreateRoomRequest,
): Promise<CreateRoomResponse> {
  const { data } = await http.post<BackendCreateRoomResponse>("/api/room/", {
    title: payload.title,
    host_name: payload.hostName,
  });

  return {
    roomId: data.room_id,
    host: {
      username: data.host.username,
      token: data.host.token,
      isOwner: data.host.is_owner,
      id: data.host.id,
    },
  };
}

export async function joinRoom(
  payload: JoinRoomRequest,
): Promise<JoinRoomResponse> {
  const { data } = await http.post<BackendJoinRoomResponse>(
    `/api/room/${encodeURIComponent(payload.roomId)}`,
    {
      username: payload.username,
    },
  );

  return {
    roomId: data.room_id,
    user: {
      id: data.user.id,
      username: data.user.username,
      isOwner: data.user.is_owner,
      token: data.user.token,
    },
  };
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
