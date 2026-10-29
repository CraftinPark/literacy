# HW-2: The muon telescope in the new hut (hardware keyhole, medium)

*A coincidence counter whose timing, window and losses must be measured on the telescope before the rate is right. AI-written MVP: an experiment, not shipped content.*

## The ticket

> **From:** The cosmic-ray outreach group. **Priority:** P2
>
> Our muon telescope (two 50x50 cm scintillator paddles, A on top, B 1 m below, read by a CB-2 coincidence board) measures the muon rate against zenith angle; the students fit I0 * cos^n. Last year in the old hut: I0 = 3.79 muons/s, n close to 2, as expected. Over the summer it moved to the new hut, the same kind of wooden shed 30 m away. On the way paddle B's PMT died and was replaced with a new one from a different supplier, on a longer cable. Since then the fit gives I0 about 27% low and n = 0.6. Nobody touched the analysis code. The person who set up the board has graduated.

- `board/config.json`: the CB-2 settings, applied at the start of every run: a delay per channel and the output pulse width per channel, 0 to 255 ns.
- `muon/analysis.py`: `muon_rate(counts, config)` turns one run's counts into muons per second. `muon/fit.py` fits I0 * cos^n. Keep `muon_rate`'s signature; change anything else, including the config.
- `python run_campaign.py`: one day of the campaign (24 one-hour runs at 0 to 75 degrees) with your config and analysis. Pass = n within 1.9-2.1 and I0 within 3% of last year's 3.79.
- `python bench.py --minutes M [--angle A] [--delay-a NS] [--delay-b NS] [--width-a NS] [--width-b NS] [--source-b]`: one manual run with settings overridden for that run, printing the board's counts. `--source-b` puts the Sr-90 check source on paddle B. **Budget: 10 hours of telescope time.**
- `_sim/` is the physical telescope. You can't open a PMT, so don't read, decompile or import it except through `bench.py` and `run_campaign.py`.

The hut is not heated: about -15 C in January, +30 C in July. The campaign starts tomorrow and runs for a year with whatever you leave in `board/` and `muon/`; the students only look at the fits. Say "resolved" when you are done.
