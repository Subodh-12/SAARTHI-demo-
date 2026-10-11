# SAARTHI — Adaptive Learning Companion

**An offline-first, Odia-first learning companion for Class 9 Science students.**

SAARTHI is an educational technology project designed to help students in rural and semi-urban Odisha learn Science in their regional language, including in environments with limited or unreliable internet connectivity.

The goal is to build a learning system that understands a student's learning progress, identifies what they need to learn next, and guides them through an appropriate learning activity.

> **Project status:** Early prototype. The React frontend and FastAPI backend are running, and a basic lesson and quiz flow is implemented. Offline persistence, adaptive learning decisions, and synchronization are planned capabilities and are not yet verified as implemented.

---

## 🎯 Vision

SAARTHI aims to make learning more accessible by providing:

- **Odia-first learning:** Regional-language learning experiences designed for the intended students.
- **Concept-based teaching:** Explanations, examples, guided activities, and practice—not just quizzes.
- **Adaptive learning:** Choosing the next learning activity based on the student's progress and learning needs.
- **Offline-first access:** Supporting learning when internet connectivity is unavailable.
- **Reliable progress tracking:** Preserving learner progress and synchronizing it when connectivity returns.

These are the project's goals; features will be implemented and tested incrementally.

## 🛠️ Technology Stack

| Component | Technology |
|---|---|
| Frontend | React + TypeScript |
| Frontend tooling | Vite |
| Backend API | Python + FastAPI |
| Local development | Windows + VS Code |
| Version control | Git + GitHub |

The architecture may evolve as implementation progresses, following the project's design document.

## 📁 Project Structure

```text
SAARTHI/
├── backend/
│   └── app/
│       ├── __init__.py
│       └── main.py
├── curriculum/          # Curriculum resources
├── docs/                # Project documentation
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── App.css
│   │   ├── index.css
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
├── tests/               # Tests
├── .gitignore
└── README.md
```

## 💻 Prerequisites

Install the following software:

- [Python](https://www.python.org/downloads/)
- [Node.js](https://nodejs.org/) — includes npm
- [Git](https://git-scm.com/downloads)
- [Visual Studio Code](https://code.visualstudio.com/)

The project has previously been run with Python 3.13, Node.js 20, and npm 10.

## 🚀 Getting Started

These instructions are for Windows PowerShell.

### 1. Open the project

Open the SAARTHI project folder in VS Code.

Open a terminal at the project root—the folder containing `backend`, `frontend`, and `.gitignore`.

### 2. Set up the Python environment

If the virtual environment already exists, activate it:

```powershell
.\.venv\Scripts\Activate.ps1
```

If it does not exist, create it first:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Install the backend dependencies:

```powershell
python -m pip install fastapi uvicorn
```

### 3. Start the backend

From the project root, run:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --reload --port 8000
```

Keep this terminal open.

The backend should be available at:

- API root: http://127.0.0.1:8000/
- Health check: http://127.0.0.1:8000/health
- Lesson endpoint: http://127.0.0.1:8000/api/lesson
- Interactive API documentation: http://127.0.0.1:8000/docs

### 4. Start the frontend

Open a **second terminal** in VS Code and run:

```powershell
cd frontend
npm install
npm run dev
```

Keep this terminal open too.

Open the local development URL shown by Vite, usually:

http://localhost:5173/

The frontend communicates with the FastAPI backend running on port `8000`.

### 5. Stop the development servers

When you finish working, press `Ctrl + C` in each server terminal.

To resume development, start the backend and frontend again using the commands above.

## 🔌 Current API

The backend currently exposes these endpoints:

| Endpoint | Purpose |
|---|---|
| `GET /` | Basic API welcome response |
| `GET /health` | Health check |
| `GET /api/lesson` | Returns the current sample lesson and quiz data |

The lesson endpoint currently returns a lesson title, subtitle, question, answer options, correct option, and explanation.

## 🧭 Development Roadmap

The intended development direction is:

1. **Student learning experience:** Build a complete lesson flow with explanations, real-life examples, guided activities, and practice.
2. **Curriculum foundation:** Organize and verify curriculum-aligned learning content.
3. **Local learning engine:** Maintain learner state and make deterministic next-action decisions.
4. **Offline-first learning:** Store learning resources and progress locally so core activities can continue without internet access.
5. **Assessment and mastery:** Track learning attempts, update mastery estimates, and respond to misconceptions.
6. **Reliable synchronization:** Safely synchronize pending learner progress when connectivity becomes available.
7. **Grounded AI assistance:** Add curriculum-grounded AI capabilities where appropriate without making core learning decisions dependent on an LLM.

Implementation order and acceptance criteria must follow the project's design document.

## 🤝 Contributing and Development Principles

While developing SAARTHI:

- Read the project documentation before changing the architecture.
- Preserve existing working functionality.
- Keep the core learning decision process deterministic and local.
- Do not claim offline functionality or synchronization works until tested.
- Verify educational content before presenting it as curriculum-approved.
- Test frontend builds and backend behavior after meaningful changes.
- Commit working milestones to Git.

## 📌 Important Note

SAARTHI is an actively developed prototype. Features described in the vision and roadmap are planned capabilities unless explicitly identified as implemented and tested.

The long-term objective is to create a reliable, accessible learning companion—not merely an online quiz application.

---

**SAARTHI — Learn at your pace. Keep moving forward.**