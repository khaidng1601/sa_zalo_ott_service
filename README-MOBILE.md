# Chatter Mobile — Zalo-Inspired Companion App (Expo Go)

Companion **React Native + Expo + TypeScript** mobile application (`chatter-mobile`) for **`sa_zalo_ott_service`**. Designed for instant development and live demos on physical **iOS & Android** phones via **Expo Go** — **no Android Studio or Xcode emulators required**.

---

## 1. Mobile Architecture & Backend Integration

```text
Physical iPhone / Android Phone (Expo Go)
   │
   ├─ GraphQL Queries & Mutations  ──► POST <API_BASE_URL>/graphql
   ├─ Multipart Media Uploads      ──► POST <API_BASE_URL>/uploads/conversation/:id
   │                                   POST <API_BASE_URL>/uploads/avatar
   ├─ Signed Media & Video Stream  ──► GET  <API_BASE_URL>/uploads/files/:id/:file?expires=...&sig=...
   └─ Real-Time Socket.IO Client   ──► WS   <API_BASE_URL>/socket.io/ (Bearer JWT handshake)
                                           │
                                           ▼
                       Nginx Gateway (:3000) or NestJS Direct (:4000)
```

### Core MVP Capabilities
- **Auth & Secure Session (`expo-secure-store`):** Login, Registration, 1-tap Demo Account sign-in, automatic session restoration via `me` query, and encrypted hardware-backed JWT storage on iOS Keychain / Android Keystore.
- **Real-Time Messaging (`socket.io-client`):** Live message delivery (`message.created`), reactions (`message.updated`), recalls (`message.deleted`), typing indicators (`typing.start` / `typing.stop`), and online presence (`presence.snapshot` / `presence.updated`).
- **All 5 Mandatory Chat Payload Types:**
  1. **Text (`TEXT`):** Zalo-styled sent/received bubbles, reply quotes, copy text, and message recall (`Thu hồi`).
  2. **Image (`IMAGE`):** Multi-photo gallery picker & live camera capture (`expo-image-picker`) + tap-to-zoom fullscreen Lightbox.
  3. **Video (`VIDEO`):** Mobile video picker with automatic compression + inline native video player (`expo-video`).
  4. **Document (`DOCUMENT`):** File picker (`expo-document-picker` for PDF, Word, Excel, PowerPoint, TXT, CSV, ZIP) + downloadable file badge cards (`expo-web-browser`).
  5. **Emotion (`EMOTION` + Reactions):** 12 Zalo gradient sticker cards (`ZALO_STICKERS`), 16 quick emojis, and long-press message reactions (`👍 ❤️ 😂 😮 😢 😡 🎉 🙏`).
- **Contacts, Groups & Profile:** User directory search, friend list management, group creation & member role administration (`Owner` / `Admin` / `Member`), avatar upload, password change, and 7-day personal activity stats.

---

## 2. Prerequisites (No Heavy Emulators Needed)

1. **Node.js** `v20+` (v22 or v24 recommended) and `npm`.
   > **Windows PowerShell Note:** If PowerShell blocks `npm` / `npx` with an `Execution_Policies` warning, run this once in your terminal session (or use `npm.cmd` / `npx.cmd`):
   > ```powershell
   > Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   > ```
2. **Expo Go** installed on your physical smartphone:
   - **iOS (iPhone / iPad):** Download **Expo Go** from the Apple App Store.
   - **Android:** Download **Expo Go** from Google Play Store.
3. **Running Backend Stack:**
   - Either locally via Docker from the repository root:
     ```bash
     docker compose up -d --build
     ```
   - Or deployed on your **AWS EC2** instance (`http://<EC2_PUBLIC_IP>:3000`).

---

## 3. Install Dependencies

From the repository root:

```bash
cd chatter-mobile
npm install
```

Verify TypeScript compilation at any time:

```bash
npm run typecheck
```

---

## 4. Configure Backend API URLs for Mobile

Because a physical phone has its own network interface, **`localhost` on your phone refers to the phone itself**, not your laptop. `chatter-mobile` provides **3 seamless ways** to connect to your backend:

### Method A: Automatic LAN IP Detection (Zero-Config Default)
When your phone and computer are on the **same Wi-Fi network** and you run `npx expo start`, `chatter-mobile` automatically inspects Expo Go's Metro host URI and connects to:
```text
http://<YOUR_COMPUTER_WIFI_IP>:3000
```
No `.env` edits are required if Docker Compose is running on port `3000`!

### Method B: Configure via `.env` File (Recommended for AWS EC2 or Custom LAN Port)
1. Copy `.env.example` to `.env` inside `chatter-mobile/`:
   ```bash
   cp .env.example .env
   ```
2. Set `EXPO_PUBLIC_API_URL` to either your computer's Wi-Fi IPv4 address or your public AWS EC2 IP:
   ```env
   # Example 1: Local Docker stack over Wi-Fi LAN
   EXPO_PUBLIC_API_URL=http://192.168.1.105:3000

   # Example 2: Public AWS EC2 server (works over 4G/5G or any Wi-Fi!)
   # EXPO_PUBLIC_API_URL=http://54.169.xxx.xxx:3000
   ```
   **How to find your computer's Wi-Fi IPv4 address:**
   - **Windows (PowerShell):** `ipconfig` → look under *Wireless LAN adapter Wi-Fi* → `IPv4 Address` (e.g., `192.168.1.105`)
   - **macOS:** `ipconfig getifaddr en0`
   - **Linux:** `hostname -I`

### Method C: In-App Server Switcher & Live Connection Tester (No Restart Needed!)
Right inside the mobile app on your phone:
1. On the **Login** screen, tap the **server pill** at the top-right corner (or go to **Cá nhân → Máy chủ kết nối** after logging in).
2. Choose a suggested preset (`LAN Docker Nginx :3000`, `LAN Backend trực tiếp :4000`) or type your AWS EC2 URL (`http://<EC2_IP>:3000`).
3. Tap **Kiểm tra kết nối** to ping `{ health }` on `/graphql` and view round-trip latency in milliseconds, then tap **Lưu cấu hình**.

---

## 5. Run on a Physical Phone via QR Code

### Scenario 1: Same Wi-Fi Network (Fastest)
```bash
cd chatter-mobile
npx expo start
```
A QR code will appear in your terminal:
- **Android:** Open the **Expo Go** app → tap **Scan QR code** → scan the terminal QR code.
- **iPhone (iOS):** Open the built-in **Camera** app → point at the terminal QR code → tap the **Open in Expo Go** banner.

### Scenario 2: University / Corporate Wi-Fi or 4G/5G (`--tunnel` Mode)
If campus/guest Wi-Fi blocks peer-to-peer LAN traffic (AP Isolation):
1. Point your backend URL (via `.env` or the in-app Server Switcher) to your **public AWS EC2 endpoint** (`http://<EC2_PUBLIC_IP>:3000`).
2. Start Expo in tunnel mode:
   ```bash
   cd chatter-mobile
   npx expo start --tunnel
   ```
3. Scan the QR code with Expo Go from any network (including 4G/5G mobile data).

---

## 6. Instant Cross-Platform Demo (Web + Mobile Real-Time Sync)

1. Open the Web UI in your laptop browser at `http://localhost:3000` and log in as **Nguyễn Minh** (`minh.nguyen@chatter.vn` / `Password@123`).
2. Open **Chatter OTT** in **Expo Go** on your phone and tap the **Trần Thị Lan** 1-click demo chip (`lan.tran@chatter.vn` / `Password@123`).
3. Open `"Nhóm Đồ Án KTPM — Zalo OTT"` or their 1-1 chat and test sending **Text, Photos, Camera snaps, Videos, PDF/Office Documents, Zalo Stickers, and Emoji Reactions** in real time between Web and Mobile!

---

## 7. Troubleshooting

| Symptom | Cause & Quick Fix |
| :--- | :--- |
| Phone cannot reach `http://192.168.x.x:3000` (`Quá thời gian chờ`) | 1. Ensure Docker containers are healthy (`docker compose ps`).<br>2. Ensure phone and PC are on the **same Wi-Fi SSID** (not a guest VLAN).<br>3. On Windows, allow inbound TCP port `3000` (and `8081` for Metro) in Windows Defender Firewall, or connect to your AWS EC2 endpoint instead. |
| QR code loads bundle slowly or fails on campus Wi-Fi | Run `npx expo start --tunnel` so Metro tunnels JS bundles over HTTPS. |
| Environment variable change in `.env` not reflected | Restart Metro with cache cleared: `npx expo start -c`. |
