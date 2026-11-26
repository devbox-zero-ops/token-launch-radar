# Token Launch Radar v2

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/devbox-zero-ops/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/devbox-zero-ops/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Empirical IRLS Huber peer-fitted valuations, honest P25–P75 uncertainty intervals, data-driven token launch odds, and costed `$1,000` farmer `$/hr` verdicts for pre-token DeFi protocols on [make.fun](https://make.fun/bounty/token-radar-01).

## Highlights (v2)
- **Leakage-Free Dual Held-Out Feature Ablation (`lib/model.ts`)**: Evaluates candidate features (`Category residual`, `log1p(Chain count)`, `log1p(Protocol age)`, `7d TVL momentum`) against the `log(TVL)` IRLS Huber baseline on both **LOOCV (`n=81` DeFi peers)** and **Chronological Walk-Forward (`40 train -> 23 test`)**, keeping only features that improve both out-of-sample checks (`LOOCV 3.14x`, `Walk-Forward 2.40x`).
- **Range Honesty & Peer Token Odds**: Reports empirical `P25–P75` implied valuation bands (`0.41x–3.33x`) and Bayesian-shrunk (`k=6`) peer token launch probabilities.
- **Costed `$1,000` Farmer Economics**: Computes `Gross EV`, chain-adjusted `Gas + 4% Opportunity Cost`, `Net EV`, `$/hr`, and actionable `FARM` (`53`) / `SELECTIVE` (`85`) / `SKIP` (`60`) verdicts.
- **Zero-Network Offline Dashboard (`dashboard/`)**: Accessible sortable table (`aria-sort`, `Intl.Collator`), Verdict/Tier/Category/Chain filters, protocol breakdown `<dialog>`, and live Validation & Ablation `<dialog>`.

## Run Locally
```bash
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

Built for [make.fun](https://make.fun/bounty/token-radar-01) (`token-radar-01`). MIT License.
