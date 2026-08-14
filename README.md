# CallWave — Firebase + WebRTC

A real working browser call app foundation using:
- Firebase Authentication (Google)
- Cloud Firestore for users, call records and WebRTC signaling
- WebRTC for real microphone/camera media
- localStorage is intentionally not used for cloud call state; only Firebase is the source of truth
- No Firebase Storage is required

## 1. Firebase setup

Create a Firebase project and register a Web app.

Enable:
1. Authentication -> Sign-in method -> Google
2. Cloud Firestore -> Create database

Paste your web config into `js/firebase-config.js`.

Then publish the rules from `firestore.rules` in Firestore -> Rules.

## 2. Authorized domain

For local development, add your development host to Firebase Authentication -> Settings -> Authorized domains.
Using a local web server is recommended instead of opening `index.html` directly.

## 3. Run

Any static server works. Examples:

Python:
`python -m http.server 5500`

Then open:
`http://localhost:5500`

Or use VS Code Live Server.

## 4. Test with two accounts

Use two separate browser profiles/incognito windows and sign into two different Google accounts. Both accounts will appear in People with their Google name/Gmail.

Click the phone icon for an audio call or the video icon for a video call.

## Important real-world limitations

WebRTC media is peer-to-peer. The included STUN servers help peers discover routes, but some networks require a TURN server for reliable connections. For production-grade calling across restrictive NAT/firewalls, add a TURN service and put its ICE server credentials in `js/app.js`.

This project does not pretend that a browser-only WebRTC app can guarantee connectivity on every network.

## Privacy/security

The sample Firestore rules allow authenticated users to read the user directory, including email addresses, because the requested UI needs to show other signed-in users' Gmail addresses. If the app is deployed publicly, review whether that is appropriate and tighten the rules if needed.

Never put Firebase Admin SDK credentials or service-account JSON in frontend files.

## No fake call simulation

The call flow is real:
Google Auth -> Firestore user presence -> Firestore call document -> SDP offer/answer -> ICE candidates -> WebRTC media -> Firestore status updates.
