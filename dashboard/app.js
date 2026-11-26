// Interactive Token Launch Radar dashboard (zero dependencies, zero network).
(function () {
  const data = window.__RADAR_DATA__;
  if (!data || !Array.isArray(data.rows)) return;

  const state = {
    tier: 'all',
    search: '',
    category: '',
    chain: '',
    sortKey: 'rank',
    sortDir: 'asc',
  };

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

  function fmtAge(days) {
    if (days == null) return '—';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return days + 'd';
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function initHeaderAndKpis() {
    document.getElementById('meta-pills').innerHTML = [
      `<span class="meta-pill">Snapshot <strong>${esc(data.as_of)}</strong></span>`,
      `<span class="meta-pill">Watchlist <strong>${data.watchlist_covered}/${data.watchlist_count}</strong></span>`,
      `<span class="meta-pill">Live Token Peers <strong>${data.live_size}</strong> excluded</span>`,
    ].join('');

    const topRow = data.rows[0];
    const fastest = [...data.rows].filter((r) => r.change_7d != null).sort((a, b) => b.change_7d - a.change_7d)[0];

    document.getElementById('kpi-grid').innerHTML = [
      `<div class="kpi"><div class="kpi-label">Total Pre-Token Implied Value</div><div class="kpi-val accent">${fmtUsd(data.total_implied_usd)}</div><div class="kpi-sub">${data.rows.length} pre-token protocols (${data.watchlist_covered} watchlist + ${data.early_size} emerging)</div></div>`,
      `<div class="kpi"><div class="kpi-label">#1 Ranked Protocol</div><div class="kpi-val">${esc(topRow.name)}</div><div class="kpi-sub">${fmtUsd(topRow.implied_value_usd)} implied &middot; ${fmtUsd(topRow.tvl_usd)} TVL (${topRow.breakdown.effective_multiple.toFixed(2)}x)</div></div>`,
      `<div class="kpi"><div class="kpi-label">Global Peer Median MCap/TVL</div><div class="kpi-val teal">${data.global_median_multiple.toFixed(2)}x</div><div class="kpi-sub">Calibrated dynamically from tokenized snapshot peers</div></div>`,
      `<div class="kpi"><div class="kpi-label">Fastest 7d TVL Mover</div><div class="kpi-val pos">${fastest ? fmtPct(fastest.change_7d) : '—'}</div><div class="kpi-sub">${fastest ? esc(fastest.name) + ' (' + fmtUsd(fastest.tvl_usd) + ' TVL)' : 'No 7d delta'}</div></div>`,
    ].join('');

    document.getElementById('cal-note').textContent =
      `Bayesian-smoothed category median MCap/TVL (k=3 toward ${data.global_median_multiple.toFixed(2)}x global median)`;

    document.getElementById('cal-chips').innerHTML = data.category_peers
      .slice(0, 10)
      .map((c) => `<span class="cal-chip">${esc(c.category)}<em>${c.median_multiple.toFixed(2)}x</em><small>n=${c.peer_count}</small></span>`)
      .join('');

    document.getElementById('cnt-all').textContent = String(data.rows.length);
    document.getElementById('cnt-wl').textContent = String(data.watchlist_covered);
    document.getElementById('cnt-em').textContent = String(data.early_size);

    const cats = [...new Set(data.rows.map((r) => r.category))].sort();
    const catSel = document.getElementById('f-category');
    cats.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      catSel.appendChild(opt);
    });

    const chains = [...new Set(data.rows.flatMap((r) => r.chains))].sort();
    const chainSel = document.getElementById('f-chain');
    chains.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      chainSel.appendChild(opt);
    });
  }

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

  function getFilteredRows() {
    const q = state.search.trim().toLowerCase();
    const filtered = data.rows.filter((r) => {
      if (state.tier === 'watchlist' && !r.on_watchlist) return false;
      if (state.tier === 'emerging' && r.on_watchlist) return false;
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
      const k = state.sortKey;
      let va = k === 'effective_multiple' ? a.breakdown.effective_multiple : a[k];
      let vb = k === 'effective_multiple' ? b.breakdown.effective_multiple : b[k];
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

    const tbody = document.getElementById('radar-tbody');
    tbody.innerHTML = rows
      .map((r) => {
        const chCls = r.change_7d == null ? 'muted' : r.change_7d >= 0 ? 'pos' : 'neg';
        const tierBadge = r.on_watchlist
          ? '<span class="badge badge-wl">Watchlist</span>'
          : '<span class="badge badge-em">Emerging</span>';
        const chainsTxt = r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ` +${r.chains.length - 3}` : '');
        return `<tr data-slug="${esc(r.slug)}">
          <td class="num muted">#${r.rank}</td>
          <td><div class="proto-cell"><div class="proto-name">${esc(r.name)} ${tierBadge}</div><div class="proto-chains">${esc(chainsTxt)}</div></div></td>
          <td>${esc(r.category)}</td>
          <td class="num val-strong">${fmtUsd(r.implied_value_usd)}</td>
          <td class="num">${fmtUsd(r.tvl_usd)}</td>
          <td class="num">${r.breakdown.effective_multiple.toFixed(2)}x</td>
          <td class="num ${chCls}">${fmtPct(r.change_7d)}</td>
          <td class="num muted">${fmtAge(r.age_days)}</td>
          <td><div class="gas-cell"><span class="num muted">${esc(r.est_gas_usd)}</span><button type="button" class="btn-inspect" data-open="${esc(r.slug)}">Plan (${r.farm_steps.length})</button></div></td>
        </tr>`;
      })
      .join('');
  }

  function openDetail(slug) {
    const r = data.rows.find((x) => x.slug === slug);
    if (!r) return;
    const dlg = document.getElementById('detail-dialog');
    const b = r.breakdown;

    document.getElementById('dlg-badges').innerHTML = [
      r.on_watchlist ? '<span class="badge badge-wl">Watchlist &ge;$50M</span>' : '<span class="badge badge-em">Emerging Pre-Token</span>',
      `<span class="meta-pill">Rank <strong>#${r.rank}</strong></span>`,
      `<span class="meta-pill">${esc(r.category)}</span>`,
      `<span class="meta-pill">${esc(r.token_status)}</span>`,
    ].join('');

    document.getElementById('dlg-title').textContent = r.name;
    document.getElementById('dlg-sub').textContent =
      `Slug: ${r.slug} · Chains (${r.chains.length}): ${r.chains.join(', ')} · Listed: ${r.listed_at ?? 'Unreported'}`;

    document.getElementById('dlg-metrics').innerHTML = [
      `<div class="dlg-metric"><span>Implied Token Value</span><strong style="color:var(--accent)">${fmtUsd(r.implied_value_usd)}</strong></div>`,
      `<div class="dlg-metric"><span>Current TVL</span><strong>${fmtUsd(r.tvl_usd)}</strong></div>`,
      `<div class="dlg-metric"><span>7d TVL Change</span><strong class="${r.change_7d == null ? 'muted' : r.change_7d >= 0 ? 'pos' : 'neg'}">${fmtPct(r.change_7d)}</strong></div>`,
      `<div class="dlg-metric"><span>Est. Gas Budget</span><strong>${esc(r.est_gas_usd)}</strong></div>`,
    ].join('');

    document.getElementById('dlg-formula').innerHTML = [
      `<div class="f-box"><span>Peer Base (n=${b.peer_sample_size})</span><strong>${b.base_multiple.toFixed(2)}x</strong></div>`,
      `<div class="f-box"><span>TVL Scale</span><strong>&times;${b.scale_factor.toFixed(2)}</strong></div>`,
      `<div class="f-box"><span>7d Momentum</span><strong>&times;${b.momentum_factor.toFixed(2)}</strong></div>`,
      `<div class="f-box"><span>Longevity (${fmtAge(r.age_days)})</span><strong>&times;${b.maturity_factor.toFixed(2)}</strong></div>`,
      `<div class="f-box"><span>Multi-Chain (${r.chains.length})</span><strong>&times;${b.chain_factor.toFixed(2)}</strong></div>`,
      `<div class="f-box total"><span>Effective Mult</span><strong>${b.effective_multiple.toFixed(2)}x</strong></div>`,
    ].join('');

    document.getElementById('dlg-horizon').textContent = `Recommended Horizon: ${r.est_horizon} · Gas: ${r.est_gas_usd}`;
    document.getElementById('dlg-steps').innerHTML = r.farm_steps.map((s) => `<li>${esc(s)}</li>`).join('');

    dlg.showModal();
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

    document.getElementById('f-search').addEventListener('input', (e) => {
      state.search = e.target.value;
      renderTable();
    });
    document.getElementById('f-category').addEventListener('change', (e) => {
      state.category = e.target.value;
      renderTable();
    });
    document.getElementById('f-chain').addEventListener('change', (e) => {
      state.chain = e.target.value;
      renderTable();
    });
    document.getElementById('btn-reset').addEventListener('click', () => {
      state.tier = 'all';
      state.search = '';
      state.category = '';
      state.chain = '';
      state.sortKey = 'rank';
      state.sortDir = 'asc';
      document.getElementById('f-search').value = '';
      document.getElementById('f-category').value = '';
      document.getElementById('f-chain').value = '';
      document.querySelectorAll('.seg').forEach((b) => b.classList.toggle('is-active', b.getAttribute('data-tier') === 'all'));
      renderTable();
    });

    document.querySelectorAll('#radar-table thead button[data-sort]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const k = btn.getAttribute('data-sort');
        if (state.sortKey === k) {
          state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
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

    const dlg = document.getElementById('detail-dialog');
    document.getElementById('dlg-close').addEventListener('click', () => dlg.close());
  }

  initHeaderAndKpis();
  wireEvents();
  renderTable();
  window.__OPEN_RADAR_DETAIL__ = openDetail;
})();
