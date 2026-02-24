# LogLens

> **Real-Time AI-Powered Root Cause Analysis for Microservices**

*"From Error to Fix in Seconds, Not Hours"*

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/docker-required-blue.svg)](https://docker.com)
[![AI](https://img.shields.io/badge/AI-Google%20Gemini-orange.svg)](https://ai.google.dev)

---

## Overview

LogLens is an intelligent observability platform that transforms microservice debugging from hours of manual investigation into seconds of automated analysis. It monitors distributed systems in real-time, detects errors instantly, identifies root causes using AI, visualizes error propagation, and generates production-ready code fixes.

**The Problem:** When a microservice fails at 3 AM, engineers spend hours grep-ing through logs, correlating events across services, and tracing error propagation. By the time the root cause is found, users have suffered and revenue has been lost.

**The Solution:** LogLens automates this entire workflow. It watches your services, detects errors the moment they happen, uses AI to understand what went wrong, shows you exactly where the problem is in your code, and generates a fix you can apply with one click.

---

## Key Features

### AI-Powered Analysis
- **Root Cause Identification** - Google Gemini analyzes logs and identifies the exact technical failure
- **Code Location Detection** - Pinpoints the exact file, function, and line number causing issues
- **Automated Fix Generation** - Produces production-ready code fixes with explanations
- **Error Classification** - Categorizes errors (timeout, memory leak, null pointer, etc.)

### Real-Time Monitoring
- **Live Log Streaming** - Aggregates logs from all Docker containers in real-time
- **Pattern Detection** - Automatically detects errors, warnings, timeouts, and failures
- **Service Health Metrics** - CPU, memory, network I/O per service
- **Predictive Insights** - ML-based predictions for error spikes and resource exhaustion

### Visualization
- **Attack Graph** - Interactive visualization showing how errors propagate across services
- **Error Timeline** - Chronological view of error events
- **Code Diff Viewer** - Side-by-side comparison of original and fixed code
- **Health Dashboard** - Real-time service status overview

### Flexibility
- **Auto Service Discovery** - Automatically detects Docker containers
- **GitHub Integration** - Analyze code directly from repositories
- **Local Source Support** - Works with local codebases
- **Data Export** - Export logs and analytics as JSON/CSV

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                 LogLens                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────┐          ┌─────────────────┐          ┌─────────────┐ │
│   │    Frontend     │◀────────▶│     Backend     │◀────────▶│   Docker    │ │
│   │   React/Vite    │ WebSocket│   Express.js    │  API     │   Engine    │ │
│   │   Port: 5173    │          │   Port: 4000    │          │             │ │
│   └─────────────────┘          └────────┬────────┘          └─────────────┘ │
│                                         │                                    │
│                          ┌──────────────┼──────────────┐                    │
│                          ▼              ▼              ▼                    │
│                    ┌──────────┐  ┌──────────┐  ┌──────────┐                 │
│                    │Correlator│  │ Analyzer │  │   Fix    │                 │
│                    │  Agent   │  │  Agent   │  │Generator │                 │
│                    │(JS-based)│  │(Gemini AI)│ │(Gemini AI)│                │
│                    └──────────┘  └──────────┘  └──────────┘                 │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                           Monitored Microservices                            │
│   ┌───────────────┐    ┌───────────────┐    ┌───────────────┐              │
│   │  API Gateway  │───▶│ User Service  │───▶│  DB Service   │              │
│   │   Port:3001   │    │   Port:3002   │    │   Port:3003   │              │
│   └───────────────┘    └───────────────┘    └───────────────┘              │
└─────────────────────────────────────────────────────────────────────────────┘
```

For detailed architecture, see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Prerequisites

| Requirement | Version | Installation |
|-------------|---------|--------------|
| **Node.js** | >= 18.0.0 | [nodejs.org](https://nodejs.org) |
| **npm** | >= 9.0.0 | Included with Node.js |
| **Docker** | >= 24.0.0 | [docker.com](https://docker.com) |
| **Docker Compose** | >= 2.20.0 | Included with Docker Desktop |
| **Git** | >= 2.40.0 | [git-scm.com](https://git-scm.com) |

### API Keys Required

| Service | Purpose | Get Key |
|---------|---------|---------|
| **Google Gemini** | AI analysis | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| **Supabase** (Optional) | Cloud persistence | [Supabase](https://supabase.com/dashboard) |

---

## Quick Start

### Step 1: Clone the Repository

```bash
git clone https://github.com/yourusername/loglens.git
cd loglens
```

### Step 2: Configure Environment

```bash
# Copy example environment file
cp .env.example .env
```

Edit `.env` and add your Gemini API key:

```env
# Required
GEMINI_API_KEY=your_gemini_api_key_here

# Optional
PORT=4000
FRONTEND_URL=http://localhost:5173
DISCOVERY_MODE=auto
SOURCE_CODE_MODE=local
```

### Step 3: Install Dependencies

```bash
# Backend dependencies
cd backend
npm install

# Frontend dependencies
cd ../frontend
npm install

# Return to root
cd ..
```

### Step 4: Start the Application

**Option A: Using Docker Compose (Recommended)**

```bash
# Start all services (microservices + backend + frontend)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

**Option B: Manual Start (Development)**

```bash
# Terminal 1: Start demo microservices
docker-compose -f docker-compose.services.yml up -d

# Terminal 2: Start backend
cd backend
npm run dev

# Terminal 3: Start frontend
cd frontend
npm run dev
```

### Step 5: Access the Dashboard

Open **http://localhost:5173** in your browser.

---

## Application URLs

| Service | URL | Description |
|---------|-----|-------------|
| **Dashboard** | http://localhost:5173 | Main LogLens interface |
| **Backend API** | http://localhost:4000 | REST API and WebSocket |
| **API Gateway** | http://localhost:3001 | Demo microservice |
| **User Service** | http://localhost:3002 | Demo microservice |
| **DB Service** | http://localhost:3003 | Demo microservice |

---

## Usage Guide

### 1. Dashboard Overview

When you open LogLens, you'll see:
- **Service Cards** - Health status of each monitored service
- **Live Log Stream** - Real-time logs from all services
- **Recent Errors** - Clickable list of detected errors
- **System Metrics** - CPU, memory, request counts

### 2. Analyzing an Error

1. Click any error in the **Recent Errors** panel
2. LogLens triggers the AI analysis pipeline:
   - Correlates related logs within ±30 seconds
   - AI identifies root cause and severity
   - Locates exact code causing the issue
3. View the analysis:
   - Root cause explanation
   - Error propagation path
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

### 4. Attack Graph

The Attack Graph visualizes error propagation:
- **Red nodes** - Error origin service
- **Orange nodes** - Affected services
- **Edges** - Error propagation path
- **Labels** - Error types and severity

### 5. Predictive Insights

Navigate to the **Insights** page to see:
- Error trend predictions
- Resource exhaustion warnings
- Recurring pattern alerts
- Historical analytics

---

## Configuration

### Discovery Modes

| Mode | Description | Configuration |
|------|-------------|---------------|
| `auto` | Discovers all running containers | `DISCOVERY_MODE=auto` |
| `manual` | Monitor specific containers | `MANUAL_SERVICES=api,db,auth` |
| `pattern` | Regex-based matching | `SERVICE_PATTERNS=^myapp-.*` |

### Source Code Access

**Local Mode:**
```env
SOURCE_CODE_MODE=local
LOCAL_CODE_PATH=../services
```

**GitHub Mode:**
```env
SOURCE_CODE_MODE=github
GITHUB_TOKEN=ghp_xxxxxxxxxxxx
GITHUB_REPO=username/repository
GITHUB_BRANCH=main
```

### Database Persistence (Optional)

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_anon_key
```

---

## Project Structure

```
loglens/
├── backend/
│   ├── server.js              # Main Express server
│   ├── agents/                # AI analysis agents
│   │   ├── AnalyzerAgent.js   # Root cause analysis
│   │   ├── CodeFixAgent.js    # Code fix generation
│   │   ├── CodeLocatorAgent.js # Code location
│   │   ├── CorrelatorAgent.js # Log correlation
│   │   ├── FixGeneratorAgent.js # Fix generation
│   │   └── MonitorAgent.js    # Metrics collection
│   ├── collectors/            # Log collection
│   ├── database/              # Persistence layer
│   ├── services/              # Service discovery
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/        # React components
│   │   ├── pages/             # Page components
│   │   ├── hooks/             # Custom hooks
│   │   └── App.jsx
│   └── package.json
├── services/                  # Demo microservices
│   ├── api-gateway/
│   ├── user-service/
│   ├── db-service/
│   ├── auth-service/
│   └── order-service/
├── docker-compose.yml         # Full stack
├── docker-compose.services.yml # Services only
├── .env.example               # Environment template
├── ARCHITECTURE.md            # System architecture
└── README.md
```

---

## Technologies Used

### Backend
| Technology | Purpose |
|------------|---------|
| Node.js | Runtime environment |
| Express.js | Web framework |
| Socket.io | Real-time WebSocket communication |
| LangChain | AI orchestration framework |
| Google Gemini | Large language model for analysis |
| Dockerode | Docker API integration |
| Supabase | PostgreSQL cloud database |

### Frontend
| Technology | Purpose |
|------------|---------|
| React 18 | UI framework |
| Vite | Build tool |
| React Flow | Graph visualization |
| Recharts | Charts and analytics |
| TailwindCSS | Utility-first styling |
| Socket.io Client | WebSocket client |
| Lucide React | Icon library |

### Infrastructure
| Technology | Purpose |
|------------|---------|
| Docker | Containerization |
| Docker Compose | Multi-container orchestration |

---

## API Reference

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/api/logs` | Get recent logs |
| `GET` | `/api/metrics` | Get current metrics |
| `POST` | `/api/analyze-error` | Trigger error analysis |
| `POST` | `/api/generate-fix` | Generate code fix |
| `POST` | `/api/apply-targeted-fix` | Apply fix to source |
| `GET` | `/api/predictions/generate` | Generate insights |
| `POST` | `/api/export/full` | Export data |

### WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `logs-batch` | Server → Client | New log entries |
| `metrics-update` | Server → Client | Service metrics |
| `error-detected` | Server → Client | Error notification |
| `analysis-complete` | Server → Client | Analysis results |
| `trigger-analysis` | Client → Server | Request analysis |

---

## Troubleshooting

### Docker Socket Permission Denied
```bash
# Linux/Mac
sudo chmod 666 /var/run/docker.sock
# Or add user to docker group
sudo usermod -aG docker $USER
```

### Containers Not Discovered
- Verify Docker is running: `docker ps`
- Check discovery mode in Settings
- Ensure containers have proper labels

### AI Analysis Not Working
- Verify GEMINI_API_KEY is set correctly
- Check backend logs for API errors
- System falls back to rule-based analysis if AI unavailable

### WebSocket Connection Failed
- Ensure backend is running on port 4000
- Check CORS settings
- Verify FRONTEND_URL environment variable

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- [Google Gemini](https://ai.google.dev/) for AI capabilities
- [LangChain](https://js.langchain.com/) for AI orchestration
- [React Flow](https://reactflow.dev/) for graph visualization
- [Supabase](https://supabase.com/) for database services

---

**Built for DevDash 2026**

*LogLens - From Error to Fix in Seconds, Not Hours*
