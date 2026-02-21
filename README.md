# QuickShare (Kabada)

A secure file sharing application with real-time updates, clipboard sharing, and messaging features.

## Features

- 📁 **File Sharing** - Upload and share files with password protection
- 📋 **Clipboard Sharing** - Share text snippets across devices
- 💬 **Messaging** - Real-time chat within containers
- 🔒 **Password Protection** - Secure access with passwords
- 👁️ **View Limits** - Set maximum views for containers
- 🔐 **Read-Only Mode** - Admin-controlled upload access
- ⚡ **Real-time Updates** - Socket.IO powered live updates

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS
- **Backend**: Node.js, Express, Socket.IO
- **Database**: MongoDB Atlas
- **File Storage**: Cloudinary
- **Deployment**: Vercel (frontend), Render (backend)

## Quick Start

### Prerequisites

- Node.js 18+
- MongoDB Atlas account
- Cloudinary account

### Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your credentials
npm run dev
```

### Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
# Edit .env with your API URL
npm run dev
```

## Environment Variables

### Backend (.env)

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 5000) |
| `NODE_ENV` | Environment (development/production) |
| `MONGODB_URI` | MongoDB connection string |
| `FRONTEND_URL` | Frontend URL for CORS |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `MAX_FILE_SIZE` | Max upload size in bytes |

### Frontend (.env)

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend API URL |

## Deployment

### Backend (Render)

1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Set root directory to `backend`
4. Set build command: `npm install`
5. Set start command: `npm start`
6. Add environment variables from `.env.example`

### Frontend (Vercel)

1. Import project on Vercel
2. Set root directory to `frontend`
3. Add `VITE_API_URL` environment variable pointing to your backend

## Troubleshooting

### MongoDB Connection Error

If you see "Could not connect to any servers in your MongoDB Atlas cluster":

1. **Check if cluster is paused** - Free tier clusters pause after 60 days of inactivity. Resume from Atlas dashboard.
2. **Verify IP whitelist** - Add `0.0.0.0/0` to allow all IPs (or your specific IP).
3. **Check credentials** - Ensure username/password are correct. URL-encode special characters.

## License

MIT
