// routes/auth.js
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const Otp = require('../models/Otp');
const { sendOtpEmail } = require('../utils/mailer');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();
const { JWT_SECRET, JWT_EXPIRES_IN } = process.env;

// helper functions
function generateNumericOtp(digits = 6) {
  const min = Math.pow(10, digits - 1);
  const max = Math.pow(10, digits) - 1;
  return String(Math.floor(Math.random() * (max - min + 1) + min));
}

async function createAndSendOtp(user) {
  const rawOtp = generateNumericOtp(6);
  const otpHash = await bcrypt.hash(rawOtp, 10);
  const expiresAt = new Date(Date.now() + (Number(process.env.OTP_EXPIRES_MIN || 10) * 60 * 1000));
  await Otp.updateMany({ user: user._id, used: false }, { used: true }).catch(() => { });
  const otpDoc = await Otp.create({ user: user._id, otpHash, expiresAt });
 
  // DEV: print OTP in console for testing (remove in production)
  console.log(`DEV OTP for ${user.email}: ${rawOtp}`);

  // try to send email; caller will log/send appropriate response if it fails
  try { 
    await sendOtpEmail(user.email, rawOtp); 
  } catch (err) {
    // propagate error up so caller can handle it (we also logged inside sendOtpEmail)
    throw err;
  }

  return otpDoc;
}

router.put('/profile',authMiddleware, async (req, res) => {
  try {
    const { name } = req.body ?? {};
    if (!name) return res.status(400).json({ message: 'Missing name' });

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.name = name;
    await user.save();

    return res.json({ user: user.toJSON() });
  } catch (err) {
    console.error('update profile error', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// POST /auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body ?? {};

    if (!email || !password) return res.status(400).json({ message: 'Missing email or password' });

    // keep a single user var so we can return it consistently
    let user = await User.findOne({ email });

    if (user) {

      if (user.isVerified) {
        return res.status(409).json({ message: 'User already exists' });
      }
      try {
        await createAndSendOtp(user);
      } catch (mailErr) {
        console.error('sendOtpEmail failed', mailErr);
        return res.status(201).json({
          user: user.toJSON(),
          userId: user._id,
          message: 'User exists but OTP email failed to send. Check server logs.',
        }); 
      }
    } else {
      // create a new user
      user = new User({ email, name });
      await user.setPassword(password);
      user.isVerified = false;
      await user.save();

      try {
        await createAndSendOtp(user);
      } catch (mailErr) {
        console.log('sendOtpEmail failed', mailErr);
        return res.status(201).json({
          user: user.toJSON(),
          userId: user._id,
          message: 'User created but OTP email failed to send. Check server logs.',
        });
      }
    }

    // return user id so client can call verify endpoint
    return res.status(201).json({ user: user.toJSON(), userId: user._id, message: 'OTP sent to email' });
  } catch (err) {
    console.error('register error', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// POST /auth/verify-otp
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body ?? {};
    
    if (!email || !otp) return res.status(400).json({ message: 'Missing fields' });
    const checkuser = await User.findOne({ email });
    if (!checkuser) return res.status(400).json({ message: 'Invalid email or OTP' });
    const userId = checkuser._id;
    const otpDoc = await Otp.findOne({ user: userId, used: false }).sort({ createdAt: -1 });
    if (!otpDoc) return res.status(400).json({ message: 'No OTP requested or already used' });

    if (otpDoc.expiresAt < new Date()) {
      return res.status(400).json({ message: 'OTP expired' });
    }
    console.log('Verifying OTP for user:', otp);

    const match = await bcrypt.compare(otp, otpDoc.otpHash);
    if (!match) return res.status(400).json({ message: 'Invalid OTP' });

    otpDoc.used = true;
    await otpDoc.save();

    const user = await User.findById(userId);
    if (!user) return res.status(400).json({ message: 'User not found' });

    user.isVerified = true;
    await user.save();

    return res.json({ ok: true, message: 'Phone/email verified' });
  } catch (err) {
    console.error('verify-otp error', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// POST /auth/resend-otp
router.post('/resend-otp', async (req, res) => {
  try {
    const { email } = req.body ?? {};
    if (!email) return res.status(400).json({ message: 'Missing email' });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    try {
      await createAndSendOtp(user);
    } catch (mailErr) {
      console.error('resend-otp mail error', mailErr);
      return res.status(500).json({ message: 'Failed to send OTP' });
    }

    return res.json({ ok: true, message: 'OTP resent' });
  } catch (err) {
    console.error('resend-otp error', err);
    return res.status(500).json({ message: 'Server error' });
  }
});


// POST /auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) return res.status(400).json({ message: 'Missing email or password' });

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    if (!user.isVerified) return res.status(403).json({ message: 'Email not verified' });

    const ok = await user.validatePassword(password);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });

    const payload = { sub: user._id, email: user.email, passwordVersion: user.passwordVersion };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN || '30d' });

    return res.json({ user: user.toJSON(), token });
  } catch (err) {
    console.error('login error', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/request-password-reset', async (req, res) => {
  try {
    const { email } = req.body ?? {};
    if (!email) return res.status(400).json({ message: 'Missing email' });

    const user = await User.findOne({ email });
    if (!user) {
      return res.json({ ok: true, message: 'If an account with that email exists, an OTP was sent.' });
    }

    try {
      await createAndSendOtp(user);
    } catch (mailErr) {
      console.error('request-password-reset: sendOtpEmail failed', mailErr);

      return res.json({ ok: true, message: 'If an account with that email exists, an OTP was sent.' });
    }
    return res.json({ ok: true, message: 'If an account with that email exists, an OTP was sent.' });
  } catch (err) {
    console.error('request-password-reset error', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body ?? {};
    console.log('email', email, 'otp', otp, 'newPassword', newPassword);
    if (!email || !otp || !newPassword) return res.status(400).json({ message: 'Missing fields' });
    
    const checkUser = await User.findOne({ email });
    if (!checkUser) return res.status(400).json({ message: 'Invalid email or OTP' });
    
    const otpDoc = await Otp.findOne({ user: checkUser._id, used: false }).sort({ createdAt: -1 });
    if (!otpDoc) return res.status(400).json({ message: 'please resend the otp' });

    if (otpDoc.expiresAt < new Date()) return res.status(400).json({ message: 'OTP expired' });

    const match = await bcrypt.compare(otp, otpDoc.otpHash);
    if (!match) return res.status(400).json({ message: 'Invalid OTP' });

    // mark OTP used
    otpDoc.used = true;
    await otpDoc.save();

    // set new password
    const user = await User.findById(otpDoc.user);
    if (!user) return res.status(400).json({ message: 'User not found' });

    await user.setPassword(newPassword);
    user.passwordVersion++;
    await user.save();

    // Optionally: invalidate other sessions / tokens. (Not implemented here)

    return res.json({ ok: true, message: 'Password has been reset successfully' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
