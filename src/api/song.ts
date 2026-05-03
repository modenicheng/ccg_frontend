import { http } from "./http";
import { getRoomAuthQueryParams } from "../utils/roomAuth";

export interface Song {
  id: number;
  platform?: string | null;
  platform_song_id?: string | null;
  title?: string | null;
  subtitle?: string | null;
  artist?: string | null;
  album_name?: string | null;
  album_id?: number | null;
  cover_url?: string | null;
  audio_url?: string | null;
  cached_path?: string | null;
  cached?: boolean;
  metadata_json?: string | null;
}

export interface BackendSong {
  id: number;
  platform?: string | null;
  platform_song_id?: string | null;
  title?: string | null;
  subtitle?: string | null;
  artist?: string | null;
  album_name?: string | null;
  album_id?: number | null;
  cover_url?: string | null;
  audio_url?: string | null;
  cached_path?: string | null;
  cached?: boolean;
  metadata_json?: string | null;
}

interface BackendSongListResponse {
  total: number;
  list: BackendSong[];
}

export const mapSong = (song: BackendSong): Song => ({
  id: song.id,
  platform: song.platform,
  platform_song_id: song.platform_song_id,
  title: song.title,
  subtitle: song.subtitle,
  artist: song.artist,
  album_name: song.album_name,
  album_id: song.album_id,
  cover_url: song.cover_url,
  audio_url: song.audio_url,
  cached_path: song.cached_path,
  cached: song.cached ?? false,
  metadata_json: song.metadata_json,
});

export interface SongListParams {
  offset?: number;
  limit?: number;
  kw?: string;
}

export interface SongListResult {
  total: number;
  list: Song[];
}

export async function getSongs(
  params: SongListParams = {},
): Promise<SongListResult> {
  const { offset = 0, limit = 20, kw } = params;
  const { data } = await http.get<BackendSongListResponse>("/api/songs/", {
    params: { offset, limit, kw },
  });
  return {
    total: data.total ?? 0,
    list: (data.list ?? []).map(mapSong),
  };
}

export async function getSong(songId: number): Promise<Song> {
  const { data } = await http.get<BackendSong>(`/api/songs/${songId}`);
  return mapSong(data);
}

export interface CreateSongRequest {
  platform?: string;
  platform_song_id?: string;
  title?: string;
  subtitle?: string;
  artist?: string;
  album_name?: string;
  album_id?: number;
  cover_url?: string;
  audio_url?: string;
  cached_path?: string;
  metadata_json?: string;
}

export async function createSong(roomId: string, payload: CreateSongRequest): Promise<Song> {
  const authQuery = getRoomAuthQueryParams(roomId);
  const { data } = await http.post<BackendSong>("/api/songs/", payload, {
    params: authQuery ?? undefined,
  });
  return mapSong(data);
}

export type UpdateSongRequest = Partial<CreateSongRequest>

export async function updateSong(
  roomId: string,
  songId: number,
  payload: UpdateSongRequest,
): Promise<Song> {
  const authQuery = getRoomAuthQueryParams(roomId);
  const { data } = await http.put<BackendSong>(`/api/songs/${songId}`, payload, {
    params: authQuery ?? undefined,
  });
  return mapSong(data);
}

export async function deleteSong(roomId: string, songId: number): Promise<void> {
  const authQuery = getRoomAuthQueryParams(roomId);
  await http.delete(`/api/songs/${songId}`, {
    params: authQuery ?? undefined,
  });
}

interface BackendSongTagHistoryOption {
  tag_id: number;
  tag_name: string;
  selected_count: number;
}

interface BackendSongTagGroupHistoryItem {
  group_id: number;
  group_name: string;
  tags: BackendSongTagHistoryOption[];
}

interface BackendSongTagHistorySummaryResponse {
  song_id: number;
  groups: BackendSongTagGroupHistoryItem[];
}

interface BackendSongTagHistoryRecord {
  history_id: number;
  room_id: string | null;
  judged_by_user_id: number | null;
  judged_by_username: string | null;
  created_at: string;
}

interface BackendSongTagHistoryDetailResponse {
  song_id: number;
  tag_id: number;
  tag_name: string;
  group_id: number | null;
  group_name: string | null;
  total: number;
  records: BackendSongTagHistoryRecord[];
}

export interface SongTagHistoryOption {
  tagId: number;
  tagName: string;
  selectedCount: number;
}

export interface SongTagGroupHistoryItem {
  groupId: number;
  groupName: string;
  tags: SongTagHistoryOption[];
}

export interface SongTagHistorySummary {
  songId: number;
  groups: SongTagGroupHistoryItem[];
}

export interface SongTagHistoryRecord {
  historyId: number;
  roomId: string | null;
  judgedByUserId: number | null;
  judgedByUsername: string | null;
  createdAt: string;
}

export interface SongTagHistoryDetail {
  songId: number;
  tagId: number;
  tagName: string;
  groupId: number | null;
  groupName: string | null;
  total: number;
  records: SongTagHistoryRecord[];
}

const mapSongTagHistorySummary = (
  payload: BackendSongTagHistorySummaryResponse,
): SongTagHistorySummary => ({
  songId: payload.song_id,
  groups: (payload.groups ?? []).map((group) => ({
    groupId: group.group_id,
    groupName: group.group_name,
    tags: (group.tags ?? []).map((tag) => ({
      tagId: tag.tag_id,
      tagName: tag.tag_name,
      selectedCount: tag.selected_count,
    })),
  })),
});

const mapSongTagHistoryDetail = (
  payload: BackendSongTagHistoryDetailResponse,
): SongTagHistoryDetail => ({
  songId: payload.song_id,
  tagId: payload.tag_id,
  tagName: payload.tag_name,
  groupId: payload.group_id,
  groupName: payload.group_name,
  total: payload.total,
  records: (payload.records ?? []).map((record) => ({
    historyId: record.history_id,
    roomId: record.room_id,
    judgedByUserId: record.judged_by_user_id,
    judgedByUsername: record.judged_by_username,
    createdAt: record.created_at,
  })),
});

export async function getSongTagHistorySummary(
  songId: number,
): Promise<SongTagHistorySummary> {
  const { data } = await http.get<BackendSongTagHistorySummaryResponse>(
    `/api/songs/${songId}/history/tags`,
  );
  return mapSongTagHistorySummary(data);
}

export async function getSongTagHistoryDetail(
  songId: number,
  tagId: number,
  groupId?: number,
): Promise<SongTagHistoryDetail> {
  const { data } = await http.get<BackendSongTagHistoryDetailResponse>(
    `/api/songs/${songId}/history/tags/${tagId}/records`,
    {
      params: {
        group_id: groupId,
      },
    },
  );
  return mapSongTagHistoryDetail(data);
}
