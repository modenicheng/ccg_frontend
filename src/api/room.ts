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
  tagGroups: Record<string, unknown>;
  playProgress: number;
}

export interface PatchRoomRequest {
  songQueue?: string[];
  title?: string;
  description?: string;
  tagGroups?: Record<string, unknown>;
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function createRoom(username: string): Promise<CreateRoomResponse> {
  const response = await fetch("/api/room/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username }),
  });
  return parseJson<CreateRoomResponse>(response);
}

export async function getRoomInfo(roomId: string): Promise<RoomInfoResponse> {
  const response = await fetch(`/api/room/${encodeURIComponent(roomId)}`, {
    method: "GET",
  });
  return parseJson<RoomInfoResponse>(response);
}

export async function patchRoomInfo(
  roomId: string,
  payload: PatchRoomRequest,
): Promise<RoomInfoResponse> {
  const response = await fetch(`/api/room/${encodeURIComponent(roomId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseJson<RoomInfoResponse>(response);
}
