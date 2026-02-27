import { http } from "./http";

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

export async function createSong(payload: CreateSongRequest): Promise<Song> {
  const { data } = await http.post<BackendSong>("/api/songs/", payload);
  return mapSong(data);
}

export type UpdateSongRequest = Partial<CreateSongRequest>

export async function updateSong(
  songId: number,
  payload: UpdateSongRequest,
): Promise<Song> {
  const { data } = await http.put<BackendSong>(`/api/songs/${songId}`, payload);
  return mapSong(data);
}

export async function deleteSong(songId: number): Promise<void> {
  await http.delete(`/api/songs/${songId}`);
}
