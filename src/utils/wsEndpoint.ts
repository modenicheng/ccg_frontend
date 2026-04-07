const PROD_WS_ORIGIN = "https://ccg-origin.modenc.top";

const toWsUrl = (pathname: string, search: string) => {
  const url = new URL(PROD_WS_ORIGIN);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = pathname;
  url.search = search;
  return url.toString();
};

const toSameOriginPath = (pathname: string, search: string) => {
  return `${pathname}${search}`;
};

const buildUrlByEnv = (pathname: string, search: string) => {
  if (import.meta.env.PROD) {
    return toWsUrl(pathname, search);
  }

  return toSameOriginPath(pathname, search);
};

export const buildRoomWsUrl = (
  roomId: string,
  token: string,
  userId: number,
) => {
  const pathname = `/ws/${encodeURIComponent(roomId)}`;
  const search = `?${new URLSearchParams({
    token,
    user_id: `${userId}`,
  }).toString()}`;

  return buildUrlByEnv(pathname, search);
};

export const buildSpectatorWsUrl = (roomId: string) => {
  const pathname = `/ws/${encodeURIComponent(roomId)}/watch`;
  return buildUrlByEnv(pathname, "");
};
