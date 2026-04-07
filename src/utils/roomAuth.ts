import usePersistStore from "../stores/persistStore";

type RoomAuthIdentity = {
  id: number;
  username: string;
  token: string;
};

const ROOM_TOKEN_PREFIX = "ccg-room-token:";
const ROOM_USER_ID_PREFIX = "ccg-room-user-id:";
const ROOM_USERNAME_PREFIX = "ccg-room-username:";

const ROOM_AUTH_COOKIE_PREFIXES = [
  ROOM_TOKEN_PREFIX,
  ROOM_USER_ID_PREFIX,
  ROOM_USERNAME_PREFIX,
];

const setCookie = (name: string, value: string) => {
  const setWithDocumentCookie = () => {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
  };

  if (typeof cookieStore !== "undefined") {
    try {
      cookieStore.set(name, value).catch(setWithDocumentCookie);
    } catch {
      setWithDocumentCookie();
    }
  } else {
    setWithDocumentCookie();
  }
};

const clearCookie = (name: string) => {
  document.cookie = `${name}=; path=/; Max-Age=0; SameSite=Lax`;
};

const getRoomAuthKeys = (roomId: string) => {
  const normalizedRoomId = roomId.trim();
  return {
    normalizedRoomId,
    tokenKey: `${ROOM_TOKEN_PREFIX}${normalizedRoomId}`,
    userIdKey: `${ROOM_USER_ID_PREFIX}${normalizedRoomId}`,
    usernameKey: `${ROOM_USERNAME_PREFIX}${normalizedRoomId}`,
  };
};

const readCookie = (name: string): string | null => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matched = document.cookie.match(
    new RegExp(`(?:^|; )${escaped}=([^;]*)`),
  );
  if (!matched) {
    return null;
  }
  try {
    return decodeURIComponent(matched[1]);
  } catch {
    return matched[1];
  }
};

export const getRoomAuthQueryParams = (
  roomId: string,
): { token: string; user_id: string } | null => {
  const { normalizedRoomId, tokenKey, userIdKey } = getRoomAuthKeys(roomId);
  if (!normalizedRoomId) {
    return null;
  }

  const persistedRoomUser =
    usePersistStore.getState().getRoomUser(normalizedRoomId) ?? null;
  const tokenFromPersist = persistedRoomUser?.token?.trim() || null;
  const userIdFromPersist =
    persistedRoomUser != null ? `${persistedRoomUser.id}`.trim() : null;

  const tokenFromSession = sessionStorage.getItem(tokenKey)?.trim() || null;
  const tokenFromCookie = readCookie(tokenKey)?.trim() || null;
  const token = tokenFromSession ?? tokenFromCookie ?? tokenFromPersist;

  const userIdFromSession = sessionStorage.getItem(userIdKey)?.trim() || null;
  const userIdFromCookie = readCookie(userIdKey)?.trim() || null;
  const userId = userIdFromSession ?? userIdFromCookie ?? userIdFromPersist;

  if (!token || !userId) {
    return null;
  }

  return {
    token,
    user_id: userId,
  };
};

export const clearRoomAuthCookiesExcept = (roomId: string) => {
  const normalizedRoomId = roomId.trim();
  if (!normalizedRoomId) {
    return;
  }

  const keepCookieNames = new Set(
    ROOM_AUTH_COOKIE_PREFIXES.map((prefix) => `${prefix}${normalizedRoomId}`),
  );

  document.cookie
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .forEach((chunk) => {
      const separatorIndex = chunk.indexOf("=");
      const cookieName =
        separatorIndex >= 0 ? chunk.slice(0, separatorIndex) : chunk;

      const isRoomAuthCookie = ROOM_AUTH_COOKIE_PREFIXES.some((prefix) =>
        cookieName.startsWith(prefix),
      );
      if (!isRoomAuthCookie) {
        return;
      }

      if (!keepCookieNames.has(cookieName)) {
        clearCookie(cookieName);
      }
    });
};

export const syncRoomAuthCookie = (
  roomId: string,
  identity: RoomAuthIdentity | null,
) => {
  const { normalizedRoomId, tokenKey, userIdKey, usernameKey } =
    getRoomAuthKeys(roomId);
  if (!normalizedRoomId) {
    return;
  }

  if (!identity) {
    return;
  }

  setCookie(tokenKey, identity.token);
  setCookie(userIdKey, `${identity.id}`);
  setCookie(usernameKey, identity.username);
};

export const syncRoomAuthToSession = (
  roomId: string,
  identity: RoomAuthIdentity | null,
) => {
  const { normalizedRoomId, tokenKey, userIdKey, usernameKey } =
    getRoomAuthKeys(roomId);
  if (!normalizedRoomId) {
    return;
  }

  if (!identity) {
    sessionStorage.removeItem(tokenKey);
    sessionStorage.removeItem(userIdKey);
    sessionStorage.removeItem(usernameKey);
    return;
  }

  sessionStorage.setItem(tokenKey, identity.token);
  sessionStorage.setItem(userIdKey, `${identity.id}`);
  sessionStorage.setItem(usernameKey, identity.username);
};

export const syncRoomAuthToCookieAndSession = (
  roomId: string,
  identity: RoomAuthIdentity | null,
) => {
  syncRoomAuthCookie(roomId, identity);
  syncRoomAuthToSession(roomId, identity);
};
