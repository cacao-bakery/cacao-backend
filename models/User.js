import mongoose from "mongoose";
import bcrypt from "bcryptjs";

/**
 * This schema becomes the "users" collection automatically — Mongoose
 * lowercases and pluralizes the model name ("User" -> "users"). You don't
 * need to create this collection yourself in Atlas; it's created the first
 * time a user actually registers.
 */
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email address"],
    },
    // Optional for now since the current Signup form doesn't collect a
    // phone number yet. `sparse: true` means the unique constraint only
    // applies to documents that actually have a phone value, so multiple
    // users without a phone won't collide with each other.
    phone: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false, // never returned in queries unless explicitly requested
    },
    role: {
      type: String,
      enum: ["customer", "admin"],
      default: "customer",
    },
  },
  { timestamps: true },
);

// Hash the password automatically before saving, but only if it changed —
// otherwise every unrelated save() would re-hash an already-hashed
// password and permanently lock the user out.
userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.methods.comparePassword = async function comparePassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model("User", userSchema);

export default User;
