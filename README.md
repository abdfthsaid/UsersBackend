# 💳 Danab Power - Payment Backend

Public-facing payment API for customer powerbank rentals.

## 🚀 Features

- Process customer payments via Waafi API
- Check battery availability from HeyCharge stations
- Unlock batteries automatically after payment
- Blacklist checking to prevent blocked users
- Rate limiting to prevent abuse
- Duplicate transaction prevention

## 📋 Endpoints

- `POST /api/pay/:stationCode` - Process payment and unlock battery
- `GET /api/blacklist/check/:phoneNumber` - Check if phone is blacklisted
- `GET /api/timezone` - Get server timezone info
- `GET /` - Health check

## 🔧 Environment Variables

Create a `.env` file (see `.env.example`):

```env
FIREBASE_CREDENTIALS_B64=your_base64_credentials
HEYCHARGE_API_KEY=your_key
HEYCHARGE_DOMAIN=https://api.heycharge.com
WAAFI_API_KEY=your_key
WAAFI_MERCHANT_UID=your_uid
WAAFI_API_USER_ID=your_id
WAAFI_URL=https://api.waafipay.net/asm
STATION_CASTELLO_TALEEX=imei
STATION_CASTELLO_BOONDHERE=imei
STATION_JAVA_TALEEX=imei
STATION_JAVA_AIRPORT=imei
STATION_DILEK_SOMALIA=imei
```

## 📦 Installation

```bash
npm install
```

## 🏃 Run

```bash
npm start
```

Server runs on port 3000 (or PORT from environment).

## 🚫 Rate Limits

- Payment endpoint: 10 requests per 5 minutes per IP
- Blacklist check: 20 requests per minute per IP

## 🔒 Security

- No authentication required (public API)
- Rate limiting on all endpoints
- Blacklist validation before payment
- Duplicate transaction prevention

## 📊 Database

Uses Firebase Firestore:
- `rentals` collection - Payment transactions
- `blacklist` collection - Blocked phone numbers

## 🌐 Deploy to Render

1. Push to GitHub
2. Create new Web Service on Render
3. Set environment variables
4. Deploy with: `node server.js`

See deployment guide for details.
