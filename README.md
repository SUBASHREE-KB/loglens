# LogLens

> **Real-Time AI-Powered Root Cause Analysis for Microservices**

*"From Error to Fix in Seconds, Not Hours"*

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/docker-required-blue.svg)](https://docker.com)
[![AI](https://img.shields.io/badge/AI-Google%20Gemini-orange.svg)](https://ai.google.dev)

---

## Overview

LogLens is an intelligent observability platform that transforms microservice debugging from hours of manual investigation into seconds of automated analysis. It monitors your Docker containers in real-time, detects errors instantly, identifies root causes using AI, visualizes error propagation, and generates production-ready code fixes.

**How it works:**
- You run your microservices in Docker containers
- LogLens monitors those containers and streams their logs
- When errors occur, AI analyzes the root cause
- You configure your source code path so LogLens can generate fixes

**The Problem:** When a microservice fails at 3 AM, engineers spend hours grep-ing through logs, correlating events across services, and tracing error propagation. By the time the root cause is found, users have suffered and revenue has been lost.

**The Solution:** LogLens automates this entire workflow. It watches your services, detects errors the moment they happen, uses AI to understand what went wrong, shows you exactly where the problem is in your code, and generates a fix you can apply with one click.

---

## Key Features

- **Real-Time Log Streaming** - Live collection from your Docker containers
- **AI-Powered Root Cause Analysis** - Google Gemini identifies why errors occurred
- **Code Location Detection** - Pinpoints exact file, function, and line number
- **Automated Fix Generation** - Produces production-ready code fixes
- **Attack Graph Visualization** - Interactive diagram showing error propagation
- **Predictive Insights** - ML-based predictions for error trends
- **Service Health Monitoring** - Real-time CPU, memory, network metrics

---

## Prerequisites

### Required Software

| Software | Version | Installation | Purpose |
|----------|---------|--------------|---------|
| **Node.js** | >= 18.0.0 | [nodejs.org](https://nodejs.org) | Runtime for LogLens |
| **npm** | >= 9.0.0 | Included with Node.js | Package management |
| **Docker Desktop** | >= 24.0.0 | [docker.com](https://docker.com) | Your microservices run here |
| **Git** | >= 2.40.0 | [git-scm.com](https://git-scm.com) | Clone repository |

### Required API Key

| Service | Purpose | How to Get |
|---------|---------|------------|
| **Google Gemini API** | AI-powered analysis and fix generation | [Google AI Studio](https://aistudio.google.com/app/apikey) (Free tier available) |

### Your Setup Requirements

For LogLens to work, you need:

1. **Docker containers running** - Your microservices must be running in Docker
2. **Source code accessible** - Either locally on your machine OR via GitHub
3. **Docker Desktop running** - LogLens connects to Docker to stream logs

---

## Installation

### Step 1: Clone the Repository

```bash
git clone https://github.com/SUBASHREE-KB/loglens.git
cd loglens
```

### Step 2: Install Backend Dependencies

```bash
cd backend
npm install
```

### Step 3: Install Frontend Dependencies

```bash
cd ../frontend
npm install
```

### Step 4: Configure Environment Variables

```bash
# Go back to root directory
cd ..

# Create .env file

```

Edit the `.env` file with your settings:

```env
# REQUIRED: Your Google Gemini API Key
GEMINI_API_KEY=your_gemini_api_key_here

# Backend server port
PORT=4000

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:5173

# Service Discovery Mode
# - auto: Discovers all running Docker containers
# - manual: Only monitor specific containers (set MANUAL_SERVICES)
# - pattern: Match containers by regex (set SERVICE_PATTERNS)
DISCOVERY_MODE=auto

# For manual mode - comma-separated container names
# MANUAL_SERVICES=my-api,my-database,my-worker

# For pattern mode - regex patterns
# SERVICE_PATTERNS=^myapp-.*

# Optional: Supabase for data persistence
# Without this, data is stored in memory and lost on restart
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_KEY=your_supabase_anon_key

```

---

## Running LogLens

### Step 1: Make Sure Docker Desktop is Running

LogLens connects to Docker to monitor your containers. Ensure Docker Desktop is running.

### Step 2: Make Sure Your Microservices are Running in Docker

LogLens monitors Docker containers. You need your own services running:

```bash
# Example: If you have your own docker-compose
cd /path/to/your/project
docker-compose up -d

# Verify containers are running
docker ps
```

### Step 3: Start LogLens Backend

Open a terminal:

```bash
cd backend
npm run dev
```

You should see:
```
[Server] Initializing agents...
[SourceCodeManager] Initialized in local mode
[LogDatabase] Ready (mode: in-memory)
[Server] LogLens Backend running on port 4000
```

### Step 4: Start LogLens Frontend

Open another terminal:

```bash
cd frontend
npm run dev
```

You should see:
```
VITE v5.0.8  ready in 500 ms

➜  Local:   http://localhost:5173/
```

### Step 5: Open the Dashboard

Open your browser and go to: **http://localhost:5173**

---

## Configuration Guide

### Configuring Service Discovery

LogLens auto-discovers Docker containers. Configure via the **Settings** page:

| Mode | Description |
|------|-------------|
| **Auto** | Monitor ALL running Docker containers |
| **Manual** | Monitor only specific containers you specify |
| **Pattern** | Match containers using regex patterns |

By default, LogLens uses **Auto** mode and discovers all running containers.

### Configuring Source Code Access (For Fix Generation)

For LogLens to generate code fixes, it needs access to your source code. Configure this from the **Settings** page in the dashboard:

1. Open LogLens dashboard (http://localhost:5173)
2. Click **Settings** in the sidebar
3. Under **Source Code Configuration**, choose:

| Mode | Description |
|------|-------------|
| **Local Path** | Browse and select your services folder on your machine |
| **GitHub** | Enter your GitHub token, repository, and branch |
| **None** | Disable fix generation (analysis still works) |

**For Local Path:** Your folder structure should look like:
```
your-services-folder/
├── api-gateway/
│   └── index.js
├── user-service/
│   └── index.js
└── db-service/
    └── index.js
```

The folder names should match your Docker container names.

---

## Usage Guide

### 1. Dashboard Overview

When you open LogLens, you'll see:
- **Service Cards** - Health status of each monitored Docker container
- **Live Log Stream** - Real-time logs from all containers
- **Recent Errors** - Clickable list of detected errors
- **System Metrics** - CPU, memory, request counts

### 2. Analyzing an Error

1. Click any error in the **Recent Errors** panel
2. LogLens triggers the AI analysis pipeline:
   - Correlates related logs within ±30 seconds
   - AI identifies root cause and severity
   - Locates exact code causing the issue
3. View the analysis results:
   - Root cause explanation
   - Error propagation path (Attack Graph)
   - Code location (file:line)
   - Recommended actions

### 3. Generating a Fix

1. After analysis, click **"Generate Smart Fix"**
2. AI reads your source code and generates a fix
3. Review the diff:
   - Left: Original code
   - Right: Fixed code
   - Explanation of changes
4. Click **"Apply Fix"** to apply (creates automatic backup)

**Note:** First configure your source code path in **Settings** page (local folder or GitHub).

### 4. Attack Graph

The Attack Graph visualizes error propagation:
- **Red nodes** - Error origin service
- **Orange nodes** - Affected services
- **Edges** - Error propagation path

### 5. Predictive Insights

Navigate to **Insights** page to see:
- Error trend predictions
- Resource exhaustion warnings
- Recurring pattern alerts

---

## Project Structure

```
loglens/
├── backend/
│   ├── server.js              # Main Express server
│   ├── agents/                # AI analysis agents
│   │   ├── AnalyzerAgent.js   # Root cause analysis (Gemini AI)
│   │   ├── CodeFixAgent.js    # Fix generation (Gemini AI)
│   │   ├── CodeLocatorAgent.js # Code location (Gemini AI)
│   │   ├── CorrelatorAgent.js # Log correlation (rule-based)
│   │   └── MonitorAgent.js    # Metrics collection
│   ├── collectors/
│   │   └── LogCollector.js    # Docker log streaming
│   ├── database/
│   │   └── LogDatabase.js     # In-memory + Supabase storage
│   ├── services/
│   │   ├── ServiceDiscovery.js    # Docker container discovery
│   │   └── SourceCodeManager.js   # Local/GitHub code access
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/        # React components
│   │   ├── pages/             # Page components
│   │   ├── hooks/             # Custom hooks (useSocket)
│   │   └── App.jsx
│   └── package.json
├── .env                       # Environment 
├── ARCHITECTURE.md            # System architecture
└── README.md
```

---

## Technologies Used

### Backend
| Technology | Purpose |
|------------|---------|
| Node.js 18+ | Runtime environment |
| Express.js | Web server |
| Socket.io | Real-time WebSocket communication |
| LangChain | AI orchestration |
| Google Gemini | Large language model (AI analysis) |
| Dockerode | Docker API client |

### Frontend
| Technology | Purpose |
|------------|---------|
| React 18 | UI framework |
| Vite | Build tool |
| React Flow | Graph visualization (Attack Graph) |
| Recharts | Charts and analytics |
| TailwindCSS | Styling |
| Socket.io Client | WebSocket client |

---

## Troubleshooting

### "No services discovered"
- Make sure Docker Desktop is running
- Make sure you have containers running: `docker ps`
- Check discovery mode in Settings

### "Could not generate fix"
- Go to **Settings** page and configure your source code path
- For Local Path: browse and select the folder containing your service code
- For GitHub: enter your personal access token and repository details
- Make sure folder names match your Docker container names

### "WebSocket connection failed"
- Make sure backend is running on port 4000
- Check if another process is using port 4000

### "No API key" warnings
- Add `GEMINI_API_KEY` to your `.env` file
- Get a free key from [Google AI Studio](https://aistudio.google.com/app/apikey)

### Docker socket permission denied (Linux/Mac)
```bash
sudo chmod 666 /var/run/docker.sock
# Or add user to docker group:
sudo usermod -aG docker $USER
```

---

## API Reference

### REST Endpoints (Backend: http://localhost:4000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/api/logs` | Get recent logs |
| `GET` | `/api/metrics` | Get current metrics |
| `POST` | `/api/analyze-error` | Trigger error analysis |
| `POST` | `/api/generate-fix` | Generate code fix |
| `GET` | `/api/source-code/status` | Get source code config |
| `POST` | `/api/source-code/configure` | Update source code config |

### WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `logs-batch` | Server → Client | New log entries |
| `metrics-update` | Server → Client | Service metrics |
| `error-detected` | Server → Client | Error notification |
| `analysis-complete` | Server → Client | Analysis results |
| `trigger-analysis` | Client → Server | Request analysis |

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- [Google Gemini](https://ai.google.dev/) for AI capabilities
- [LangChain](https://js.langchain.com/) for AI orchestration
- [React Flow](https://reactflow.dev/) for graph visualization


