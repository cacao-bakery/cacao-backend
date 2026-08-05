import mongoose from "mongoose";

/**
 * Connects to MongoDB Atlas using Mongoose.
 *
 * Note on MongoClient: Mongoose does NOT replace the official MongoDB
 * Node.js driver — it's built directly on top of it. Calling
 * mongoose.connect() creates and manages a MongoClient internally for you,
 * so you never need to construct one by hand while using Mongoose. You'd
 * only reach for `new MongoClient(uri)` yourself if you were doing raw,
 * schema-less queries instead of using Mongoose models — not needed here.
 *
 * Database name: whatever comes right after the last "/" in MONGODB_URI
 * (e.g. ".../cacaoBakery?retryWrites=...") is the database Mongoose will
 * use. You do NOT need to create it (or any collections) manually in the
 * Atlas UI — MongoDB creates the database and each collection automatically
 * the first time a document is written to it.
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
    console.log(`📦 Database: ${conn.connection.name}`);
  } catch (error) {
    console.error(`❌ MongoDB connection error: ${error.message}`);
    process.exit(1); // fail fast — don't run a server with no database
  }
};

export default connectDB;
