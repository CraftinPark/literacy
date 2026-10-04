from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()


class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    
    submissions = db.relationship('Submission', backref='user', lazy=True, cascade='all, delete-orphan')
    
    def set_password(self, password):
        """Hash and set password"""
        import hashlib
        self.password_hash = hashlib.sha256(password.encode()).hexdigest()
    
    def check_password(self, password):
        """Verify password"""
        import hashlib
        return self.password_hash == hashlib.sha256(password.encode()).hexdigest()
    
    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'created_at': self.created_at.isoformat()
        }


class Question(db.Model):
    __tablename__ = 'questions'
    
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=False)
    code = db.Column(db.Text, nullable=False)
    difficulty = db.Column(db.String(20), nullable=False)  # 'easy', 'medium', 'hard'
    language = db.Column(db.String(20), nullable=False, default='c')
    category = db.Column(db.String(50), nullable=False)  # 'pointers', 'memory', etc.
    expected_explanation = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    submissions = db.relationship('Submission', backref='question', lazy=True, cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'description': self.description,
            'code': self.code,
            'difficulty': self.difficulty,
            'language': self.language,
            'category': self.category,
            'created_at': self.created_at.isoformat()
        }


class Submission(db.Model):
    __tablename__ = 'submissions'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    question_id = db.Column(db.Integer, db.ForeignKey('questions.id'), nullable=False)
    explanation = db.Column(db.Text, nullable=False)
    score = db.Column(db.Float, nullable=True)  # 0.0 to 1.0
    feedback = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'question_id': self.question_id,
            'explanation': self.explanation,
            'score': self.score,
            'feedback': self.feedback,
            'created_at': self.created_at.isoformat()
        }
