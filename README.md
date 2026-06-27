# JCP Application Automator & CV Downloader

An automated pipeline designed to help UK employers streamline the process of receiving, parsing, and organizing candidate job applications from "Job Centre Plus" (JCP) and DWP Work Hub emails (`.eml` formats or raw copy-pasted text).

Instead of manually navigating secure government candidate CV download portals (`documents.service.gov.uk`) for dozens of candidates, inputting your registered employer email to complete access gates, downloading PDF CVs individually, and manually typing out applicant details, this application automates the entire flow.

---

## 🚀 Key Features

- **Multi-Format Application Ingestion**: Upload folders of `.eml` email files directly, or copy-paste raw notification emails into the queue.
- **Robust Portal Link Extraction**: Automatically identifies and extracts secure CV portal links (e.g., `documents.service.gov.uk`) from email content, handling percent-encoding, SafeLinks wrappers, and quoted-printable soft-wraps flawlessly.
- **Automated CV Portal Gate Clearance**: Interacts programmatically with the CV portal gate using your configured registered employer email to obtain secure CV documents without manual browser clicks.
- **Hybrid AI & Heuristic Parsing**:
  - **Deterministic Parser**: Fallback regex-based extraction of reference numbers, names, and links.
  - **Gemini Flash AI Model**: Extracts applicant names, job titles, vacancy reference numbers, and cover letter text with human-level accuracy using the modern `@google/genai` SDK.
- **Structured File Bundling**: Organizes extracted documents (PDF CVs and text cover letters) into custom numbered directories (e.g., `01_Samantha_Watmore/`) and compiles them into a single, downloadable ZIP bundle.
- **Real-Time Execution Logs**: Live monitoring interface showing the exact pipeline status of every candidate in the batch processing queue.

---

## 🛠️ Architecture

The application is built on a full-stack architecture using:
- **Frontend**: Single-Page Application (SPA) powered by **React 19**, **Vite**, and **Tailwind CSS**, with interactive states, drag-and-drop file uploads, and a visual logging terminal.
- **Backend**: **Node.js + Express** server handling `.eml` parsing, secure HTTP sessions, cookies, and file compression.
- **AI Processing**: Gemini Flash model powered by the `@google/genai` TypeScript SDK.

---

## 📋 Requirements & System Dependencies

- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **Package Manager**: `npm` (bundled with Node.js)
- **API Access**: A **Gemini API Key** from Google AI Studio (optional but highly recommended for AI-driven parsing accuracy).

---

## ⚙️ Installation & Setup

Follow these steps to run the application on your local machine:

### 1. Clone the Repository
```bash
git clone <your-repo-url>
cd <your-repo-directory>
```

### 2. Install Dependencies
Install all package dependencies defined in `package.json`:
```bash
npm install
```

### 3. Configure Environment Variables
Create a local `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

Edit your `.env` file to add your API Key and server URL:
```env
# Google Gemini API key for parsing email contents (Optional if key is supplied in UI)
GEMINI_API_KEY="your_api_key_here"

# The local host URL where your app runs
APP_URL="http://localhost:3000"
```

---

## 🚦 How to Run the App Locally

### Development Mode
Runs the frontend with Vite's rapid asset-serving middleware alongside the backend TypeScript server using `tsx`:
```bash
npm run dev
```
Once started, open your browser and navigate to:
👉 **`http://localhost:3000`**

### Production Build & Launch
To build the application for optimal production deployment (bundles backend TypeScript files with `esbuild` and optimizes the React client):
```bash
# 1. Compile the client and bundle the CJS backend server
npm run build

# 2. Start the optimized standalone Node.js server
npm run start
```

---

## 🧩 Key Scripts Breakdown

- `npm run dev`: Boots up the Express server on port `3000` with hot-reloading using `tsx`.
- `npm run build`: Compiles the React client to static files inside `/dist`, and bundles `server.ts` into a fast, standalone production build at `/dist/server.cjs` using `esbuild`.
- `npm run start`: Runs the pre-compiled server in production mode.
- `npm run lint`: Executes TypeScript non-emitting checks (`tsc --noEmit`) to verify strict type safety across files.

---

## 🔒 Security & Privacy

- **API Key Secrecy**: The Gemini API Key is never exposed to the client-side browser code. API calls are proxied securely through server-side endpoints (`/api/parse-email`).
- **Secure Portal Gates**: Registered employer credentials or email tokens used to clear portal downloads are processed in memory and never persisted externally.
- **Self-Cleaning Storage**: Extracted files and generated ZIP bundles are compiled on-the-fly and are stored under secure session boundaries.
