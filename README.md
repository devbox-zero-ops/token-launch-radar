# Token Launch Radar v2.1

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/devbox-zero-ops/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/devbox-zero-ops/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Empirical IRLS Huber peer-fitted valuations, honest P25–P75 uncertainty intervals, data-driven token launch odds, and costed `$1,000` farmer `$/hr` verdicts for pre-token DeFi protocols on [make.fun](https://make.fun/bounty/token-radar-01).

## Highlights (v2.1)
- **Centered IRLS Huber & Leakage-Free Dual Ablation (`lib/model.ts`)**: Fits `log(MCap) = 11.04 + 0.31·log(TVL)` over `n=81` comparable DeFi peers (`>= $1M` MCap, ex CEX/Bridge/LST) with fold-centered `log(TVL)` and strictly evaluates candidate features on both **LOOCV (`3.14x`, P75 `5.96x`)** and **Chronological Walk-Forward (`40 train -> 23 test`, `2.39x`)**, dropping features that fail dual out-of-sample generalization.
- **Range Honesty & Peer Token Odds**: Reports empirical `P25–P75` implied valuation bands (`0.41x–3.31x`) and Bayesian-shrunk (`k=6`) peer token launch probabilities.
- **Costed `$1,000` Farmer Economics**: Computes `Gross EV`, chain-adjusted `Gas + 4% Opportunity Cost`, `Net EV`, `$/hr`, and actionable `FARM` (`53`) / `SELECTIVE` (`84`) / `SKIP` (`61`) verdicts.
- **Zero-Network Offline Dashboard (`dashboard/`)**: Accessible sortable table (`aria-sort`, `Intl.Collator`), Verdict/Tier/Category/Chain filters, protocol breakdown `<dialog>`, and live Validation & Ablation `<dialog>`.

## Run Locally
```bash
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

Built for [make.fun](https://make.fun/bounty/token-radar-01) (`token-radar-01`). MIT License.
