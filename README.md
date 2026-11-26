# Token Launch Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/devbox-zero-ops/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/devbox-zero-ops/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Empirical peer-multiple implied valuations and costed, time-boxed farming playbooks for pre-token DeFi protocols on [make.fun](https://make.fun/bounty/token-radar-01).

## Highlights
- **100% Snapshot-Driven Valuation Model (`lib/model.ts`)**: Computes Bayesian-smoothed category median `MCap/TVL` multiples from the 129 tokenized peers inside `/input/snapshot.json`, then applies bounded TVL scale compression, 7-day momentum, pre-token longevity, and multi-chain footprint factors.
- **Full Coverage**: Scores 198 pre-token protocols (`40/40` watchlist + `158` emerging below-floor protocols) while cleanly separating 416 tokenized peers.
- **Costed & Time-Boxed Farm Plans**: Generates 4–5 concrete farming steps per protocol with chain-specific gas budgets, capital guidance, and snapshot horizons.
- **Zero-Network Offline Dashboard (`dashboard/`)**: Accessible sortable table (`aria-sort`, `Intl.Collator`), multi-filter bar, and native `<dialog closedby="any">` formula waterfall & playbook modal.

## Run Locally
```bash
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

Built for [make.fun](https://make.fun/bounty/token-radar-01) (`token-radar-01`). MIT License.
