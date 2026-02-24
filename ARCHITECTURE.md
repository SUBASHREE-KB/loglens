# LogLens System Architecture

This document provides a comprehensive overview of the LogLens system architecture, including component interactions, data flow, and design decisions.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [High-Level Architecture](#high-level-architecture)
3. [Component Architecture](#component-architecture)
4. [AI Analysis Pipeline](#ai-analysis-pipeline)
5. [Data Flow](#data-flow)
6. [Frontend Architecture](#frontend-architecture)
7. [Backend Architecture](#backend-architecture)
8. [Database Schema](#database-schema)
9. [Communication Protocols](#communication-protocols)
10. [Security Considerations](#security-considerations)
11. [Scalability](#scalability)

---

## System Overview

LogLens is a real-time observability platform designed to:

1. **Monitor** - Continuously stream logs from Docker containers
2. **Detect** - Identify errors, warnings, and anomalies automatically
3. **Analyze** - Use AI to determine root causes and severity
4. **Locate** - Pinpoint exact code locations causing issues
5. **Fix** - Generate production-ready code fixes
6. **Visualize** - Display error propagation through interactive graphs

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                    LogLens                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │                            PRESENTATION LAYER                               │ │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐   │ │
│  │  │  Dashboard  │ │   Logs      │ │  Insights   │ │    Settings         │   │ │
│  │  │    Page     │ │   View      │ │    Page     │ │      Page           │   │ │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────────┘   │ │
│  │                                                                              │ │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐   │ │
│  │  │  ErrorPanel │ │ AttackGraph │ │  LogStream  │ │    ServiceHealth    │   │ │
│  │  │  Component  │ │  Component  │ │  Component  │ │     Component       │   │ │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────────┘   │ │
│  │                           React 18 + Vite + TailwindCSS                      │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                        │                                         │
│                                        │ WebSocket (Socket.io)                   │
│                                        ▼                                         │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │                            APPLICATION LAYER                                │ │
│  │                                                                              │ │
│  │  ┌──────────────────────────────────────────────────────────────────────┐   │ │
│  │  │                         Express.js Server                             │   │ │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐   │   │ │
│  │  │  │   REST API  │  │  WebSocket  │  │   Service   │  │   Source   │   │   │ │
│  │  │  │   Router    │  │   Handler   │  │  Discovery  │  │   Code Mgr │   │   │ │
│  │  │  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘   │   │ │
│  │  └──────────────────────────────────────────────────────────────────────┘   │ │
│  │                                        │                                     │ │
│  │                                        ▼                                     │ │
│  │  ┌──────────────────────────────────────────────────────────────────────┐   │ │
│  │  │                       AI ANALYSIS PIPELINE                            │   │ │
│  │  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────┐  │   │ │
│  │  │  │ Correlator │──▶│  Analyzer  │──▶│   Code     │──▶│     Fix       │  │   │ │
│  │  │  │   Agent    │  │   Agent    │  │  Locator   │  │   Generator   │  │   │ │
│  │  │  │ (JS-based) │  │(Gemini AI) │  │(Gemini AI) │  │  (Gemini AI)  │  │   │ │
│  │  │  └────────────┘  └────────────┘  └────────────┘  └────────────────┘  │   │ │
│  │  └──────────────────────────────────────────────────────────────────────┘   │ │
│  │                                        │                                     │ │
│  │  ┌──────────────────────────────────────────────────────────────────────┐   │ │
│  │  │                          DATA COLLECTORS                              │   │ │
│  │  │  ┌─────────────────────┐              ┌─────────────────────┐         │   │ │
│  │  │  │    LogCollector     │              │    MonitorAgent     │         │   │ │
│  │  │  │  (Docker log -f)    │              │   (Docker stats)    │         │   │ │
│  │  │  └─────────────────────┘              └─────────────────────┘         │   │ │
│  │  └──────────────────────────────────────────────────────────────────────┘   │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                        │                                         │
│                                        │ Docker Socket API                       │
│                                        ▼                                         │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │                          INFRASTRUCTURE LAYER                               │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐    │ │
│  │  │ API Gateway │  │User Service │  │ DB Service  │  │  Auth Service   │    │ │
│  │  │  Port:3001  │  │  Port:3002  │  │  Port:3003  │  │   Port:3004     │    │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘    │ │
│  │                           Docker Containers                                  │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │                            PERSISTENCE LAYER                                │ │
│  │  ┌───────────────────────────┐      ┌───────────────────────────────────┐  │ │
│  │  │   In-Memory Database      │      │    Supabase (PostgreSQL)          │  │ │
│  │  │   (Always Available)      │ OR   │    (Optional Cloud Persistence)   │  │ │
│  │  └───────────────────────────┘      └───────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Architecture

### Frontend Components

```
┌─────────────────────────────────────────────────────────────────┐
│                        App.jsx (Root)                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    React Router                            │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────────┐  │  │
│  │  │Dashboard│ │LogsView │ │Insights │ │    Settings     │  │  │
│  │  │  Page   │ │  Page   │ │  Page   │ │      Page       │  │  │
│  │  └────┬────┘ └────┬────┘ └────┬────┘ └────────┬────────┘  │  │
│  └───────┼──────────┼───────────┼────────────────┼───────────┘  │
│          │          │           │                │              │
│          ▼          ▼           ▼                ▼              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Shared Components                       │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │  │
│  │  │ErrorPanel│ │AttackGrap│ │LogStream │ │ServiceHealth │  │  │
│  │  │          │ │          │ │          │ │              │  │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │  │
│  │  │CodeDiff  │ │Timeline  │ │Recent    │ │Predictive    │  │  │
│  │  │Viewer    │ │Player    │ │Errors    │ │Insights      │  │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   useSocket Hook                           │  │
│  │  • Manages WebSocket connection                            │  │
│  │  • Handles event subscriptions                             │  │
│  │  • Provides real-time state updates                        │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Backend Components

```
┌─────────────────────────────────────────────────────────────────┐
│                      server.js (Main)                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   Express Application                      │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐  │  │
│  │  │  REST API   │ │   Socket.io │ │   Static Serving    │  │  │
│  │  │   Routes    │ │   Handler   │ │   (Production)      │  │  │
│  │  └─────────────┘ └─────────────┘ └─────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│          ┌───────────────────┼───────────────────┐              │
│          ▼                   ▼                   ▼              │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐    │
│  │ServiceDiscov │   │ LogCollector │   │   MonitorAgent   │    │
│  │              │   │              │   │                  │    │
│  │• Auto-detect │   │• docker logs │   │• docker stats    │    │
│  │• Pattern     │   │• Parse logs  │   │• CPU, Memory     │    │
│  │• Manual      │   │• Detect errs │   │• Network I/O     │    │
│  └──────────────┘   └──────────────┘   └──────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    AI Analysis Pipeline                    │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────────────┐   │  │
│  │  │Correlator  │─▶│ Analyzer   │─▶│  CodeLocator       │   │  │
│  │  │Agent       │  │ Agent      │  │  Agent             │   │  │
│  │  └────────────┘  └────────────┘  └────────────────────┘   │  │
│  │                         │                                  │  │
│  │                         ▼                                  │  │
│  │  ┌────────────────────────────────────────────────────┐   │  │
│  │  │              FixGenerator / CodeFixAgent            │   │  │
│  │  │  • Read source code via SourceCodeManager           │   │  │
│  │  │  • Generate AI-powered fixes                        │   │  │
│  │  │  • Apply with backup creation                       │   │  │
│  │  └────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Data Layer                              │  │
│  │  ┌─────────────────────┐   ┌─────────────────────────┐    │  │
│  │  │   LogDatabase       │   │   SourceCodeManager     │    │  │
│  │  │   (In-mem/Supabase) │   │   (Local/GitHub)        │    │  │
│  │  └─────────────────────┘   └─────────────────────────┘    │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## AI Analysis Pipeline

The core of LogLens is a multi-stage AI analysis pipeline:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          AI ANALYSIS PIPELINE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────┐                                                           │
│   │ Error Event │                                                           │
│   │  Detected   │                                                           │
│   └──────┬──────┘                                                           │
│          │                                                                   │
│          ▼                                                                   │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │                    STAGE 1: CORRELATION                               │  │
│   │  ┌─────────────────────────────────────────────────────────────────┐ │  │
│   │  │                    CorrelatorAgent                               │ │  │
│   │  │                                                                  │ │  │
│   │  │  INPUT:  Error log entry                                         │ │  │
│   │  │  PROCESS:                                                        │ │  │
│   │  │    • Find all logs within ±30 second time window                 │ │  │
│   │  │    • Group logs by service                                       │ │  │
│   │  │    • Identify affected services                                  │ │  │
│   │  │    • Determine origin service                                    │ │  │
│   │  │    • Extract error patterns                                      │ │  │
│   │  │  OUTPUT: Correlated log chain with metadata                      │ │  │
│   │  │                                                                  │ │  │
│   │  │  TYPE: JavaScript rule-based (no AI)                             │ │  │
│   │  └─────────────────────────────────────────────────────────────────┘ │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│          │                                                                   │
│          ▼                                                                   │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │                    STAGE 2: ANALYSIS                                  │  │
│   │  ┌─────────────────────────────────────────────────────────────────┐ │  │
│   │  │                    AnalyzerAgent                                 │ │  │
│   │  │                                                                  │ │  │
│   │  │  INPUT:  Correlated logs, error context                          │ │  │
│   │  │  PROCESS:                                                        │ │  │
│   │  │    • Send prompt to Google Gemini                                │ │  │
│   │  │    • Analyze root cause                                          │ │  │
│   │  │    • Classify error type                                         │ │  │
│   │  │    • Assess severity (LOW/MEDIUM/HIGH/CRITICAL)                  │ │  │
│   │  │    • Identify propagation path                                   │ │  │
│   │  │    • Generate recommendations                                    │ │  │
│   │  │  OUTPUT: Structured analysis JSON                                │ │  │
│   │  │                                                                  │ │  │
│   │  │  TYPE: AI-powered (Google Gemini)                                │ │  │
│   │  │  MODEL: gemini-2.5-flash                                         │ │  │
│   │  │  TIMEOUT: 60 seconds                                             │ │  │
│   │  └─────────────────────────────────────────────────────────────────┘ │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│          │                                                                   │
│          ▼                                                                   │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │                    STAGE 3: CODE LOCATION                             │  │
│   │  ┌─────────────────────────────────────────────────────────────────┐ │  │
│   │  │                   CodeLocatorAgent                               │ │  │
│   │  │                                                                  │ │  │
│   │  │  INPUT:  Analysis results, service name                          │ │  │
│   │  │  PROCESS:                                                        │ │  │
│   │  │    • Read source files via SourceCodeManager                     │ │  │
│   │  │    • Analyze code with AI                                        │ │  │
│   │  │    • Identify exact file, function, line                         │ │  │
│   │  │    • Extract relevant code snippet                               │ │  │
│   │  │  OUTPUT: Code location with context                              │ │  │
│   │  │                                                                  │ │  │
│   │  │  TYPE: AI-powered (Google Gemini)                                │ │  │
│   │  │  MODEL: gemini-2.5-flash                                         │ │  │
│   │  │  TIMEOUT: 60 seconds                                             │ │  │
│   │  └─────────────────────────────────────────────────────────────────┘ │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│          │                                                                   │
│          ▼                                                                   │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │                    STAGE 4: FIX GENERATION                            │  │
│   │  ┌─────────────────────────────────────────────────────────────────┐ │  │
│   │  │               FixGeneratorAgent / CodeFixAgent                   │ │  │
│   │  │                                                                  │ │  │
│   │  │  INPUT:  Code location, analysis, source code                    │ │  │
│   │  │  PROCESS:                                                        │ │  │
│   │  │    • Read full source file                                       │ │  │
│   │  │    • Generate AI-powered fix                                     │ │  │
│   │  │    • Create diff (old vs new code)                               │ │  │
│   │  │    • Generate explanation                                        │ │  │
│   │  │  OUTPUT: Code fix with diff and explanation                      │ │  │
│   │  │                                                                  │ │  │
│   │  │  TYPE: AI-powered (Google Gemini)                                │ │  │
│   │  │  MODEL: gemini-2.5-flash                                         │ │  │
│   │  │  TIMEOUT: 90 seconds                                             │ │  │
│   │  └─────────────────────────────────────────────────────────────────┘ │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│          │                                                                   │
│          ▼                                                                   │
│   ┌─────────────┐                                                           │
│   │  Analysis   │                                                           │
│   │  Complete   │                                                           │
│   └─────────────┘                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Error Type Classification

| Error Type | Description | Detection Pattern |
|------------|-------------|-------------------|
| `database_timeout` | Database operations exceeding timeout | `timeout`, `connection timeout` |
| `connection_pool_exhaustion` | No available connections | `pool exhausted`, `no connections` |
| `memory_leak` | Memory consumption issues | `heap`, `memory high`, `OOM` |
| `null_pointer` | Null/undefined access | `undefined`, `null`, `cannot read` |
| `network_error` | Network communication failure | `ECONNREFUSED`, `ETIMEDOUT` |
| `auth_failure` | Authentication/authorization issues | `unauthorized`, `403`, `401` |
| `rate_limit` | Rate limiting triggered | `429`, `rate limit`, `throttle` |
| `validation_error` | Input validation failure | `validation`, `invalid`, `required` |

---

## Data Flow

### Real-Time Log Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        REAL-TIME LOG FLOW                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Docker Container                LogCollector               Frontend     │
│  ┌─────────────┐              ┌─────────────┐           ┌─────────────┐ │
│  │             │              │             │           │             │ │
│  │ [Service]   │              │  Collector  │           │   React     │ │
│  │             │              │             │           │    App      │ │
│  └──────┬──────┘              └──────┬──────┘           └──────┬──────┘ │
│         │                            │                         │        │
│         │ docker logs -f             │                         │        │
│         │────────────────────────────▶                         │        │
│         │                            │                         │        │
│         │                            │ Parse & Pattern Match   │        │
│         │                            │◄───────────────────────│        │
│         │                            │                         │        │
│         │                            │ Store in Buffer         │        │
│         │                            │◄───────────────────────│        │
│         │                            │                         │        │
│         │                            │ Batch (100ms)           │        │
│         │                            │◄───────────────────────│        │
│         │                            │                         │        │
│         │                            │ WebSocket: logs-batch   │        │
│         │                            │────────────────────────▶│        │
│         │                            │                         │        │
│         │                            │ If Error Detected:      │        │
│         │                            │ WebSocket: error-detect │        │
│         │                            │────────────────────────▶│        │
│         │                            │                         │        │
│         │                            │ Store in Database       │        │
│         │                            │◄───────────────────────│        │
│         │                            │                         │        │
└─────────────────────────────────────────────────────────────────────────┘
```

### Analysis Trigger Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      ANALYSIS TRIGGER FLOW                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   User clicks          Backend               AI Pipeline       Frontend  │
│   error                Server                                            │
│   ┌─────────────┐   ┌─────────────┐       ┌─────────────┐  ┌──────────┐│
│   │             │   │             │       │             │  │          ││
│   │  ErrorPanel │   │   Socket    │       │   Agents    │  │ Analysis ││
│   │             │   │   Handler   │       │             │  │  Panel   ││
│   └──────┬──────┘   └──────┬──────┘       └──────┬──────┘  └────┬─────┘│
│          │                 │                     │               │      │
│          │ trigger-analysis│                     │               │      │
│          │────────────────▶│                     │               │      │
│          │                 │                     │               │      │
│          │                 │ Check Lock          │               │      │
│          │                 │◄───────────────────│               │      │
│          │                 │                     │               │      │
│          │                 │ If Locked: Reject   │               │      │
│          │◀────────────────│                     │               │      │
│          │                 │                     │               │      │
│          │                 │ If Unlocked:        │               │      │
│          │                 │ Start Pipeline      │               │      │
│          │                 │────────────────────▶│               │      │
│          │                 │                     │               │      │
│          │                 │                     │ Correlate     │      │
│          │                 │                     │◄─────────────│      │
│          │                 │                     │               │      │
│          │                 │                     │ Analyze       │      │
│          │                 │                     │◄─────────────│      │
│          │                 │                     │               │      │
│          │                 │                     │ Locate Code   │      │
│          │                 │                     │◄─────────────│      │
│          │                 │                     │               │      │
│          │                 │◀────────────────────│               │      │
│          │                 │                     │               │      │
│          │                 │ analysis-complete   │               │      │
│          │                 │────────────────────────────────────▶│      │
│          │                 │                     │               │      │
│          │                 │ Set Lock            │               │      │
│          │                 │◄───────────────────│               │      │
│          │                 │                     │               │      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Frontend Architecture

### State Management

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       FRONTEND STATE MANAGEMENT                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                      useSocket Hook                                │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │                    Socket.io Connection                      │  │  │
│  │  │  • Connect to ws://localhost:4000                            │  │  │
│  │  │  • Auto-reconnect on disconnect                              │  │  │
│  │  │  • Event subscription management                             │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  │                              │                                     │  │
│  │              ┌───────────────┼───────────────┐                    │  │
│  │              ▼               ▼               ▼                    │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐              │  │
│  │  │    logs      │ │   metrics    │ │  analysis    │              │  │
│  │  │   (array)    │ │   (object)   │ │   (object)   │              │  │
│  │  └──────────────┘ └──────────────┘ └──────────────┘              │  │
│  │                                                                    │  │
│  │  State Flow:                                                       │  │
│  │  logs-batch    → setLogs(prev => [...prev, ...batch])             │  │
│  │  metrics-update → setMetrics(data)                                │  │
│  │  error-detected → setErrors(prev => [...prev, error])             │  │
│  │  analysis-complete → setAnalysis(data)                            │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Hierarchy

```
App
├── Sidebar
│   └── Navigation Links
├── TopBar
│   ├── Search
│   └── Settings Toggle
└── Routes
    ├── Dashboard
    │   ├── SystemOverview
    │   ├── ServiceCards (multiple)
    │   ├── RecentErrors
    │   ├── LogStream
    │   └── ErrorPanel (conditional)
    │       ├── Analysis Results
    │       ├── AttackGraph
    │       ├── CodeLocation
    │       └── FixGeneration
    │           └── CodeDiffViewer
    ├── LogsView
    │   ├── LogFilters
    │   └── LogStream (full)
    ├── InsightsPage
    │   ├── PredictiveInsights
    │   └── ErrorTrends (Recharts)
    ├── ServiceHealthPage
    │   └── ServiceHealth (per service)
    ├── IncidentsPage
    │   └── IncidentReport (multiple)
    ├── ExportPage
    │   └── Export Options
    └── SettingsPage
        ├── Discovery Mode
        ├── Source Code Config
        └── Database Config
```

---

## Database Schema

### Tables

```sql
-- Logs table: Raw log entries
CREATE TABLE logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hash TEXT UNIQUE NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  service TEXT NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Errors table: Tracked errors with occurrence counts
CREATE TABLE errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hash TEXT UNIQUE NOT NULL,
  message TEXT NOT NULL,
  service TEXT NOT NULL,
  level TEXT,
  count INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active',
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW()
);

-- Error resolutions: Past fixes for learning
CREATE TABLE error_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  error_hash TEXT NOT NULL,
  fix_applied TEXT NOT NULL,
  success BOOLEAN DEFAULT true,
  service TEXT,
  file_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Predictions: ML-based predictions
CREATE TABLE predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  service TEXT,
  issue TEXT NOT NULL,
  confidence REAL,
  horizon TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Metrics history: Time-series data
CREATE TABLE metrics_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service TEXT NOT NULL,
  cpu_percent REAL,
  memory_percent REAL,
  memory_mb INTEGER,
  network_rx BIGINT,
  network_tx BIGINT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);
```

### Data Retention

| Table | Retention | Cleanup |
|-------|-----------|---------|
| `logs` | 7 days | Automatic hourly |
| `errors` | Indefinite | Manual |
| `error_resolutions` | Indefinite | Manual |
| `predictions` | 30 days | Automatic daily |
| `metrics_history` | 7 days | Automatic hourly |

---

## Communication Protocols

### REST API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/api/logs` | GET | Fetch recent logs |
| `/api/metrics` | GET | Current metrics |
| `/api/analyze-error` | POST | Trigger analysis |
| `/api/generate-fix` | POST | Generate fix |
| `/api/apply-targeted-fix` | POST | Apply fix |
| `/api/export/full` | POST | Export data |
| `/api/source-code/status` | GET | Source code config |
| `/api/source-code/configure` | POST | Update config |

### WebSocket Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `connection` | - | Socket connected |
| `logs-batch` | S→C | `[{timestamp, service, level, message}]` |
| `metrics-update` | S→C | `{services: {name: {cpu, memory, ...}}}` |
| `error-detected` | S→C | `{id, message, service, timestamp}` |
| `analysis-complete` | S→C | `{analysis, location, timestamp}` |
| `fix-generated` | S→C | `{fix, diff, explanation}` |
| `trigger-analysis` | C→S | `{errorId}` |
| `dismiss-analysis` | C→S | `{}` |

---

## Security Considerations

### Current Implementation

| Aspect | Status | Notes |
|--------|--------|-------|
| Source code access | Read-only by default | Write requires explicit enable |
| Code modifications | Backup before apply | `.backup.TIMESTAMP` files |
| API keys | Environment variables | Never exposed to frontend |
| Docker socket | Host mount | Production: use TCP with TLS |
| CORS | Configured | Only frontend origin allowed |
| Rate limiting | Not implemented | Add for production |

### Recommendations for Production

1. **Docker Socket Security**
   - Use TCP socket with TLS instead of Unix socket
   - Implement authentication for Docker API

2. **API Security**
   - Add rate limiting
   - Implement API key authentication
   - Add request validation

3. **Data Security**
   - Encrypt sensitive log data
   - Implement log retention policies
   - Add audit logging

---

## Scalability

### Current Limitations

| Component | Limit | Bottleneck |
|-----------|-------|------------|
| Log buffer | 1000 entries | Memory |
| Metrics history | 60 points/service | Memory |
| Concurrent analyses | 1 | Analysis lock |
| WebSocket clients | ~100 | Node.js single thread |

### Scaling Strategies

1. **Horizontal Scaling**
   - Run multiple backend instances
   - Use Redis for shared state
   - Load balance WebSocket connections

2. **Log Processing**
   - Implement log aggregation service (Kafka/Redis Streams)
   - Partition logs by service
   - Implement log sampling for high-volume services

3. **AI Analysis**
   - Queue analysis requests
   - Implement parallel analysis pipelines
   - Cache common analysis patterns

4. **Database**
   - Use connection pooling
   - Implement read replicas
   - Partition large tables by time

---

## Technology Decisions

### Why These Technologies?

| Technology | Reason |
|------------|--------|
| **React 18** | Modern hooks, concurrent features, large ecosystem |
| **Vite** | Fast HMR, ES modules, minimal config |
| **Express.js** | Simple, widely adopted, extensive middleware |
| **Socket.io** | Reliable WebSocket with fallbacks, room support |
| **LangChain** | AI orchestration, prompt management, streaming |
| **Google Gemini** | Cost-effective, fast, good code understanding |
| **React Flow** | Interactive graphs, customizable nodes, performant |
| **TailwindCSS** | Utility-first, fast styling, consistent design |
| **Supabase** | PostgreSQL with realtime, easy setup, generous free tier |

---

*Last updated: February 2026*

*LogLens Architecture Documentation*
