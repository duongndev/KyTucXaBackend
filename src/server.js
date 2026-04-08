import app from "./app.js";
import dotenv from "dotenv";
import { connectDB } from "./config/db.config.js";

dotenv.config();
connectDB();
const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
});
