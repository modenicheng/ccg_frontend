import { http } from "./http";
import { mapSong } from "./song";
import type { Song } from "./song";
import { getRoomAuthQueryParams } from "../utils/roomAuth";

import type { BackendSong } from "./song";

export interface Songlist {
  id: number;
  platform?: string | null;
  platform_songlist_id?: string | null;
  title?: string | null;
  creator_name?: string | null;
  cover_url?: string | null;
  count: number;
  songs?: Song[] | null;
}

interface BackendSonglist {
  id: number;
  platform?: string | null;
  platform_songlist_id?: string | null;
  title?: string | null;
  creator_name?: string | null;
  cover_url?: string | null;
  count: number;
  songs?: BackendSong[] | null;
}

interface BackendSonglistListResponse {
  total: number;
  list: BackendSonglist[];
}

const mapSonglist = (songlist: BackendSonglist): Songlist => ({
  id: songlist.id,
  platform: songlist.platform,
  platform_songlist_id: songlist.platform_songlist_id,
  title: songlist.title,
  creator_name: songlist.creator_name,
  cover_url: songlist.cover_url,
  count: songlist.count,
  songs: songlist.songs?.map(mapSong) ?? null,
});

export interface SonglistListParams {
  offset?: number;
  limit?: number;
  kw?: string;
}

export interface SonglistListResult {
  total: number;
  list: Songlist[];
}

export async function getSonglists(
  params: SonglistListParams = {},
): Promise<SonglistListResult> {
  const { offset = 0, limit = 20, kw } = params;
  const { data } = await http.get<BackendSonglistListResponse>(
    "/api/songlists/",
    {
      params: { offset, limit, kw },
    },
  );
  return {
    total: data.total ?? 0,
    list: (data.list ?? []).map(mapSonglist),
  };
}

export async function getSonglistDetail(songlistId: number): Promise<Songlist> {
  const { data } = await http.get<BackendSonglist>(
    `/api/songlists/${songlistId}`,
  );
  return mapSonglist(data);
}

export interface CreateSonglistFromPlatformRequest {
  platform: string;
  platform_songlist_id: string;
  cookie_str?: string;
}

export async function createSonglistFromPlatform(
  roomId: string,
  payload: CreateSonglistFromPlatformRequest,
): Promise<{ task_id: string }> {
  const authQuery = getRoomAuthQueryParams(roomId);
  const { data } = await http.post<{ task_id: string }>(
    "/api/songlists/",
    payload,
    {
      params: authQuery ?? undefined,
    },
  );
  return data;
}

export async function updateSonglist(
  roomId: string,
  songlistId: number,
  payload: Partial<Songlist>,
): Promise<Songlist> {
  const authQuery = getRoomAuthQueryParams(roomId);
  const { data } = await http.put<BackendSonglist>(
    `/api/songlists/${songlistId}`,
    payload,
    {
      params: authQuery ?? undefined,
    },
  );
  return mapSonglist(data);
}

export async function deleteSonglist(roomId: string, songlistId: number): Promise<void> {
  const authQuery = getRoomAuthQueryParams(roomId);
  await http.delete(`/api/songlists/${songlistId}`, {
    params: authQuery ?? undefined,
  });
}

export interface SonglistTaskResult {
  task_id: string;
  task_name: string;
  status: string;
  result?: Record<string, object>;
  created_at?: string;
  updated_at?: string;
  huey_task_id?: string;
}

export async function getSonglistTaskResult(
  taskId: string,
): Promise<SonglistTaskResult> {
  const { data } = await http.get<SonglistTaskResult>(
    `/api/songlists/task/${taskId}`,
  );
  return data;
}
