// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const connectDB = require('./database/db');
const authRoutes = require('./routes/auth');
const authMiddleware = require('./middleware/authMiddleware');

const app = express();
const PORT = process.env.PORT || 4000;

// --------------------
// ✅ CORS MIDDLEWARE
// --------------------
app.use(cors({
  origin: 'https://chaintech-intern-project.vercel.app/',   // your frontend URL
  credentials: true,                 // allow cookies / auth headers
}));

// -------------------- 
// Body parsers
// --------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --------------------
// Database Connection
// --------------------
(async () => {
  try {
    await connectDB(process.env.MONGO_URI);
    console.log('MongoDB connected');
  } catch (err) {
    console.error('DB connection error', err);
    process.exit(1);
  }

  // --------------------
  // Routes
  // --------------------
  app.use('/api/auth', authRoutes);

  // Example protected route
  app.get('/api/profile', authMiddleware, (req, res) => {
    res.json({ user: req.user.toJSON() });
  });

  // --------------------
  // Start Server
  // --------------------
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
})();
