import axios from "axios";

const isDev = import.meta.env.MODE === "development";

export const axiosInstance = axios.create({
  baseURL: isDev ? "http://localhost:5001/api" : "/api",
  withCredentials: true,
});
