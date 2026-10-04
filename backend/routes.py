from flask import Blueprint, request, jsonify, session
from models import db, User, Question, Submission

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')


@auth_bp.route('/register', methods=['POST'])
def register():
    """Register a new user"""
    data = request.get_json()
    
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({'error': 'Username and password required'}), 400
    
    if User.query.filter_by(username=data['username']).first():
        return jsonify({'error': 'Username already exists'}), 409
    
    user = User(username=data['username'], email=data.get('email'))
    user.set_password(data['password'])
    
    try:
        db.session.add(user)
        db.session.commit()
        session['user_id'] = user.id
        return jsonify({'message': 'User created successfully', 'user': user.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@auth_bp.route('/login', methods=['POST'])
def login():
    """Login user"""
    data = request.get_json()
    
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({'error': 'Username and password required'}), 400
    
    user = User.query.filter_by(username=data['username']).first()
    
    if not user or not user.check_password(data['password']):
        return jsonify({'error': 'Invalid username or password'}), 401
    
    session['user_id'] = user.id
    return jsonify({'message': 'Login successful', 'user': user.to_dict()}), 200


@auth_bp.route('/logout', methods=['POST'])
def logout():
    """Logout user"""
    session.pop('user_id', None)
    return jsonify({'message': 'Logout successful'}), 200


@auth_bp.route('/me', methods=['GET'])
def get_current_user():
    """Get current logged-in user"""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Not authenticated'}), 401
    
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    return jsonify(user.to_dict()), 200


questions_bp = Blueprint('questions', __name__, url_prefix='/api/questions')


@questions_bp.route('', methods=['GET'])
def get_questions():
    """Get all questions with optional filtering"""
    difficulty = request.args.get('difficulty')
    category = request.args.get('category')
    
    query = Question.query
    
    if difficulty:
        query = query.filter_by(difficulty=difficulty)
    if category:
        query = query.filter_by(category=category)
    
    questions = query.all()
    return jsonify([q.to_dict() for q in questions]), 200


@questions_bp.route('/<int:question_id>', methods=['GET'])
def get_question(question_id):
    """Get a specific question"""
    question = Question.query.get(question_id)
    
    if not question:
        return jsonify({'error': 'Question not found'}), 404
    
    return jsonify(question.to_dict()), 200


@questions_bp.route('', methods=['POST'])
def create_question():
    """Create a new question (admin only for MVP)"""
    data = request.get_json()
    
    required_fields = ['title', 'description', 'code', 'difficulty', 'category', 'expected_explanation']
    if not all(field in data for field in required_fields):
        return jsonify({'error': 'Missing required fields'}), 400
    
    question = Question(
        title=data['title'],
        description=data['description'],
        code=data['code'],
        difficulty=data['difficulty'],
        language=data.get('language', 'c'),
        category=data['category'],
        expected_explanation=data['expected_explanation']
    )
    
    try:
        db.session.add(question)
        db.session.commit()
        return jsonify(question.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


submissions_bp = Blueprint('submissions', __name__, url_prefix='/api/submissions')


@submissions_bp.route('', methods=['POST'])
def submit_answer():
    """Submit an answer to a question"""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Not authenticated'}), 401
    
    data = request.get_json()
    
    if not data or not data.get('question_id') or not data.get('explanation'):
        return jsonify({'error': 'Question ID and explanation required'}), 400
    
    question = Question.query.get(data['question_id'])
    if not question:
        return jsonify({'error': 'Question not found'}), 404
    
    submission = Submission(
        user_id=user_id,
        question_id=data['question_id'],
        explanation=data['explanation']
    )
    
    try:
        db.session.add(submission)
        db.session.commit()
        
        # TODO: Call AI grader here
        # score, feedback = grade_with_ai(question.expected_explanation, submission.explanation)
        # submission.score = score
        # submission.feedback = feedback
        # db.session.commit()
        
        return jsonify(submission.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@submissions_bp.route('/user/<int:user_id>', methods=['GET'])
def get_user_submissions(user_id):
    """Get all submissions by a user"""
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    submissions = Submission.query.filter_by(user_id=user_id).all()
    return jsonify([s.to_dict() for s in submissions]), 200


@submissions_bp.route('/<int:submission_id>', methods=['GET'])
def get_submission(submission_id):
    """Get a specific submission"""
    submission = Submission.query.get(submission_id)
    
    if not submission:
        return jsonify({'error': 'Submission not found'}), 404
    
    return jsonify(submission.to_dict()), 200
