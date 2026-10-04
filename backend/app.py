from flask import Flask
from flask_cors import CORS
from config import DevelopmentConfig
from models import db
from routes import auth_bp, questions_bp, submissions_bp


def create_app(config_name='development'):
    """Application factory"""
    app = Flask(__name__)
    
    # Load configuration
    if config_name == 'development':
        app.config.from_object(DevelopmentConfig)
    elif config_name == 'testing':
        from config import TestingConfig
        app.config.from_object(TestingConfig)
    else:
        from config import ProductionConfig
        app.config.from_object(ProductionConfig)
    
    # Initialize database
    db.init_app(app)
    
    # Enable CORS for frontend communication
    CORS(app, supports_credentials=True, origins=['http://localhost:5173', 'http://localhost:3000'])
    
    # Register blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(questions_bp)
    app.register_blueprint(submissions_bp)
    
    # Create database tables
    with app.app_context():
        db.create_all()
    
    return app


if __name__ == '__main__':
    app = create_app()
    app.run(debug=True, port=5000)
