// Interactive Token Launch Radar v2 dashboard (zero dependencies, zero network).
(function () {
  const data = window.__RADAR_DATA__;
  if (!data || !Array.isArray(data.rows)) return;

  const state = {
    tier: 'all',
    search: '',
    verdict: '',
    category: '',
    chain: '',
    sortKey: 'rank',
    sortDir: 'asc',
  };

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

  function fmtUsd(n) {
    if (n == null || !Number.isFinite(n)) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + Math.round(n);
  }

  function fmtPct(v) {
    if (v == null || !Number.isFinite(v)) return '—';
    return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function verdictBadge(v) {
    if (v === 'FARM') return '<span class="badge badge-farm">FARM</span>';
    if (v === 'SELECTIVE') return '<span class="badge badge-sel">SELECTIVE</span>';
    return '<span class="badge badge-skip">SKIP</span>';
  }

  function initHeaderAndKpis() {
    const val = data.validation;
    document.getElementById('meta-pills').innerHTML = [
      `<span class="meta-pill">Snapshot <strong>${esc(data.as_of)}</strong></span>`,
      `<span class="meta-pill">Watchlist <strong>${data.watchlist_covered}/${data.watchlist_count}</strong></span>`,
      `<span class="meta-pill">DeFi Peers <strong>${val.calibration_cohort}/${val.all_tokenized}</strong></span>`,
      `<span class="meta-pill">Live Excluded <strong>${data.live_size}</strong></span>`,
    ].join('');

    const topRow = data.rows[0];
    const vc = data.verdict_counts;

    document.getElementById('kpi-grid').innerHTML = [
      `<div class="kpi"><div class="kpi-label">Total Pre-Token Implied Value</div><div class="kpi-val accent">${fmtUsd(data.total_implied_usd)}</div><div class="kpi-sub">${data.rows.length} protocols (${data.watchlist_covered} watchlist + ${data.early_size} emerging)</div></div>`,
      `<div class="kpi"><div class="kpi-label">#1 Ranked Protocol</div><div class="kpi-val">${esc(topRow.name)}</div><div class="kpi-sub">${fmtUsd(topRow.implied_value_usd)} [${fmtUsd(topRow.implied_low_usd)}–${fmtUsd(topRow.implied_high_usd)}]</div></div>`,
      `<div class="kpi"><div class="kpi-label">Held-Out Accuracy (LOOCV / WF)</div><div class="kpi-val teal">${val.loocv_med_x.toFixed(2)}x / ${val.wf_med_x.toFixed(2)}x</div><div class="kpi-sub">Peer-anchored 5-factor · P25–P75: ${val.p25_mult.toFixed(2)}x–${val.p75_mult.toFixed(2)}x</div></div>`,
      `<div class="kpi"><div class="kpi-label">$1k Farmer Verdicts</div><div class="kpi-val pos">${vc.FARM} FARM</div><div class="kpi-sub">${vc.SELECTIVE} SELECTIVE · ${vc.SKIP} SKIP (costed gas + 4% opp)</div></div>`,
    ].join('');

    document.getElementById('int-summary').textContent =
      `Global MCap/TVL ${val.global_med_ratio.toFixed(2)}x (cohort med TVL ${fmtUsd(val.med_cohort_tvl_usd)}) · Factors: ${val.factors_used.join(' + ')}`;

    document.getElementById('cnt-all').textContent = String(data.rows.length);
    document.getElementById('cnt-wl').textContent = String(data.watchlist_covered);
    document.getElementById('cnt-em').textContent = String(data.early_size);

    const catSel = document.getElementById('f-category');
    [...new Set(data.rows.map((r) => r.category))].sort().forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      catSel.appendChild(opt);
    });

    const chainSel = document.getElementById('f-chain');
    [...new Set(data.rows.flatMap((r) => r.chains))].sort().forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      chainSel.appendChild(opt);
    });
  }

  function getSortVal(r, k) {
    if (k === 'usd_per_hour') return r.farm_econ.usd_per_hour;
    if (k === 'verdict') return r.farm_econ.verdict === 'FARM' ? 3 : r.farm_econ.verdict === 'SELECTIVE' ? 2 : 1;
    return r[k];
  }

  function getFilteredRows() {
    const q = state.search.trim().toLowerCase();
    const filtered = data.rows.filter((r) => {
      if (state.tier === 'watchlist' && !r.on_watchlist) return false;
      if (state.tier === 'emerging' && r.on_watchlist) return false;
      if (state.verdict && r.farm_econ.verdict !== state.verdict) return false;
      if (state.category && r.category !== state.category) return false;
      if (state.chain && !r.chains.includes(state.chain)) return false;
      if (q) {
        const hay = `${r.name} ${r.slug} ${r.category} ${r.chains.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const dir = state.sortDir === 'asc' ? 1 : -1;
    filtered.sort((a, b) => {
      let va = getSortVal(a, state.sortKey);
      let vb = getSortVal(b, state.sortKey);
      if (typeof va === 'string' || typeof vb === 'string') {
        return collator.compare(String(va ?? ''), String(vb ?? '')) * dir;
      }
      va = va == null ? -1e18 : va;
      vb = vb == null ? -1e18 : vb;
      return (va - vb) * dir || a.rank - b.rank;
    });
    return filtered;
  }

  function renderTable() {
    const rows = getFilteredRows();
    const sumImplied = rows.reduce((acc, r) => acc + r.implied_value_usd, 0);
    document.getElementById('filter-status').textContent =
      `Showing ${rows.length} of ${data.rows.length} pre-token protocols · Filtered Implied Value: ${fmtUsd(sumImplied)}`;

    document.querySelectorAll('#radar-table thead th').forEach((th) => {
      const btn = th.querySelector('button[data-sort]');
      if (!btn) return;
      const k = btn.getAttribute('data-sort');
      if (k === state.sortKey) {
        th.setAttribute('aria-sort', state.sortDir === 'asc' ? 'ascending' : 'descending');
      } else {
        th.removeAttribute('aria-sort');
      }
    });

    document.getElementById('radar-tbody').innerHTML = rows
      .map((r) => {
        const chCls = r.change_7d == null ? 'muted' : r.change_7d >= 0 ? 'pos' : 'neg';
        const hr = r.farm_econ.usd_per_hour;
        const hrCls = hr >= 10 ? 'pos' : hr > 0 ? '' : 'muted';
        const tierBadge = r.on_watchlist
          ? '<span class="badge badge-wl">Watchlist</span>'
          : '<span class="badge badge-em">Emerging</span>';
        const chainsTxt = r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ` +${r.chains.length - 3}` : '');
        return `<tr data-slug="${esc(r.slug)}">
          <td class="num muted">#${r.rank}</td>
          <td><div class="proto-cell"><div class="proto-name">${esc(r.name)} ${tierBadge}</div><div class="proto-chains">${esc(chainsTxt)}</div></div></td>
          <td>${esc(r.category)}</td>
          <td class="num"><div class="val-strong">${fmtUsd(r.implied_value_usd)}</div><div class="range-sub">${fmtUsd(r.implied_low_usd)}–${fmtUsd(r.implied_high_usd)}</div></td>
          <td class="num">${fmtUsd(r.tvl_usd)}</td>
          <td class="num">${r.token_odds_pct}%</td>
          <td class="num ${hrCls}">${hr >= 0 ? '$' + hr.toFixed(1) : '-$' + Math.abs(hr).toFixed(1)}/hr</td>
          <td>${verdictBadge(r.farm_econ.verdict)}</td>
          <td class="num ${chCls}">${fmtPct(r.change_7d)}</td>
          <td><button type="button" class="btn-inspect" data-open="${esc(r.slug)}">Plan (${r.farm_steps.length})</button></td>
        </tr>`;
      })
      .join('');
  }

  function openDetail(slug) {
    const r = data.rows.find((x) => x.slug === slug);
    if (!r) return;
    const b = r.breakdown;
    const e = r.farm_econ;

    document.getElementById('dlg-badges').innerHTML = [
      r.on_watchlist ? '<span class="badge badge-wl">Watchlist &ge;$50M</span>' : '<span class="badge badge-em">Emerging</span>',
      verdictBadge(e.verdict),
      `<span class="meta-pill">Rank <strong>#${r.rank}</strong></span>`,
      `<span class="meta-pill">${esc(r.category)}</span>`,
    ].join('');

    document.getElementById('dlg-title').textContent = r.name;
    document.getElementById('dlg-sub').textContent =
      `${r.token_status} · Chains (${r.chains.length}): ${r.chains.join(', ')} · Listed: ${r.listed_at ?? 'Unreported'}`;

    document.getElementById('dlg-metrics').innerHTML = [
      `<div class="dlg-metric"><span>Implied Base (P50)</span><strong style="color:var(--accent)">${fmtUsd(r.implied_value_usd)}</strong></div>`,
      `<div class="dlg-metric"><span>Honest Range (P25–P75)</span><strong>${fmtUsd(r.implied_low_usd)}–${fmtUsd(r.implied_high_usd)}</strong></div>`,
      `<div class="dlg-metric"><span>Token Odds</span><strong style="color:var(--teal)">${r.token_odds_pct}%</strong></div>`,
      `<div class="dlg-metric"><span>$1k Net $/hr</span><strong class="${e.usd_per_hour >= 10 ? 'pos' : ''}">$${e.usd_per_hour.toFixed(2)}/hr</strong></div>`,
    ].join('');

    document.getElementById('dlg-formula').innerHTML = [
      `<div class="f-box"><span>${esc(b.peer_category)} Peer (n=${b.peer_sample_size})</span><strong>${b.cat_ratio.toFixed(2)}x TVL</strong></div>`,
      `<div class="f-box"><span>Scale Dampening</span><strong>&times;${b.scale_factor.toFixed(2)}</strong></div>`,
      `<div class="f-box"><span>7d Growth &times; Age &times; Chains</span><strong>&times;${(b.momentum_factor * b.maturity_factor * b.chain_factor).toFixed(2)}</strong></div>`,
      `<div class="f-box"><span>Effective MCap/TVL</span><strong>${b.effective_multiple.toFixed(2)}x</strong></div>`,
      `<div class="f-box total"><span>Implied P50</span><strong>${fmtUsd(r.implied_value_usd)}</strong></div>`,
    ].join('');

    document.getElementById('dlg-val-note').textContent =
      `Token odds basis: ${r.token_odds_basis}. Factors: 7d growth ×${b.momentum_factor.toFixed(2)}, runtime age ×${b.maturity_factor.toFixed(2)}, multi-chain ×${b.chain_factor.toFixed(2)} (P25–P75 band ${b.p25_mult.toFixed(2)}x–${b.p75_mult.toFixed(2)}x).`;

    document.getElementById('dlg-econ').innerHTML = [
      `<div class="f-box"><span>Gross Airdrop EV</span><strong>$${e.gross_ev_usd.toFixed(2)}</strong></div>`,
      `<div class="f-box"><span>Gas + 4% Opp</span><strong>-$${e.all_in_cost_usd.toFixed(2)}</strong></div>`,
      `<div class="f-box"><span>Time Budget</span><strong>${e.hours_needed}h / ${e.horizon_weeks}w</strong></div>`,
      `<div class="f-box"><span>Net EV ($1k)</span><strong>$${e.net_ev_usd.toFixed(2)}</strong></div>`,
      `<div class="f-box total"><span>Effective $/hr</span><strong>$${e.usd_per_hour.toFixed(2)}/hr</strong></div>`,
    ].join('');

    document.getElementById('dlg-horizon').textContent = `Horizon: ${r.est_horizon} · Est. Gas: ${r.est_gas_usd}`;
    document.getElementById('dlg-steps').innerHTML = r.farm_steps.map((s) => `<li>${esc(s)}</li>`).join('');
    document.getElementById('detail-dialog').showModal();
  }

  function openValidation() {
    const v = data.validation;
    document.getElementById('val-badges').innerHTML = [
      `<span class="meta-pill">Cohort <strong>${v.calibration_cohort} DeFi peers</strong></span>`,
      `<span class="meta-pill">LOOCV <strong>${v.loocv_med_x.toFixed(2)}x</strong></span>`,
      `<span class="meta-pill">Walk-Forward <strong>${v.wf_med_x.toFixed(2)}x</strong></span>`,
    ].join('');
    document.getElementById('val-sub').textContent =
      `Cohort funnel: ${v.all_tokenized} tokenized -> ${v.defi_tokenized} DeFi (ex CEX/Bridge/LST) -> ${v.calibration_cohort} with MCap >= $1M; Walk-Forward ${v.wf_train_n} train -> ${v.wf_test_n} test.`;

    document.getElementById('val-ablation-body').innerHTML = v.ablation
      .map((a) => {
        const cls = a.decision === 'ACTIVE' ? 'badge-farm' : a.decision === 'BASELINE' ? 'badge-em' : 'badge-sel';
        return `<tr>
          <td><strong>${esc(a.feature)}</strong><div class="range-sub">${esc(a.reason)}</div></td>
          <td class="num">${a.loocv_med_x.toFixed(2)}x</td>
          <td class="num">${a.loocv_p75_x.toFixed(2)}x</td>
          <td class="num">${a.wf_med_x.toFixed(2)}x</td>
          <td><span class="badge ${cls}">${a.decision}</span></td>
        </tr>`;
      })
      .join('');

    document.getElementById('val-cat-chips').innerHTML = data.category_peers
      .map((c) => `<span class="cal-chip">${esc(c.category)}<em>&times;${c.cat_multiplier.toFixed(2)}</em><small>n=${c.peer_count}</small></span>`)
      .join('');

    document.getElementById('val-dialog').showModal();
  }

  function wireEvents() {
    document.querySelectorAll('.seg').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.seg').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        state.tier = btn.getAttribute('data-tier') || 'all';
        renderTable();
      });
    });

    document.getElementById('f-search').addEventListener('input', (e) => { state.search = e.target.value; renderTable(); });
    document.getElementById('f-verdict').addEventListener('change', (e) => { state.verdict = e.target.value; renderTable(); });
    document.getElementById('f-category').addEventListener('change', (e) => { state.category = e.target.value; renderTable(); });
    document.getElementById('f-chain').addEventListener('change', (e) => { state.chain = e.target.value; renderTable(); });

    document.getElementById('btn-reset').addEventListener('click', () => {
      state.tier = 'all'; state.search = ''; state.verdict = ''; state.category = ''; state.chain = '';
      state.sortKey = 'rank'; state.sortDir = 'asc';
      document.getElementById('f-search').value = '';
      document.getElementById('f-verdict').value = '';
      document.getElementById('f-category').value = '';
      document.getElementById('f-chain').value = '';
      document.querySelectorAll('.seg').forEach((b) => b.classList.toggle('is-active', b.getAttribute('data-tier') === 'all'));
      renderTable();
    });

    document.querySelectorAll('#radar-table thead button[data-sort]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const k = btn.getAttribute('data-sort');
        if (state.sortKey === k) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        else {
          state.sortKey = k;
          state.sortDir = k === 'rank' || k === 'name' || k === 'category' ? 'asc' : 'desc';
        }
        renderTable();
      });
    });

    document.getElementById('radar-tbody').addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-slug]');
      if (tr) openDetail(tr.getAttribute('data-slug'));
    });

    document.getElementById('dlg-close').addEventListener('click', () => document.getElementById('detail-dialog').close());
    document.getElementById('btn-open-val').addEventListener('click', openValidation);
    document.getElementById('val-close').addEventListener('click', () => document.getElementById('val-dialog').close());
  }

  initHeaderAndKpis();
  wireEvents();
  renderTable();
})();
