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
