# Literacy Backend

Flask-based REST API for the Literacy code-reading platform.

## Setup

1. Create and activate virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Seed sample problems:
```bash
python seed.py
```

4. Run the development server:
```bash
python app.py
```

The API will be available at `http://localhost:5000`

## Database

SQLite database is created automatically at `backend/literacy.db` on first run.

## API Endpoints

### Authentication
- `POST /api/auth/register` — Register a new user
- `POST /api/auth/login` — Login user
- `POST /api/auth/logout` — Logout user
- `GET /api/auth/me` — Get current user info

### Questions
- `GET /api/questions` — Get all questions (with filters)
- `GET /api/questions/<id>` — Get a specific question
- `POST /api/questions` — Create a new question

### Submissions
- `POST /api/submissions` — Submit an answer
- `GET /api/submissions/user/<user_id>` — Get user submissions
- `GET /api/submissions/<id>` — Get a specific submission
