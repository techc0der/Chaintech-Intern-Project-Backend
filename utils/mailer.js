// utils/mailer.js
const nodemailer = require('nodemailer');
const resend = require('resend');
const { Resend } = resend;

const resendClient = new Resend(process.env.RESEND_API_KEY);

// const host = process.env.EMAIL_HOST || 'smtp.gmail.com';
// const port = Number(process.env.EMAIL_PORT || 465);
// const user = process.env.EMAIL_USER;
// const pass = process.env.EMAIL_PASS;

// if (!user || !pass) {
//   console.warn('MAILER WARNING: EMAIL_USER or EMAIL_PASS not set in .env');
// }

// const transporter = nodemailer.createTransport({
//   host, 
//   port,
//   secure: port === 465, // true for 465 (SSL), false for 587 (STARTTLS)
//   auth: { user, pass },
//   // optional: tls: { rejectUnauthorized: false } // use only for special cases
// });

// transporter.verify((err, success) => {
//   if (err) {
//     console.error('MAIL TRANSPORT ERROR:', err);
//   } else {
//     console.log('MAIL SERVER READY');
//   }
// });

async function sendOtpEmail(to, otp) {
  const html = `
    <div>
      <p>Your verification code is <strong>${otp}</strong>.</p>
      <p>It expires in ${process.env.OTP_EXPIRES_MIN || 10} minutes.</p>
    </div>
  `;

  // 1. DECLARE data and error variables in the function scope
  let data;
  let error;

  try {
    // 2. ASSIGN the result to the already declared variables
    ({ data, error } = await resendClient.emails.send({
      from: process.env.EMAIL_FROM,
      to: [to],
      subject: 'Your verification code',
      html,
    }));

    // Check for error returned by the Resend client
    if (error) {
      console.error('Resend email send error:', error);
      // It's good practice to throw here if an email send error should stop execution
      throw new Error(`Resend email error: ${error.message}`);
    } else {
      console.log('Resend email sent:', data);
    }

  }
  catch (err) {
    console.error('Resend email send error:', err);
    throw err;
  }

  // 3. RETURN the data variable, which is now accessible
  return data;
}

module.exports = { sendOtpEmail };
