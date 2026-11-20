import axios from "axios";
import toast from "react-hot-toast";

const isDev = import.meta.env.MODE === "development";

export const axiosInstance = axios.create({
  baseURL: isDev ? "http://localhost:5001/api" : "/api",
  withCredentials: true,
});

// Free-tier hosts sleep when idle and the first request can take 30s+. Instead of a frozen-looking
// app, show one gentle notice while any request is unusually slow, and clear it when they finish.
const SLOW_AFTER_MS = 4000;
const SLOW_TOAST_ID = "slow-server";
let pending = 0;
let slowTimer = null;
let slowShown = false;

const requestStarted = () => {
  pending += 1;
  if (pending === 1 && !slowTimer) {
    slowTimer = setTimeout(() => {
      slowTimer = null;
      if (pending > 0) {
        slowShown = true;
        toast.loading("Connecting to VibeLink… the server may be waking up.", { id: SLOW_TOAST_ID });
      }
    }, SLOW_AFTER_MS);
  }
};

const requestFinished = () => {
  pending = Math.max(0, pending - 1);
  if (pending > 0) return;
  clearTimeout(slowTimer);
  slowTimer = null;
  if (slowShown) {
    slowShown = false;
    toast.dismiss(SLOW_TOAST_ID);
  }
};

axiosInstance.interceptors.request.use((config) => {
  requestStarted();
  return config;
});

axiosInstance.interceptors.response.use(
  (response) => {
    requestFinished();
    return response;
  },
  (error) => {
    requestFinished();
    return Promise.reject(error);
  },
);
