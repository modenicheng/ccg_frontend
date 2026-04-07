import { http } from "./http";
import { getRoomAuthQueryParams } from "../utils/roomAuth";

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
  status: "waiting" | "playing" | "ended";
  roundState?: "PENDING" | "PLAYING_AUDIO" | "ANSWERING" | "JUDGING" | "COMPLETED";
  roundStateCode?: 0 | 1 | 2 | 3 | 4;
  title?: string | null;
  description?: string | null;
  players: string[];
  songQueue: string[];
  tagGroups: Record<string, string[]>;
  playProgress: number;
  startPositionPercent?: number;
  playersDetailed?: Array<{ id: number; username: string; is_owner: boolean }>;
}

export interface PatchRoomRequest {
  song_queue?: string[];
  title?: string;
  description?: string;
  tagGroupIds?: number[];
}


interface BackendTagResponse {
  id: number;
  name: string;
}

interface BackendTagGroupResponse {
  id: number;
  name: string;
  description?: string | null;
  tags: BackendTagResponse[];
}

interface BackendRoomInfoResponse {
  room_id: string;
  host_player_id: string;
  status: number;
  round_state?: number;
  title?: string | null;
  players: Array<{ id: number; username: string; is_owner: boolean }>;
  tag_groups: BackendTagGroupResponse[];
}

interface BackendPatchRoomRequest {
  song_queue?: string[];
  title?: string;
  description?: string;
  tag_group_ids?: number[];
}

const mapRoomStatus = (
  status: number,
): "waiting" | "playing" | "ended" => {
  if (status === 1) {
    return "playing";
  }
  if (status === 2) {
    return "ended";
  }
  return "waiting";
};

const mapRoomInfo = (data: BackendRoomInfoResponse): RoomInfoResponse & { playersDetailed: Array<{ id: number; username: string; is_owner: boolean }> } => {
  const tagGroups = data.tag_groups.reduce<Record<string, string[]>>(
    (acc, group) => {
      acc[group.name] = group.tags.map((tag) => tag.name);
      return acc;
    },
    {},
  );

  return {
    roomId: data.room_id,
    hostPlayerId: data.host_player_id,
    status: mapRoomStatus(data.status),
    roundState:
      data.round_state === 1
        ? "PLAYING_AUDIO"
        : data.round_state === 2
          ? "ANSWERING"
          : data.round_state === 3
            ? "JUDGING"
            : data.round_state === 4
              ? "COMPLETED"
              : "PENDING",
    roundStateCode:
      data.round_state === 1
        ? 1
        : data.round_state === 2
          ? 2
          : data.round_state === 3
            ? 3
            : data.round_state === 4
              ? 4
              : 0,
    title: data.title ?? null,
    description: null,
    players: data.players.map((player) => player.username),
    playersDetailed: data.players,
    songQueue: [],
    tagGroups,
    playProgress: 0,
    startPositionPercent: 0,
  };
};

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
  const authQuery = getRoomAuthQueryParams(roomId);
  const { data } = await http.get<BackendRoomInfoResponse>(
    `/api/room/${encodeURIComponent(roomId)}`,
    {
      params: authQuery ?? undefined,
    },
  );
  return mapRoomInfo(data);
}

export async function patchRoomInfo(
  roomId: string,
  payload: PatchRoomRequest,
): Promise<RoomInfoResponse> {
  const authQuery = getRoomAuthQueryParams(roomId);
  const backendPayload: BackendPatchRoomRequest = {
    song_queue: payload.song_queue,
    title: payload.title,
    description: payload.description,
    tag_group_ids: payload.tagGroupIds,
  };

  const { data } = await http.patch<BackendRoomInfoResponse>(
    `/api/room/${encodeURIComponent(roomId)}`,
    backendPayload,
    {
      params: authQuery ?? undefined,
    },
  );
  return mapRoomInfo(data);
}


