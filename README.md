# Token Launch Radar v3.0

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/devbox-zero-ops/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/devbox-zero-ops/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Peer-anchored multi-factor valuations (TVL, 7-day TVL growth, pre-token longevity, category peers & multi-chain reach), empirical P25–P75 uncertainty ranges, data-driven token launch odds, and costed `$1,000` farmer `$/hr` verdicts for pre-token DeFi protocols on [make.fun](https://make.fun/bounty/token-radar-01).

## Highlights (v3.0)
- **Peer-Anchored Multi-Factor Valuation (`lib/model.ts`)**: Anchors each protocol to Bayesian-shrunk (`k=5`) category peer `MCap/TVL` ratios, smooth TVL scale dampening, 7-day TVL momentum, DefiLlama runtime longevity, and multi-chain reach — eliminating mega-TVL compression while verifying strictly leakage-free **LOOCV & chronological Walk-Forward** generalization.
- **Range Honesty & Peer Token Odds**: Reports empirical `P25–P75` implied valuation bands from out-of-sample LOOCV residuals and Bayesian-shrunk (`k=6`) peer token launch probabilities.
- **Costed `$1,000` Farmer Economics**: Computes `Gross EV`, chain-adjusted `Gas + 4% Opportunity Cost`, `Net EV`, `$/hr`, and actionable `FARM` / `SELECTIVE` / `SKIP` verdicts.
- **Zero-Network Offline Dashboard (`dashboard/`)**: Accessible sortable table (`aria-sort`, `Intl.Collator`), Verdict/Tier/Category/Chain filters, multi-factor breakdown `<dialog>`, and live Out-of-Sample Validation `<dialog>`.

## Run Locally
```bash
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

Built for [make.fun](https://make.fun/bounty/token-radar-01) (`token-radar-01`). MIT License.
