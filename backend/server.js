require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/schoolDB", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Connected to MongoDB");
    initializeTeachers();
  })
  .catch((err) => console.error("Could not connect to MongoDB", err));

const raceHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  date: { type: String }, // Default to current date/time
  wpm: { type: Number, required: true },
  accuracy: { type: Number, required: true },
  timetocomplete: { type: Number, required: true },
  quote: { type: String, required: true },
  charsToImprove: { type: [String], required: true }, // Array of strings
});

const raceHistory = mongoose.model("Races", raceHistorySchema);

const userSchema = new mongoose.Schema(
  {
    fname: { type: String, required: true }, // First name
    lname: { type: String, required: true }, // Last name
    email: { type: String, required: true, unique: true }, // Email
    username: { type: String, required: true, unique: true }, // Username
    password: { type: String, required: true }, // Hashed password
  },
  { timestamps: true }
); // Automatically adds `createdAt` and `updatedAt`

const User = mongoose.model("User", userSchema);

module.exports = User;

const TeacherSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // Use custom ID
  fname: { type: String, required: true },
  lname: { type: String, required: true },
  subjects_taught: { type: String, required: true },
  grades_taught: { type: String, required: true },
  calendar_info: [
    {
      date: Date,
      lesson_plan: String,
    },
  ],
});

const Teacher = mongoose.model("Teacher", TeacherSchema);

const ProprietorSchema = new mongoose.Schema({
  fname: { type: String, required: true },
  lname: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});

const Proprietor = mongoose.model("Proprietor", ProprietorSchema);

async function initializeTeachers() {
  try {
    const count = await Teacher.countDocuments();
    if (count === 0) {
      const sampleTeachers = [
        {
          _id: generateTeacherId("Jacqueline", "Batshuayi"),
          fname: "Jacqueline",
          lname: "Batshuayi",
          subjects_taught: "Math, Science, History",
          grades_taught: "1st, 2nd, 3rd",
          calendar_info: [],
        },
        {
          _id: generateTeacherId("Michael", "Smith"),
          fname: "Michael",
          lname: "Smith",
          subjects_taught: "French, Math",
          grades_taught: "1st, 2nd",
          calendar_info: [],
        },
        {
          _id: generateTeacherId("Laura", "Jones"),
          fname: "Laura",
          lname: "Jones",
          subjects_taught: "Science, History, French",
          grades_taught: "2nd, 3rd, 4th",
          calendar_info: [],
        },
      ];
      await Teacher.insertMany(sampleTeachers);
      console.log("Initialized database with sample teachers");
    }
  } catch (error) {
    console.error("Failed to initialize teachers", error);
  }
}

function generateTeacherId(fname, lname) {
  const initial = fname.charAt(0).toLowerCase();
  const lastName = lname.toLowerCase();
  return `${initial}_${lastName}`;
}

const proprietorAuthMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token provided" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.proprietorId = decoded.proprietorId;
    req.username = decoded.username;
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
};

app.post("/api/register", async (req, res) => {
  try {
    const { fname, lname, email, username, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      fname,
      lname,
      email,
      username,
      password: hashedPassword,
    });
    await user.save();
    res.status(201).json({ message: "User created successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error creating user", error: error.message });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { userId: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      success: true,
      token,
      user: {
        username: user.username,
        _id: user._id,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Error logging in", error: error.message });
  }
});

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    console.error("No token provided");
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("Decoded token:", decoded); // Log the decoded token
    req.userId = decoded.userId; // Attach userId to the request object
    next();
  } catch (error) {
    console.error("Error decoding token:", error.message);
    return res.status(401).json({ message: "Invalid token" });
  }
};

app.get("/api/protected", authMiddleware, (req, res) => {
  res.json({
    message: "This is a protected route",
    userId: req.userId,
    username: req.username,
  });
});

app.get("/api/teachers", async (req, res) => {
  try {
    const teachers = await Teacher.find();
    res.json(teachers);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching teachers", error: error.message });
  }
});

app.get("/api/teachers/:id", async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.params.id);
    if (!teacher) {
      return res.status(404).json({ message: "Teacher not found" });
    }
    res.json(teacher);
  } catch (error) {
    res
      .status(400)
      .json({ message: "Invalid teacher ID", error: error.message });
  }
});

app.get("/api/qotd", async (req, res) => {
  try {
    const response = await fetch("https://favqs.com/api/qotd");
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(5000, () => console.log("Proxy running on http://localhost:5000"));

app.post(
  "/api/teachers/calendar",
  proprietorAuthMiddleware,
  async (req, res) => {
    try {
      const { teacherId, date, lessonPlan } = req.body;
      const teacher = await Teacher.findById(teacherId);
      if (!teacher) {
        return res.status(404).json({ message: "Teacher not found" });
      }
      teacher.calendar_info.push({
        date: new Date(date),
        lesson_plan: lessonPlan,
      });
      await teacher.save();
      res.json({ message: "Lesson plan added successfully" });
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error adding lesson plan", error: error.message });
    }
  }
);

app.post("/api/proprietor/create-account", async (req, res) => {
  try {
    const { firstName, lastName, username, password } = req.body;
    const existingProprietor = await Proprietor.findOne({ username });
    if (existingProprietor) {
      return res.status(409).json({ message: "Username already exists" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const proprietor = new Proprietor({
      fname: firstName,
      lname: lastName,
      username: username,
      password: hashedPassword,
    });
    await proprietor.save();
    res
      .status(201)
      .json({ message: "Proprietor account created successfully" });
  } catch (error) {
    res.status(500).json({
      message: "Error creating proprietor account",
      error: error.message,
    });
  }
});

app.post("/api/proprietor/login", async (req, res) => {
  console.log("Login request received");
  console.log(req.body);
  try {
    const { username, password } = req.body;
    const proprietor = await Proprietor.findOne({ username });
    if (!proprietor) {
      return res.status(404).json({ message: "Proprietor not found" });
    }
    const isMatch = await bcrypt.compare(password, proprietor.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const token = jwt.sign(
      { proprietorId: proprietor._id, username: proprietor.username },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
    res.json({
      message: "Login successful",
      token,
      proprietor: {
        fname: proprietor.fname,
        lname: proprietor.lname,
        username: proprietor.username,
        _id: proprietor._id,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Error logging in", error: error.message });
  }
});

app.post("/api/race", authMiddleware, async (req, res) => {
  console.log("User ID:", req.userId);

  try {
    const { date, wpm, accuracy, timetocomplete, quote, charsToImprove } = req.body;

    const newRace = new raceHistory({
      userId: req.userId,
      date,
      wpm,
      accuracy,
      timetocomplete,
      quote,
      charsToImprove,
    });

    await newRace.save();

    res
      .status(201)
      .json({ message: "Race successfully posted to user history" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to post race to user history" });
  }
});

app.get("/api/race-history", authMiddleware, async (req, res) => {
  try {
    const races = await raceHistory
      .find({ userId: req.userId })
      .sort({ createdAt: -1 }); // Sort by createdAt in descending order

    res.status(200).json(races);
  } catch (error) {
    console.error("Error fetching race history:", error);
    res.status(500).json({ error: "Failed to fetch race history" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});