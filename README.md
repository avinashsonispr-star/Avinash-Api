# PGDCA All Subject Note (prototype)

Simple prototype to upload notes and let users download them after entering their details. Downloads are logged (name, subject, phone, roll, IP, time).

Requirements
- Node.js 16+

Install and run (Windows):

```bash
cd "c:\Users\suraj  soni\Downloads\pgdca-notes"
npm install
npm start
```

Open http://localhost:3000

Notes
- This is a minimal prototype. For production add HTTPS, authentication for dashboard, file type scanning, rate limits, and privacy policy.
Owner account setup
- Start the server and open http://localhost:3000/owner to configure the owner account (enter your phone and a password). Use your phone `6267742025` if you want it linked for recovery.
- After setup, visit http://localhost:3000/owner to login and then upload notes as the owner (owner uploads appear as "Avi (Owner)").

Forgot password (demo)
- If you forget the owner password, open http://localhost:3000/owner-forgot and enter the registered phone. The demo will generate an OTP (shown on-screen) which you can use to reset the password. In production you should replace that with a real SMS provider like Twilio.

Twilio SMS (optional)
---------------------
To send OTPs directly to the owner's phone instead of displaying them on-screen, set these environment variables before starting the server:

```powershell
setx TWILIO_ACCOUNT_SID "your_sid"
setx TWILIO_AUTH_TOKEN "your_auth_token"
setx TWILIO_FROM "+1234567890"
```

After restarting the server OTPs will be delivered via Twilio. If Twilio is not configured the server will fall back to showing the OTP on-screen (demo mode).
