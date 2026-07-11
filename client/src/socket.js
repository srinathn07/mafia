import { io } from "socket.io-client";

const SERVER_URL =
  import.meta.env.VITE_SERVER_URL || "http://localhost:3001";

const socket = io(SERVER_URL, {
  autoConnect: false,
  transports: ["websocket", "polling"],
});

export default socket;
