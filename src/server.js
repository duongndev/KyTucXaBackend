import app from "./app.js";
import http from 'http';
import dotenv from "dotenv";
import { connectDB } from "./config/db.config.js";
import chatSocketService from "./services/chatSocket.service.js";

dotenv.config();
connectDB();
const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
chatSocketService.init(server);

server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
});
