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
