import json
import os
from app import create_app, db
from models import Question

def seed_problems():
    """Load sample problems from JSON into database."""
    app = create_app()
    
    with app.app_context():
        # Load problems.json
        samples_path = os.path.join(os.path.dirname(__file__), 'samples', 'problems.json')
        
        with open(samples_path, 'r') as f:
            problems = json.load(f)
        
        # Check if problems already seeded
        if Question.query.first():
            print("✓ Problems already seeded. Skipping.")
            return
        
        # Insert problems
        for prob in problems:
            question = Question(
                title=prob['title'],
                description=prob['description'],
                code=prob['code'],
                difficulty=prob['difficulty'],
                category=prob['category'],
                language=prob['language'],
                expected_explanation=prob['expected_explanation']
            )
            db.session.add(question)
            print(f"✓ Added: {prob['title']}")
        
        db.session.commit()
        print(f"\n✓ Seeded {len(problems)} problems successfully.")

if __name__ == '__main__':
    seed_problems()
