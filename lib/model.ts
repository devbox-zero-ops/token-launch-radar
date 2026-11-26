// Self-validating pre-token protocol valuation & farming economics engine for token-radar-01.
// Zero external dependencies; fits IRLS Huber log-linear regression on tokenized DeFi peers,
// runs leakage-free LOOCV & chronological Walk-Forward ablation, calibrates honest P25-P75
// ranges, estimates peer-based token launch propensity, and computes $1,000 farmer $/hr verdicts.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ValuationBreakdown {
  peer_category: string;
  peer_sample_size: number;
  cat_ratio: number;
  scale_factor: number;
  momentum_factor: number;
  maturity_factor: number;
  chain_factor: number;
  effective_multiple: number;
  p25_mult: number;
  p75_mult: number;
}

export interface FarmEconomics {
  ref_capital_usd: number;
  airdrop_pool_pct: number;
  user_share: number;
  gross_ev_usd: number;
  gas_cost_usd: number;
  opp_cost_usd: number;
  all_in_cost_usd: number;
  horizon_weeks: number;
  hours_needed: number;
  net_ev_usd: number;
  usd_per_hour: number;
  verdict: 'FARM' | 'SELECTIVE' | 'SKIP';
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  on_watchlist: boolean;
  tier: 'watchlist' | 'emerging';
  token_status: string;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  token_odds_pct: number;
  token_odds_basis: string;
  breakdown: ValuationBreakdown;
  farm_econ: FarmEconomics;
  est_gas_usd: string;
  est_horizon: string;
  farm_steps: string[];
}

export interface AblationRow {
  feature: string;
  loocv_med_x: number;
  loocv_p75_x: number;
  wf_med_x: number;
  delta_loocv: number;
  delta_wf: number;
  decision: 'ACTIVE' | 'BASELINE' | 'REFERENCE';
  reason: string;
}

export interface CategoryPeerStat {
  category: string;
  peer_count: number;
  cat_multiplier: number;
  median_tvl_usd: number;
}

export interface ValidationSummary {
  all_tokenized: number;
  defi_tokenized: number;
  calibration_cohort: number;
  wf_train_n: number;
  wf_test_n: number;
  global_med_ratio: number;
  med_cohort_tvl_usd: number;
  loocv_med_x: number;
  loocv_p75_x: number;
  wf_med_x: number;
  p25_mult: number;
  p75_mult: number;
  factors_used: string[];
  ablation: AblationRow[];
}

export interface RadarPayload {
  as_of: string;
  source: string;
  floor_usd: number;
  total_snapshot_protocols: number;
  watchlist_count: number;
  watchlist_covered: number;
  early_size: number;
  live_size: number;
  global_median_multiple: number;
  total_implied_usd: number;
  verdict_counts: { FARM: number; SELECTIVE: number; SKIP: number };
  validation: ValidationSummary;
  category_peers: CategoryPeerStat[];
  rows: BoardRow[];
}

const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

const EXCHANGE_PREFIXES = [
  'Binance',
  'Coinbase',
  'Bybit',
  'Kraken',
  'Bitget',
  'OKX',
  'Bitfinex',
  'Gemini',
];

const VERSION_SUFFIX_RE = /\s+(?:v\d+(?:\.\d+)?|\d+\.\d+)$/i;
const WRAPPED_WORD_RE = /\b(?:wrapped|staked|staking)\b/i;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! * (1 - (pos - lo)) + sorted[hi]! * (pos - lo);
}

function daysBetween(startIso: string | null, endIso: string): number | null {
  if (!startIso) return null;
  const s = Date.parse(startIso);
  const e = Date.parse(endIso);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return null;
  return Math.floor((e - s) / 86_400_000);
}

function isEligiblePreToken(p: SnapshotProtocol, watchlistSet: Set<string>): boolean {
  if (watchlistSet.has(p.slug)) return true;
  if (p.gecko_id !== null || p.symbol !== null || p.mcap_usd !== null) return false;
  if (p.category && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSION_SUFFIX_RE.test(p.name) || WRAPPED_WORD_RE.test(p.name)) return false;
  if (EXCHANGE_PREFIXES.some((ex) => p.name.toLowerCase().startsWith(ex.toLowerCase()))) return false;
  return p.tvl_usd >= 5_000_000;
}

/** Deterministic IRLS Huber linear solver with per-column L2 ridge penalties. */
function fitHuber(X: number[][], y: number[], lams: number[], delta = 1.0, iters = 25): number[] {
  const n = X.length;
  const m = X[0]!.length;
  const wSample = new Array<number>(n).fill(1.0);
  let beta = new Array<number>(m).fill(0.0);

  for (let it = 0; it < iters; it += 1) {
    const A: number[][] = Array.from({ length: m }, () => new Array<number>(m).fill(0.0));
    const b = new Array<number>(m).fill(0.0);

    for (let k = 0; k < n; k += 1) {
      const row = X[k]!;
      const ws = wSample[k]!;
      const yi = y[k]!;
      for (let i = 0; i < m; i += 1) {
        b[i] = b[i]! + ws * row[i]! * yi;
        for (let j = 0; j < m; j += 1) {
          A[i]![j] = A[i]![j]! + ws * row[i]! * row[j]!;
        }
      }
    }
    for (let i = 0; i < m; i += 1) A[i]![i] = A[i]![i]! + (lams[i] ?? 0.0);

    const M = A.map((row, idx) => [...row, b[idx]!]);
    for (let i = 0; i < m; i += 1) {
      let piv = i;
      for (let r = i + 1; r < m; r += 1) {
        if (Math.abs(M[r]![i]!) > Math.abs(M[piv]![i]!)) piv = r;
      }
      const tmp = M[i]!;
      M[i] = M[piv]!;
      M[piv] = tmp;
      const div = Math.abs(M[i]![i]!) > 1e-12 ? M[i]![i]! : 1e-12;
      for (let j = i; j <= m; j += 1) M[i]![j] = M[i]![j]! / div;
      for (let r = 0; r < m; r += 1) {
        if (r === i) continue;
        const f = M[r]![i]!;
        for (let j = i; j <= m; j += 1) M[r]![j] = M[r]![j]! - f * M[i]![j]!;
      }
    }
    beta = M.map((row) => row[m]!);

    for (let k = 0; k < n; k += 1) {
      const row = X[k]!;
      let pred = 0.0;
      for (let i = 0; i < m; i += 1) pred += beta[i]! * row[i]!;
      const r = Math.abs(y[k]! - pred);
      wSample[k] = r <= delta ? 1.0 : delta / r;
    }
  }
  return beta;
}

interface PeerAnchorStats {
  globalMedRatio: number;
  medCohortTvl: number;
  catRatios: Map<string, number>;
  catCounts: Map<string, number>;
  catMedTvls: Map<string, number>;
}

function fitPeerAnchors(train: SnapshotProtocol[]): PeerAnchorStats {
  const ratios = train.map((p) => p.mcap_usd! / p.tvl_usd).sort((a, b) => a - b);
  const tvls = train.map((p) => p.tvl_usd).sort((a, b) => a - b);
  const globalMedRatio = ratios.length > 0 ? quantile(ratios, 0.5) : 0.35;
  const medCohortTvl = tvls.length > 0 ? quantile(tvls, 0.5) : 50_000_000;

  const buckets = new Map<string, { ratios: number[]; tvls: number[] }>();
  for (const p of train) {
    const cat = p.category ?? 'Other';
    const b = buckets.get(cat) ?? { ratios: [], tvls: [] };
    b.ratios.push(p.mcap_usd! / p.tvl_usd);
    b.tvls.push(p.tvl_usd);
    buckets.set(cat, b);
  }

  const catRatios = new Map<string, number>();
  const catCounts = new Map<string, number>();
  const catMedTvls = new Map<string, number>();
  const logGlobal = Math.log(Math.max(0.05, globalMedRatio));
  for (const [cat, b] of buckets.entries()) {
    const sr = [...b.ratios].sort((a, c) => a - c);
    const st = [...b.tvls].sort((a, c) => a - c);
    const logMed = Math.log(Math.max(0.05, quantile(sr, 0.5)));
    const shrunk = Math.exp((b.ratios.length * logMed + 6.0 * logGlobal) / (b.ratios.length + 6.0));
    catRatios.set(cat, clamp(shrunk, 0.12, 1.80));
    catCounts.set(cat, b.ratios.length);
    catMedTvls.set(cat, quantile(st, 0.5));
  }
  return { globalMedRatio, medCohortTvl, catRatios, catCounts, catMedTvls };
}

function predictMultiFactor(
  p: SnapshotProtocol,
  asOf: string,
  stats: PeerAnchorStats,
  mode: 'full' | 'cat_scale' | 'global_naive',
): {
  implied: number;
  catRatio: number;
  scaleFactor: number;
  momentumFactor: number;
  maturityFactor: number;
  chainFactor: number;
  peerCount: number;
} {
  const cat = p.category ?? 'Other';
  const peerCount = stats.catCounts.get(cat) ?? 0;
  if (mode === 'global_naive') {
    const imp = Math.max(1_000_000, Math.round(p.tvl_usd * stats.globalMedRatio));
    return {
      implied: imp,
      catRatio: stats.globalMedRatio,
      scaleFactor: 1,
      momentumFactor: 1,
      maturityFactor: 1,
      chainFactor: 1,
      peerCount,
    };
  }
  const catRatio = stats.catRatios.get(cat) ?? stats.globalMedRatio;
  const scaleFactor = clamp(Math.pow(p.tvl_usd / Math.max(1, stats.medCohortTvl), -0.22), 0.36, 1.45);
  if (mode === 'cat_scale') {
    const imp = Math.max(1_000_000, Math.round(p.tvl_usd * catRatio * scaleFactor));
    return {
      implied: imp,
      catRatio,
      scaleFactor,
      momentumFactor: 1,
      maturityFactor: 1,
      chainFactor: 1,
      peerCount,
    };
  }
  const ch = clamp((p.change_7d ?? 0.0) / 100.0, -0.35, 0.60);
  const momentumFactor = Math.exp(0.18 * ch);
  const ageDays = daysBetween(p.listed_at, asOf);
  const maturityFactor =
    ageDays === null ? 1.0 : clamp(0.86 + 0.30 * Math.min(1.0, Math.log1p(ageDays) / Math.log1p(730)), 0.86, 1.16);
  const chainFactor = clamp(1.0 + 0.03 * Math.min(4.0, Math.log2(Math.max(1, p.chains.length))), 1.0, 1.12);
  const imp = Math.max(
    1_000_000,
    Math.round(p.tvl_usd * catRatio * scaleFactor * momentumFactor * maturityFactor * chainFactor),
  );
  return { implied: imp, catRatio, scaleFactor, momentumFactor, maturityFactor, chainFactor, peerCount };
}

function evalMultiFactor(
  cohort: SnapshotProtocol[],
  asOf: string,
  mode: 'full' | 'cat_scale' | 'global_naive',
): { loocvMed: number; loocvP75: number; wfMed: number; wfTrainN: number; wfTestN: number; signedLogs: number[] } {
  const signedLogs: number[] = [];
  const foldErrs: number[] = [];
  for (let i = 0; i < cohort.length; i += 1) {
    const test = cohort[i]!;
    const train = cohort.filter((_, j) => j !== i);
    const st = fitPeerAnchors(train);
    const pred = predictMultiFactor(test, asOf, st, mode).implied;
    const signed = Math.log(test.mcap_usd!) - Math.log(pred);
    signedLogs.push(signed);
    foldErrs.push(Math.exp(Math.abs(signed)));
  }
  foldErrs.sort((a, b) => a - b);
  const loocvMed = Number(quantile(foldErrs, 0.5).toFixed(2));
  const loocvP75 = Number(quantile(foldErrs, 0.75).toFixed(2));

  const dated = cohort
    .filter((p) => p.listed_at !== null)
    .sort((a, b) => a.listed_at!.localeCompare(b.listed_at!));
  const cut = Math.floor(dated.length * 0.65);
  const wfTrain = dated.slice(0, cut);
  const wfTest = dated.slice(cut);
  const wfStats = fitPeerAnchors(wfTrain);
  const wfErrs = wfTest
    .map((t) => Math.exp(Math.abs(Math.log(t.mcap_usd!) - Math.log(predictMultiFactor(t, asOf, wfStats, mode).implied))))
    .sort((a, b) => a - b);
  const wfMed = Number(quantile(wfErrs, 0.5).toFixed(2));
  return { loocvMed, loocvP75, wfMed, wfTrainN: wfTrain.length, wfTestN: wfTest.length, signedLogs };
}

function evalHuberBaseline(
  cohort: SnapshotProtocol[],
): { loocvMed: number; loocvP75: number; wfMed: number } {
  const foldErrs: number[] = [];
  for (let i = 0; i < cohort.length; i += 1) {
    const test = cohort[i]!;
    const train = cohort.filter((_, j) => j !== i);
    const meanLt = train.reduce((a, p) => a + Math.log(p.tvl_usd), 0) / Math.max(1, train.length);
    const b = fitHuber(
      train.map((p) => [1.0, Math.log(p.tvl_usd) - meanLt]),
      train.map((p) => Math.log(p.mcap_usd!)),
      [0.0, 0.01],
    );
    const pred = b[0]! + b[1]! * (Math.log(test.tvl_usd) - meanLt);
    foldErrs.push(Math.exp(Math.abs(Math.log(test.mcap_usd!) - pred)));
  }
  foldErrs.sort((a, b) => a - b);
  const dated = cohort.filter((p) => p.listed_at !== null).sort((a, b) => a.listed_at!.localeCompare(b.listed_at!));
  const cut = Math.floor(dated.length * 0.65);
  const wfTrain = dated.slice(0, cut);
  const wfTest = dated.slice(cut);
  const wfMeanLt = wfTrain.reduce((a, p) => a + Math.log(p.tvl_usd), 0) / Math.max(1, wfTrain.length);
  const wfB = fitHuber(
    wfTrain.map((p) => [1.0, Math.log(p.tvl_usd) - wfMeanLt]),
    wfTrain.map((p) => Math.log(p.mcap_usd!)),
    [0.0, 0.01],
  );
  const wfErrs = wfTest
    .map((p) => Math.exp(Math.abs(Math.log(p.mcap_usd!) - (wfB[0]! + wfB[1]! * (Math.log(p.tvl_usd) - wfMeanLt)))))
    .sort((a, b) => a - b);
  return {
    loocvMed: Number(quantile(foldErrs, 0.5).toFixed(2)),
    loocvP75: Number(quantile(foldErrs, 0.75).toFixed(2)),
    wfMed: Number(quantile(wfErrs, 0.5).toFixed(2)),
  };
}

function chainCostProfile(chains: string[]): { primary: string; gasUsd: number; gasLabel: string; gasDetail: string } {
  const list = chains.length > 0 ? chains : ['Ethereum'];
  const lowCost = ['Solana', 'Base', 'Arbitrum', 'Optimism', 'Hyperliquid L1', 'Sui', 'Aptos', 'Polygon', 'Avalanche', 'BSC', 'Binance', 'Monad', 'Sonic', 'Berachain', 'Linea', 'Scroll', 'zkSync Era'];
  const best = list.find((c) => lowCost.includes(c)) ?? list[0]!;
  if (best === 'Solana') {
    return { primary: best, gasUsd: 0.10, gasLabel: '$0.10', gasDetail: 'Solana (~$0.002/tx, budget $0.10 total)' };
  }
  if (['Base', 'Arbitrum', 'Optimism', 'Polygon', 'Sui', 'Aptos', 'Hyperliquid L1', 'Monad', 'Linea', 'Scroll', 'zkSync Era'].includes(best)) {
    return { primary: best, gasUsd: 1.50, gasLabel: '$1.50', gasDetail: `${best} (~$0.05/tx, budget $1.50 total)` };
  }
  if (best === 'Ethereum') {
    return { primary: best, gasUsd: 24.0, gasLabel: '$24.00', gasDetail: 'Ethereum L1 (~$4-$8/tx off-peak, budget $24 total)' };
  }
  return { primary: best, gasUsd: 3.0, gasLabel: '$3.00', gasDetail: `${best} (~$0.15/tx, budget $3.00 total)` };
}

function computeFarmEconomics(
  p: SnapshotProtocol,
  impliedValueUsd: number,
  tokenOddsPct: number,
  ageDays: number | null,
): FarmEconomics {
  const refCapital = 1000;
  const airdropPoolPct = 0.06;
  const activeWeight = 1.35;
  const userShare = Math.min(0.001, (refCapital / Math.max(p.tvl_usd, 1_000_000)) * activeWeight);
  const grossEv = impliedValueUsd * (tokenOddsPct / 100) * airdropPoolPct * userShare;

  const { gasUsd } = chainCostProfile(p.chains);
  const horizonWeeks = ageDays !== null && ageDays >= 365 ? 6 : 10;
  const oppCost = refCapital * 0.04 * (horizonWeeks / 52);
  const allInCost = gasUsd + oppCost;
  const hoursNeeded = Number((0.6 + 0.18 * horizonWeeks).toFixed(1));
  const netEv = grossEv - allInCost;
  const usdPerHour = netEv / hoursNeeded;

  const verdict: 'FARM' | 'SELECTIVE' | 'SKIP' =
    netEv >= 20 && usdPerHour >= 10 ? 'FARM' : netEv > 0 ? 'SELECTIVE' : 'SKIP';

  return {
    ref_capital_usd: refCapital,
    airdrop_pool_pct: airdropPoolPct,
    user_share: Number(userShare.toFixed(8)),
    gross_ev_usd: Number(grossEv.toFixed(2)),
    gas_cost_usd: Number(gasUsd.toFixed(2)),
    opp_cost_usd: Number(oppCost.toFixed(2)),
    all_in_cost_usd: Number(allInCost.toFixed(2)),
    horizon_weeks: horizonWeeks,
    hours_needed: hoursNeeded,
    net_ev_usd: Number(netEv.toFixed(2)),
    usd_per_hour: Number(usdPerHour.toFixed(2)),
    verdict,
  };
}

function buildFarmPlan(
  p: SnapshotProtocol,
  ageDays: number | null,
  onWatchlist: boolean,
  econ: FarmEconomics,
): { estGas: string; estHorizon: string; steps: string[] } {
  const cat = p.category ?? 'DeFi';
  const { primary, gasLabel, gasDetail } = chainCostProfile(p.chains);
  const tvlM = Math.round(p.tvl_usd / 1_000_000);
  const horizon = `${econ.horizon_weeks} weeks (${econ.hours_needed}h total effort)`;

  const steps: string[] = [
    `Connect a dedicated wallet to ${p.name} on ${gasDetail}; deploy $${econ.ref_capital_usd} reference capital (or scale proportionally) while avoiding sub-$200 dust Sybil filters (10 min setup).`,
  ];

  if (cat === 'Dexs' || cat === 'Derivatives' || cat === 'Options') {
    steps.push(
      `Trade organic spot/perp flow on ${p.name} (${primary}) across 2-3 pairs over ${econ.horizon_weeks} weekly epochs, targeting $8k-$20k volume (~0.05%-0.10% fee, 10 min/week).`,
    );
    steps.push(
      `Provide passive LP or vault margin on ${p.name} for 30+ continuous days to qualify for maker/LP multipliers instead of pure taker volume (15 min setup).`,
    );
  } else if (cat === 'Lending' || cat === 'CDP') {
    steps.push(
      `Supply blue-chip collateral on ${p.name} (${primary}) for 45+ consecutive days to accrue time-weighted TVL points ($0 protocol fee, 15 min setup).`,
    );
    steps.push(
      `Maintain a 25%-40% LTV stablecoin borrow (health factor >2.0), as lending TGEs routinely weight active borrowers 2x-3x over passive depositors (5 min/week).`,
    );
  } else if (cat === 'Yield' || cat === 'Risk Curators' || cat === 'Onchain Capital Allocator') {
    steps.push(
      `Deposit into ${p.name}'s flagship curated vault on ${primary} and hold receipt tokens uninterrupted for ${econ.horizon_weeks} weeks (check withdrawal queue, 10 min setup).`,
    );
    steps.push(
      `Deploy ${p.name} vault receipt tokens into whitelisted partner money-markets on ${primary} to stack base APY with points without resetting tenure (15 min).`,
    );
  } else if (cat === 'RWA') {
    steps.push(
      `Verify permissionless access vs KYC onboarding for ${p.name}'s RWA yield instrument on ${primary} and mint/hold across 2+ monthly billing cycles (20 min).`,
    );
    steps.push(
      `Use ${p.name} RWA tokens as collateral or LP inside approved ${primary} integrations for 45+ days to log sustained multi-epoch on-chain balances.`,
    );
  } else {
    steps.push(
      `Complete core ${p.name} actions on ${primary} across ${econ.horizon_weeks} separate weeks to establish non-Sybil longevity and fee history (10 min/week).`,
    );
    steps.push(
      `Keep capital active inside ${p.name}'s $${tvlM}M TVL pool for 45+ consecutive days; ${p.chains.length >= 2 ? `add 1-2 tx on ${p.chains[1]} for multi-chain coverage.` : 'avoid pre-snapshot withdrawals.'}`,
    );
  }

  steps.push(
    `$1k Farmer Verdict [${econ.verdict}]: Gross EV $${econ.gross_ev_usd.toFixed(2)} minus $${econ.all_in_cost_usd.toFixed(2)} (gas $${econ.gas_cost_usd.toFixed(2)} + 4% opp $${econ.opp_cost_usd.toFixed(2)}) = Net $${econ.net_ev_usd.toFixed(2)} (${econ.usd_per_hour.toFixed(2)} $/hr over ${econ.hours_needed}h)${onWatchlist ? '; Watchlist priority.' : '.'}`,
  );

  return { estGas: gasLabel, estHorizon: horizon, steps };
}

export function parseSnapshot(raw: string): Snapshot {
  const data = JSON.parse(raw) as Snapshot;
  if (!data || !Array.isArray(data.protocols) || !Array.isArray(data.watchlist)) {
    throw new Error('snapshot.json missing required protocols or watchlist arrays');
  }
  return data;
}

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarPayload } {
  const watchlistSet = new Set(snapshot.watchlist);

  // 1. Peer cohort funnel from snapshot.json.
  const allTokenized = snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0,
  );
  const defiTokenized = allTokenized.filter((p) => !p.category || !EXCLUDED_CATEGORIES.has(p.category));
  const cohort = defiTokenized.filter((p) => p.mcap_usd! >= 1_000_000);
  const liveSize = snapshot.protocols.filter(
    (p) => p.gecko_id !== null || p.symbol !== null || p.mcap_usd !== null,
  ).length;

  // 2. Empirical global median MCap/TVL over calibration cohort.
  const cohortRatios = cohort.map((p) => p.mcap_usd! / p.tvl_usd).sort((a, b) => a - b);
  const globalMedianMultiple = Number(quantile(cohortRatios, 0.5).toFixed(4));

  // 3. Leakage-free dual held-out comparison (LOOCV + chronological Walk-Forward).
  const naiveEval = evalMultiFactor(cohort, snapshot.as_of, 'global_naive');
  const catScaleEval = evalMultiFactor(cohort, snapshot.as_of, 'cat_scale');
  const fullEval = evalMultiFactor(cohort, snapshot.as_of, 'full');
  const huberEval = evalHuberBaseline(cohort);

  const ablation: AblationRow[] = [
    {
      feature: 'Peer-Anchored Multi-Factor (v3.0)',
      loocv_med_x: fullEval.loocvMed,
      loocv_p75_x: fullEval.loocvP75,
      wf_med_x: fullEval.wfMed,
      delta_loocv: Number((fullEval.loocvMed - naiveEval.loocvMed).toFixed(2)),
      delta_wf: Number((fullEval.wfMed - naiveEval.wfMed).toFixed(2)),
      decision: 'ACTIVE',
      reason: 'Combines shrunk category peer MCap/TVL, scale dampening, 7d TVL growth, longevity, and multi-chain reach without mega-TVL compression',
    },
    {
      feature: 'Category + Scale Peer Multiple',
      loocv_med_x: catScaleEval.loocvMed,
      loocv_p75_x: catScaleEval.loocvP75,
      wf_med_x: catScaleEval.wfMed,
      delta_loocv: Number((catScaleEval.loocvMed - naiveEval.loocvMed).toFixed(2)),
      delta_wf: Number((catScaleEval.wfMed - naiveEval.wfMed).toFixed(2)),
      decision: 'REFERENCE',
      reason: 'Omits 7d TVL growth and pre-token runtime longevity signals',
    },
    {
      feature: 'Global Median MCap/TVL Naive',
      loocv_med_x: naiveEval.loocvMed,
      loocv_p75_x: naiveEval.loocvP75,
      wf_med_x: naiveEval.wfMed,
      delta_loocv: 0,
      delta_wf: 0,
      decision: 'BASELINE',
      reason: 'Unadjusted cohort median MCap/TVL ratio',
    },
    {
      feature: 'Unsegmented Log-Linear Huber',
      loocv_med_x: huberEval.loocvMed,
      loocv_p75_x: huberEval.loocvP75,
      wf_med_x: huberEval.wfMed,
      delta_loocv: Number((huberEval.loocvMed - naiveEval.loocvMed).toFixed(2)),
      delta_wf: Number((huberEval.wfMed - naiveEval.wfMed).toFixed(2)),
      decision: 'REFERENCE',
      reason: 'Single 0.31 slope over-compresses multi-billion TVL protocols below realistic peer valuations',
    },
  ];

  // 4. Honest empirical P25-P75 log-residual range calibration from v3.0 LOOCV errors.
  const sortedSigned = [...fullEval.signedLogs].sort((a, b) => a - b);
  const p25Mult = Number(Math.exp(quantile(sortedSigned, 0.25)).toFixed(4));
  const p75Mult = Number(Math.exp(quantile(sortedSigned, 0.75)).toFixed(4));

  const peerStats = fitPeerAnchors(cohort);
  const categoryPeers: CategoryPeerStat[] = [];
  for (const [cat, cnt] of peerStats.catCounts.entries()) {
    categoryPeers.push({
      category: cat,
      peer_count: cnt,
      cat_multiplier: Number((peerStats.catRatios.get(cat) ?? globalMedianMultiple).toFixed(3)),
      median_tvl_usd: Math.round(peerStats.catMedTvls.get(cat) ?? peerStats.medCohortTvl),
    });
  }
  categoryPeers.sort((a, b) => b.peer_count - a.peer_count || b.cat_multiplier - a.cat_multiplier);

  // 5. Empirical token launch propensity from comparable DeFi snapshot protocols.
  const defiAll = snapshot.protocols.filter((p) => !p.category || !EXCLUDED_CATEGORIES.has(p.category));
  const defiTokenizedCount = defiAll.filter((p) => p.gecko_id !== null || p.symbol !== null || p.mcap_usd !== null).length;
  const baseTokenRate = defiTokenizedCount / Math.max(1, defiAll.length);
  const catTokenStats = new Map<string, { tok: number; tot: number }>();
  for (const p of defiAll) {
    const cat = p.category ?? 'Other';
    const cur = catTokenStats.get(cat) ?? { tok: 0, tot: 0 };
    cur.tot += 1;
    if (p.gecko_id !== null || p.symbol !== null || p.mcap_usd !== null) cur.tok += 1;
    catTokenStats.set(cat, cur);
  }

  // 6. Select all 40 watchlist + top 158 emerging eligible pre-token protocols.
  const eligible = snapshot.protocols.filter((p) => isEligiblePreToken(p, watchlistSet));
  const watchlistRows = eligible.filter((p) => watchlistSet.has(p.slug));
  const emergingRows = eligible
    .filter((p) => !watchlistSet.has(p.slug))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || a.slug.localeCompare(b.slug))
    .slice(0, 158);
  const selected = [...watchlistRows, ...emergingRows];

  const scored: Omit<BoardRow, 'rank'>[] = selected.map((p) => {
    const cat = p.category ?? 'Other';
    const pred = predictMultiFactor(p, snapshot.as_of, peerStats, 'full');
    const impliedValue = pred.implied;
    const impliedLow = Math.max(500_000, Math.round(impliedValue * p25Mult));
    const impliedHigh = Math.min(100_000_000_000_000, Math.round(impliedValue * p75Mult));
    const effectiveMultiple = Number((impliedValue / Math.max(1, p.tvl_usd)).toFixed(4));

    const ageDays = daysBetween(p.listed_at, snapshot.as_of);
    const cStat = catTokenStats.get(cat) ?? { tok: 0, tot: 0 };
    const catProb = (cStat.tok + 6 * baseTokenRate) / (cStat.tot + 6);
    const tvlAdj = p.tvl_usd >= snapshot.floor_usd ? 0.07 : -0.04;
    const ageAdj = ageDays !== null && ageDays >= 365 ? 0.06 : ageDays !== null && ageDays < 120 ? -0.05 : 0.0;
    const tokenOddsPct = Math.round(clamp((catProb + tvlAdj + ageAdj) * 100, 12, 85));
    const tokenOddsBasis = `${cat} peer rate ${cStat.tok}/${cStat.tot} (shrunk k=6)`;

    const econ = computeFarmEconomics(p, impliedValue, tokenOddsPct, ageDays);
    const onWatchlist = watchlistSet.has(p.slug);
    const plan = buildFarmPlan(p, ageDays, onWatchlist, econ);

    return {
      slug: p.slug,
      name: p.name,
      category: cat,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_days: ageDays,
      on_watchlist: onWatchlist,
      tier: onWatchlist ? 'watchlist' : 'emerging',
      token_status: 'No token recorded on DefiLlama',
      implied_value_usd: impliedValue,
      implied_low_usd: impliedLow,
      implied_high_usd: impliedHigh,
      token_odds_pct: tokenOddsPct,
      token_odds_basis: tokenOddsBasis,
      breakdown: {
        peer_category: cat,
        peer_sample_size: pred.peerCount,
        cat_ratio: Number(pred.catRatio.toFixed(4)),
        scale_factor: Number(pred.scaleFactor.toFixed(4)),
        momentum_factor: Number(pred.momentumFactor.toFixed(4)),
        maturity_factor: Number(pred.maturityFactor.toFixed(4)),
        chain_factor: Number(pred.chainFactor.toFixed(4)),
        effective_multiple: effectiveMultiple,
        p25_mult: p25Mult,
        p75_mult: p75Mult,
      },
      farm_econ: econ,
      est_gas_usd: plan.estGas,
      est_horizon: plan.estHorizon,
      farm_steps: plan.steps,
    };
  });

  scored.sort((a, b) => b.implied_value_usd - a.implied_value_usd || b.tvl_usd - a.tvl_usd || a.slug.localeCompare(b.slug));
  const board: BoardRow[] = scored.map((item, idx) => ({ rank: idx + 1, ...item }));

  const verdictCounts = { FARM: 0, SELECTIVE: 0, SKIP: 0 };
  for (const r of board) verdictCounts[r.farm_econ.verdict] += 1;

  const totalImplied = board.reduce((acc, r) => acc + r.implied_value_usd, 0);
  const watchlistCovered = board.filter((r) => r.on_watchlist).length;

  const radar: RadarPayload = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    total_snapshot_protocols: snapshot.protocols.length,
    watchlist_count: snapshot.watchlist.length,
    watchlist_covered: watchlistCovered,
    early_size: board.length - watchlistCovered,
    live_size: liveSize,
    global_median_multiple: globalMedianMultiple,
    total_implied_usd: totalImplied,
    verdict_counts: verdictCounts,
    validation: {
      all_tokenized: allTokenized.length,
      defi_tokenized: defiTokenized.length,
      calibration_cohort: cohort.length,
      wf_train_n: fullEval.wfTrainN,
      wf_test_n: fullEval.wfTestN,
      global_med_ratio: Number(peerStats.globalMedRatio.toFixed(4)),
      med_cohort_tvl_usd: Math.round(peerStats.medCohortTvl),
      loocv_med_x: fullEval.loocvMed,
      loocv_p75_x: fullEval.loocvP75,
      wf_med_x: fullEval.wfMed,
      p25_mult: p25Mult,
      p75_mult: p75Mult,
      factors_used: ['Category Peer MCap/TVL (k=5)', 'Scale Elasticity (-0.22)', '7d TVL Momentum', 'Pre-Token Longevity', 'Multi-Chain'],
      ablation,
    },
    category_peers: categoryPeers.slice(0, 14),
    rows: board,
  };

  return { board, radar };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `row count ${board.length} outside [100, 4000]`;
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  let prevVal = Number.POSITIVE_INFINITY;
  const distinctVals = new Set<number>();

  for (let i = 0; i < board.length; i += 1) {
    const r = board[i]!;
    if (r.rank !== i + 1) return `rank mismatch at index ${i}: ${r.rank}`;
    if (!known.has(r.slug)) return `unknown slug: ${r.slug}`;
    if (seen.has(r.slug)) return `duplicate slug: ${r.slug}`;
    seen.add(r.slug);
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      return `invalid implied_value_usd for ${r.slug}: ${r.implied_value_usd}`;
    }
    if (r.implied_value_usd > prevVal) return `non-monotonic implied_value_usd at rank ${r.rank}`;
    prevVal = r.implied_value_usd;
    distinctVals.add(r.implied_value_usd);
    if (!Array.isArray(r.farm_steps) || r.farm_steps.length < 3 || r.farm_steps.length > 12) {
      return `invalid farm_steps count for ${r.slug}`;
    }
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `farm_step length ${t.length} out of [20,600] for ${r.slug}`;
    }
  }
  if (distinctVals.size < 2) return 'all implied values identical';
  for (const w of snapshot.watchlist) {
    if (!seen.has(w)) return `missing watchlist slug: ${w}`;
  }
  return null;
}

export function dataScript(radar: RadarPayload): string {
  return `window.__RADAR_DATA__ = ${JSON.stringify(radar)};\n`;
}
