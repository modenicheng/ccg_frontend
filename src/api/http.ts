import axios from "axios";

const baseURL = import.meta.env.DEV ? "http://localhost:8000" : "";

export const http = axios.create({
  baseURL,
  timeout: 10_000,
  headers: {
    Accept: "application/json",
  },
});

http.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const responseData = error.response?.data as
        | { detail?: string; message?: string }
        | undefined;
      const message =
        responseData?.detail ||
        responseData?.message ||
        error.message ||
        (error.response?.status
          ? `HTTP ${error.response.status}`
          : "请求失败");

      return Promise.reject(new Error(message));
    }

    return Promise.reject(
      error instanceof Error ? error : new Error("请求失败"),
    );
  },
);
