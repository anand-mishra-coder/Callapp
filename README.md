# CallWave Pro

A Firebase-only cloud-data WhatsApp-style web app foundation.

## Included
- Google login
- People directory with Gmail + online state
- One-to-one real-time text chat
- Chat history in Cloud Firestore
- Audio/video WebRTC calling
- Incoming call UI
- Call records/status foundation
- Status tab foundation
- Responsive UI
- No Firebase Storage
- No fake call simulation

## Setup
1. Create Firebase project.
2. Enable Authentication -> Google.
3. Create Firestore Database.
4. Put your Firebase Web App config in `js/firebase-config.js`.
5. Publish `firestore.rules`.
6. Run through a local web server, not `file://`, e.g. `python -m http.server 5500`.
7. Open `http://localhost:5500`.
8. Test with two different Google accounts/browser profiles.

## Production WebRTC
The included STUN servers are enough for many networks, but not all. Production calling should use a TURN server for restrictive NAT/firewalls.

## Important
The app intentionally does not use Firebase Storage. Text, profiles, chat history, status/presence and signaling are in Firestore. Google profile photo URLs come from Google/Firebase Auth.

For a public app, review Firestore privacy rules carefully because this requested design exposes authenticated users' Gmail addresses to other authenticated users.
