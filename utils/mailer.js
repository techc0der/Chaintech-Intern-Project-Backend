// utils/mailer.js
const nodemailer = require('nodemailer');

const host = process.env.EMAIL_HOST || 'smtp.gmail.com';
const port = Number(process.env.EMAIL_PORT || 465);
const user = process.env.EMAIL_USER;
const pass = process.env.EMAIL_PASS;

if (!user || !pass) {
  console.warn('MAILER WARNING: EMAIL_USER or EMAIL_PASS not set in .env');
}

const transporter = nodemailer.createTransport({
  host,
  port,
  secure: port === 465, // true for 465 (SSL), false for 587 (STARTTLS)
  auth: { user, pass },
  // optional: tls: { rejectUnauthorized: false } // use only for special cases
});

transporter.verify((err, success) => {
  if (err) {
    console.error('MAIL TRANSPORT ERROR:', err);
  } else {
    console.log('MAIL SERVER READY');
  }
});
 
async function sendOtpEmail(to, otp) {
  const html = `
    <div>
      <p>Your verification code is <strong>${otp}</strong>.</p>
      <p>It expires in ${process.env.OTP_EXPIRES_MIN || 10} minutes.</p>
  </div>
  `;
  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: 'Your verification code',
    html,
  });
  console.log('OTP email queued:', info.messageId, 'to', to);
  return info;
}

module.exports = { sendOtpEmail };
