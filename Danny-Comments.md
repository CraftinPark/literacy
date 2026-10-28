# Danny's comments: Playground challenge (QuickEats search)

## What I solved

QuickEats search missed results typed in lowercase. I lowercased the query and the three fields it's compared with (name, category, menu items). **Took 19 minutes.**

## Relevant for a backend job seeker?

Partly. The skill is real: finding the spot in unfamiliar code. But it's a frontend JavaScript search function, and the brief said backend. It is the same bug as the Amazon online assessment, so it's realistic for interviews.

## High quality / authentic?

- **What worked:**
  - Running the app constantly is really satisfying: I could see the bug and see the fix.
  - I had no idea of JavaScript but could still pinpoint where the fix had to happen. That supports our assumption that reading code is a separate skill from knowing the language.
- **What made it easy:** Ctrl+F helped a TON. Searching for the visible text leads straight to the function, so it's close to a find-the-line problem.
- **Honest note:** I cheated a little and asked what the functions I needed were (`toLowerCase`, and the order of calls). That was a language gap, not a reading gap.

## What could be improved

1. "Reproduce it for me" vs "Run" vs "Auto-run" is kind of confusing. Maybe one Run button, with auto-run on by default.
2. Ctrl+Z didn't work in the editor. I don't know if that's intended.
3. Make it backend, or harder to Ctrl+F: e.g. the search lives behind an API or a helper in another file, so the visible text doesn't lead straight to the bug.

## Still to do

The backend questions in `question-for-danny/` (the coupon, the token, the David_H sign-up).
