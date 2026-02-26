import { http } from "./http";

export interface Tag {
  id: number;
  name: string;
}

export interface TagGroup {
  id: number;
  name: string;
  description?: string | null;
  tags: Tag[];
}

interface BackendTag {
  id: number;
  name: string;
}

interface BackendTagGroup {
  id: number;
  name: string;
  description?: string | null;
  tags: BackendTag[];
}

interface BackendTagListResponse {
  tags: BackendTag[];
}

interface BackendCreateTagGroupRequest {
  name: string;
  description?: string | null;
  tags: string[];
  existing_tag_ids: number[];
}

interface BackendPatchTagGroupRequest {
  id: number;
  name?: string;
  description?: string | null;
  add_tags?: Array<{ name: string }>;
  add_existing_tag_ids?: number[];
  remove_tag_ids?: number[];
}

const mapTag = (tag: BackendTag): Tag => ({
  id: tag.id,
  name: tag.name,
});

const mapTagGroup = (group: BackendTagGroup): TagGroup => ({
  id: group.id,
  name: group.name,
  description: group.description ?? null,
  tags: group.tags.map(mapTag),
});

export async function getTags(limit = 200, offset = 0): Promise<Tag[]> {
  const { data } = await http.get<BackendTagListResponse>("/api/tags/", {
    params: { limit, offset },
  });
  return data.tags.map(mapTag);
}

export async function createTags(tagNames: string[]): Promise<Tag[]> {
  const normalized = tagNames.map((name) => name.trim()).filter(Boolean);
  const { data } = await http.post<BackendTagListResponse>("/api/tags/", {
    tags: normalized,
  });
  return data.tags.map(mapTag);
}

export async function updateTag(tagId: number, name: string): Promise<Tag> {
  const { data } = await http.patch<BackendTag>(`/api/tags/${tagId}`, {
    name: name.trim(),
  });
  return mapTag(data);
}

export async function deleteTag(tagId: number): Promise<void> {
  await http.delete(`/api/tags/${tagId}`);
}

export async function getTagGroups(
  limit = 200,
  offset = 0,
): Promise<TagGroup[]> {
  const { data } = await http.get<BackendTagGroup[]>("/api/tags/groups/", {
    params: { limit, offset },
  });
  return data.map(mapTagGroup);
}

export interface CreateTagGroupRequest {
  name: string;
  description?: string;
  tags?: string[];
  existingTagIds?: number[];
}

export interface PatchTagGroupRequest {
  id: number;
  name?: string;
  description?: string | null;
  addTags?: string[];
  addExistingTagIds?: number[];
  removeTagIds?: number[];
}

export async function createTagGroup(
  payload: CreateTagGroupRequest,
): Promise<TagGroup> {
  const requestBody: BackendCreateTagGroupRequest = {
    name: payload.name.trim(),
    description: payload.description?.trim() || null,
    tags: (payload.tags ?? []).map((tag) => tag.trim()).filter(Boolean),
    existing_tag_ids: payload.existingTagIds ?? [],
  };

  const { data } = await http.post<BackendTagGroup>(
    "/api/tags/groups/",
    requestBody,
  );

  return mapTagGroup(data);
}

export async function patchTagGroup(
  payload: PatchTagGroupRequest,
): Promise<TagGroup> {
  const requestBody: BackendPatchTagGroupRequest = {
    id: payload.id,
  };

  if (payload.name !== undefined) {
    requestBody.name = payload.name.trim();
  }

  if (payload.description !== undefined) {
    requestBody.description = payload.description?.trim() || null;
  }

  if (payload.addTags !== undefined) {
    requestBody.add_tags = payload.addTags
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => ({ name }));
  }

  if (payload.addExistingTagIds !== undefined) {
    requestBody.add_existing_tag_ids = payload.addExistingTagIds;
  }

  if (payload.removeTagIds !== undefined) {
    requestBody.remove_tag_ids = payload.removeTagIds;
  }

  const { data } = await http.patch<BackendTagGroup>(
    "/api/tags/groups/",
    requestBody,
  );

  return mapTagGroup(data);
}

export async function deleteTagGroup(groupId: number): Promise<void> {
  await http.delete(`/api/tags/groups/${groupId}`);
}
