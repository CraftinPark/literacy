"""Fix-and-quiz exercises: build, run, grade, report.

Format (public.json "format": "fix_quiz"): section 1 gives the candidate
tickets to fix in the page's built-in editor, graded by visible and hidden tests; section 2
is multiple choice about the code. See CLAUDE.md, section 16.

    runner   run an example's tests against any code tree
    grade    score both sections; diff the candidate's code against the shipped code
    report   render the graded attempt as one HTML file
    build    generate code/ from the baseline and record the gates in manifest.json
    session  run and complete, on the files the exercise page sends
"""
