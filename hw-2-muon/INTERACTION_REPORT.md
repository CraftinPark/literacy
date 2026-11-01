# How you worked with me on HW-2

**Overview:** You started out knowing little about the topic and finished by directing a measurement campaign. You used me as tutor, lab technician and analyst, while keeping the spending decisions for yourself. I proposed nearly all the hypotheses and did all the running and calculation.

**Learning first, then acting.** You began with basics: what a muon microscope is, what the muon rate means, what I₀ and n represent, and what Sr-90 and PMTs are. You often set word limits (50, 100, 200), which kept the answers short. You also pasted README lines and asked me to explain them. You didn't ask me to run anything until you understood the tools, and you kept asking concept questions even late on, which helped you judge my results.

**Challenging my claims.** This was your most valuable habit.
- "Give me the evidence" made me show where the noise figures came from.
- "How are u certain" revealed that I had used a 65 ns window while my measurements pointed nearer 64 ns, and that I had partly set the value to match the test.
- "Why not test 0 to 255" found a real gap in my scan. The extra scan turned up no second pulse, but it gave a better window estimate.
- "Why 12C?" and "is there any way to simulate -15C?" made clear that the bench can't test other temperatures.
- "Compare and contrast" the two run plans led me to pool existing data, which showed that the cheaper plan was nearly as strong and that my 6-hour estimate was too high.

**Controlling the budget.** You approved telescope time in steps: "go ahead", "run plan b", "run it". You often asked why before approving a spend, and you chose the 3.5-hour plan I recommended. Of the 10 hours, 9.78 went on measurements you had approved.

**Testing the "done" point.** Asking "would you say this is resolved?" prompted me to look harder, and I found the summer window-precision risk that I had underplayed. That led to the final 2.5-hour run. You then checked what it changed by comparing the campaign results.

**Where it could have been stronger.**
- **Reliance on me:** I proposed the theories (dead time, B's fixed width), the experiments and the fixes. You chose between them, but you rarely offered a hypothesis of your own. If this was meant as a human solve test, the result reflects a lot of my reasoning rather than your independent problem-solving.
- **Ambiguous prompts:** Short prompts sometimes left me guessing. "Plan B" could have meant the experiment or the config option, "step 2" meant the calibration option, and "dB" meant B's width. You also repeated the first question without saying what was missing. Stating the reason would have saved a round.
- **Claims that went unchallenged:** You didn't push on the −15 to +30 °C extrapolation or my summer estimates (~80k/s, ±0.1 on n). Those rest on 9–15 °C data and a 12 °C calibration. The dead-time model also assumes last year's 3.79 was the true rate, so ε₀ = 1.000 is less independent than it looks. Your final "resolved" accepted these as stated caveats, which was reasonable, but they remain unverified.

**Overall:** You acted like a careful supervisor: you questioned the evidence, controlled the resources and stayed sceptical of "done". The next step up is to form your own hypothesis before asking for mine.
