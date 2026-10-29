# Two problems to solve (ReadCode human test)

Thanks for trying these. We're testing whether a person working with AI can solve problems that AI alone could not. There are two, and each is independent:

| Folder | What it is | Suggested time limit |
|---|---|---|
| `mvp-14-new-boxes/` | A worker pool that falls behind after a hardware migration. Tune its settings with a limited number of benchmark runs. | 2 hours |
| `hw-2-muon/` | A muon telescope in an unheated hut. Get its rate measurement right before a year-long campaign. | 2 hours |

Start with each folder's `README.md`; that's the ticket.

## Rules

- **AI is allowed.** Use any AI tool you like (Claude, ChatGPT, Copilot...), as much as you like.
- **Respect the budgets.** Each problem limits how many benchmark or measurement runs you get, and a hidden file counts them. Don't reset or edit that counter.
- **Don't open the compiled files.** `engine/stage.pyc` and `_sim/*.pyc` stand in for real hardware and another team's code. Disassembling or decompiling them is off limits, and so is telling your AI to do it.
- **Don't look at other branches** of this repo. They contain the answers.
- **Use Python 3.14.** The `.pyc` files only load on that version. Check with `python --version`.
- **"Not resolved" is a valid answer.** If you think it can't be done, say so and why.

## What to send back

For each problem, send:

1. Start and end time, and roughly how long you spent thinking versus waiting.
2. Which AI tools you used, and for what.
3. How many runs you used (the budget counter shows it).
4. Your final answer: the files you changed (`config.json` for MVP 14; `board/config.json` and `muon/analysis.py` for hw-2), or "not resolved".
5. Two or three sentences on how you approached it, and anything that confused you.

The easiest way is to commit your work on a new branch named `solve/<your-name>` from this one and push it. Zipping the folder and sending it works too. Danny grades the answers against a hidden check.
