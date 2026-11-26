// Quantitative pre-token protocol valuation & farming playbook engine for token-radar-01.
// Zero external dependencies; derives category multiples, growth adjustments, longevity
// premiums, and chain-specific costed farm plans purely from the sealed DefiLlama snapshot.

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
  base_multiple: number;
  scale_factor: number;
  momentum_factor: number;
  maturity_factor: number;
  chain_factor: number;
  effective_multiple: number;
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
  breakdown: ValuationBreakdown;
  est_gas_usd: string;
  est_horizon: string;
  farm_steps: string[];
}

export interface CategoryPeerStat {
  category: string;
  peer_count: number;
  median_multiple: number;
  median_tvl_usd: number;
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

function median(values: number[]): number {
  if (values.length === 0) return 0.45;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
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

function chainCostProfile(chains: string[]): { primary: string; gasLabel: string; gasDetail: string } {
  const list = chains.length > 0 ? chains : ['Ethereum'];
  const lowCost = ['Solana', 'Base', 'Arbitrum', 'Optimism', 'Hyperliquid L1', 'Sui', 'Aptos', 'Polygon', 'Avalanche', 'BSC', 'Binance', 'Monad', 'Sonic', 'Berachain', 'Linea', 'Scroll', 'zkSync Era'];
  const best = list.find((c) => lowCost.includes(c)) ?? list[0]!;
  if (best === 'Solana') {
    return { primary: best, gasLabel: '$0.01-$0.05', gasDetail: 'Solana (~$0.002/tx, budget $0.05 total for 15-20 tx)' };
  }
  if (['Base', 'Arbitrum', 'Optimism', 'Polygon', 'Sui', 'Aptos', 'Hyperliquid L1', 'Monad', 'Linea'].includes(best)) {
    return { primary: best, gasLabel: '$0.20-$1.50', gasDetail: `${best} (~$0.03-$0.15/tx, budget $1.50 gas for 10+ actions)` };
  }
  if (best === 'Ethereum') {
    return { primary: best, gasLabel: '$12-$35', gasDetail: 'Ethereum L1 (~$3-$8/tx during off-peak <15 gwei, budget $15-$35 total)' };
  }
  return { primary: best, gasLabel: '$0.50-$3.00', gasDetail: `${best} (~$0.05-$0.30/tx, budget $1-$3 gas across setup and weekly activity)` };
}

function buildFarmPlan(p: SnapshotProtocol, ageDays: number | null, onWatchlist: boolean): { estGas: string; estHorizon: string; steps: string[] } {
  const cat = p.category ?? 'DeFi';
  const { primary, gasLabel, gasDetail } = chainCostProfile(p.chains);
  const tvlM = Math.round(p.tvl_usd / 1_000_000);
  const capitalHint = tvlM >= 500
    ? '$1,000-$5,000+ (high-TVL pool; avoid sub-$200 dust wallets that get Sybil-filtered)'
    : tvlM >= 50
      ? '$300-$1,500 (mid-cap pool where consistent weekly activity beats single-day spikes)'
      : '$150-$750 (early-stage TVL pool with lower dilution per dollar deposited)';
  const horizon = ageDays !== null && ageDays >= 365
    ? '4-8 weeks (mature pre-token protocol; snapshot risk is elevated)'
    : '8-16 weeks (early/growth cycle; prioritize sustained multi-month retention)';

  const steps: string[] = [
    `Verify official ${p.name} app domain and connect a dedicated farming wallet on ${gasDetail}; fund ${capitalHint} before transacting (10 min setup).`,
  ];

  if (cat === 'Dexs' || cat === 'Derivatives' || cat === 'Options') {
    steps.push(
      `Execute organic spot or perpetual trades on ${p.name} across ${primary} spanning 2-3 distinct pairs, targeting $5,000-$25,000 cumulative volume over 4+ separate weeks (5-10 min/week, ~0.05%-0.10% maker/taker fee).`,
    );
    steps.push(
      `Provide liquidity or vault margin for at least 30 continuous days in a high-utilization ${p.name} pool to qualify for LP/maker points tiers rather than pure taker volume (15 min setup, monitor weekly for range/IL).`,
    );
  } else if (cat === 'Lending' || cat === 'CDP') {
    steps.push(
      `Supply blue-chip collateral (ETH, WBTC, SOL, or major stablecoins) on ${p.name} (${primary}) and maintain an active deposit for 30-60+ days to accrue time-weighted TVL points (15 min setup, $0 protocol fee).`,
    );
    steps.push(
      `Borrow a conservative 25%-40% LTV stablecoin position on ${p.name} and keep health factor above 2.0, as lending airdrops historically weight active borrowers 2x-3x higher than passive lenders (5 min/week health check).`,
    );
  } else if (cat === 'Yield' || cat === 'Risk Curators' || cat === 'Onchain Capital Allocator') {
    steps.push(
      `Deposit into ${p.name}'s flagship curated vault on ${primary} and hold vault receipt tokens uninterrupted for 45+ days to capture full epoch multipliers (10 min setup; check vault withdrawal queue period).`,
    );
    steps.push(
      `Check if ${p.name} vault receipt tokens can be used as collateral or LP paired on partner venues on ${primary} to stack base yield plus protocol points without exiting the position (15 min setup).`,
    );
  } else if (cat === 'RWA') {
    steps.push(
      `Mint or acquire ${p.name}'s primary RWA yield instrument on ${primary} (confirm if permissionless secondary liquidity is available or if issuer onboarding is required; 15-30 min setup).`,
    );
    steps.push(
      `Hold or deploy the ${p.name} RWA token inside whitelisted DeFi integrations on ${primary} for 60+ days to log sustained on-chain balance snapshots across multiple billing cycles.`,
    );
  } else {
    steps.push(
      `Complete core protocol actions on ${p.name} via ${primary} across at least 6 distinct weekly epochs to build non-Sybil longevity and fee contribution history (10 min/week).`,
    );
    steps.push(
      `Maintain an active on-chain balance or staked position in ${p.name} (${tvlM >= 50 ? 'top-tier' : 'emerging'} $${tvlM}M TVL pool) for at least 30-60 consecutive days before rotating capital.`,
    );
  }

  if (p.chains.length >= 2) {
    steps.push(
      `Log at least 1-2 secondary transactions on a second supported chain (${p.chains.slice(0, 3).join(', ')}) and complete any official guild, referral, or governance-forum verification tasks (15 min, ~$1-$3 gas).`,
    );
  } else {
    steps.push(
      `Track ${p.name}'s official announcements and points dashboard weekly (${horizon}) so you claim within window and avoid withdrawing right before an unannounced TGE snapshot (5 min/week).`,
    );
  }

  if (onWatchlist) {
    steps.push(
      `Watchlist priority check: $${tvlM}M TVL with no DefiLlama-recorded token means high TGE attention; keep wallet history clean (avoid circular transfers with linked wallets) and re-evaluate after any 20%+ 7d TVL shift.`,
    );
  }

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

  // 1. Calibrate empirical MCap/TVL multiples from tokenized protocols in the snapshot itself.
  const allMultiples: number[] = [];
  const byCategory = new Map<string, { multiples: number[]; tvls: number[] }>();

  let liveSize = 0;
  for (const p of snapshot.protocols) {
    if (p.gecko_id !== null || p.symbol !== null || p.mcap_usd !== null) {
      liveSize += 1;
    }
    if (p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0) {
      const ratio = clamp(p.mcap_usd / p.tvl_usd, 0.08, 3.0);
      allMultiples.push(ratio);
      const cat = p.category ?? 'Other';
      const bucket = byCategory.get(cat) ?? { multiples: [], tvls: [] };
      bucket.multiples.push(ratio);
      bucket.tvls.push(p.tvl_usd);
      byCategory.set(cat, bucket);
    }
  }

  const globalMedian = Number(clamp(median(allMultiples), 0.2, 1.5).toFixed(4));
  const categoryPeers: CategoryPeerStat[] = [];
  const categoryMultipleMap = new Map<string, { mult: number; n: number }>();

  for (const [cat, bucket] of byCategory.entries()) {
    // Shrinkage toward global median when sample size is small (Bayesian smoothing, k=3).
    const rawMed = median(bucket.multiples);
    const n = bucket.multiples.length;
    const smoothed = (n * rawMed + 3 * globalMedian) / (n + 3);
    const clamped = Number(clamp(smoothed, 0.14, 2.2).toFixed(4));
    categoryMultipleMap.set(cat, { mult: clamped, n });
    categoryPeers.push({
      category: cat,
      peer_count: n,
      median_multiple: clamped,
      median_tvl_usd: Math.round(median(bucket.tvls)),
    });
  }
  categoryPeers.sort((a, b) => b.peer_count - a.peer_count || b.median_multiple - a.median_multiple);

  // 2. Select all 40 watchlist protocols + top eligible pre-token protocols below floor (target ~220 rows).
  const eligible = snapshot.protocols.filter((p) => isEligiblePreToken(p, watchlistSet));
  const watchlistRows = eligible.filter((p) => watchlistSet.has(p.slug));
  const emergingRows = eligible
    .filter((p) => !watchlistSet.has(p.slug))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || a.slug.localeCompare(b.slug))
    .slice(0, 180);

  const selected = [...watchlistRows, ...emergingRows];

  // 3. Score each protocol strictly from snapshot metrics (TVL, peer multiple, 7d growth, longevity, chains).
  const scored: Omit<BoardRow, 'rank'>[] = selected.map((p) => {
    const cat = p.category ?? 'Other';
    const peerInfo = categoryMultipleMap.get(cat) ?? { mult: globalMedian, n: 0 };
    const baseMultiple = peerInfo.mult;

    // Gentle TVL scale compression so mega-TVL pools don't extrapolate linearly.
    const scaleFactor = Number(clamp(Math.pow(Math.max(p.tvl_usd, 1_000_000) / 100_000_000, -0.055), 0.80, 1.16).toFixed(4));

    // 7-day TVL momentum adjustment.
    const ch7 = p.change_7d ?? 0;
    const momentumFactor = Number(clamp(1 + ch7 * 0.004, 0.85, 1.25).toFixed(4));

    // Longevity/Lindy factor: protocols running longer with no token carry higher TGE maturity.
    const ageDays = daysBetween(p.listed_at, snapshot.as_of);
    const maturityFactor = ageDays !== null
      ? Number(clamp(0.88 + 0.11 * Math.log1p(ageDays / 180), 0.88, 1.18).toFixed(4))
      : 0.96;

    // Multi-chain footprint factor.
    const chainCount = Math.max(1, p.chains.length);
    const chainFactor = Number(clamp(1 + 0.028 * Math.min(chainCount - 1, 6), 1.0, 1.168).toFixed(4));

    const effectiveMultiple = Number((baseMultiple * scaleFactor * momentumFactor * maturityFactor * chainFactor).toFixed(4));
    const impliedValue = Math.max(100_000, Math.round(p.tvl_usd * effectiveMultiple));

    const onWatchlist = watchlistSet.has(p.slug);
    const plan = buildFarmPlan(p, ageDays, onWatchlist);

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
      breakdown: {
        peer_category: cat,
        peer_sample_size: peerInfo.n,
        base_multiple: baseMultiple,
        scale_factor: scaleFactor,
        momentum_factor: momentumFactor,
        maturity_factor: maturityFactor,
        chain_factor: chainFactor,
        effective_multiple: effectiveMultiple,
      },
      est_gas_usd: plan.estGas,
      est_horizon: plan.estHorizon,
      farm_steps: plan.steps,
    };
  });

  // Sort strictly descending by implied_value_usd, then tvl_usd, then slug for deterministic output.
  scored.sort((a, b) => b.implied_value_usd - a.implied_value_usd || b.tvl_usd - a.tvl_usd || a.slug.localeCompare(b.slug));

  const board: BoardRow[] = scored.map((item, idx) => ({
    rank: idx + 1,
    ...item,
  }));

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
    global_median_multiple: globalMedian,
    total_implied_usd: totalImplied,
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
