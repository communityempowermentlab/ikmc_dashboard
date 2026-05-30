import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import {
  fetchDistrictFilters,
  fetchDistrictKpis,
  fetchFacilityMatrix,
} from '../../redux/slices/districtSlice';
import './DistrictDashboard.css';

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const toTitleCase = s => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function sevenDaysAgoStr() {
  return new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
}

// ── Insight computation ────────────────────────────────────────────────────
function computeInsights(mat, kpis) {
  if (!mat?.facilities?.length || !kpis) return [];

  const facs      = mat.facilities;
  const totalDays = mat.dates.length;
  const insights  = [];

  // Overall app use sentiment
  insights.push({
    type: kpis.appUsePct >= 70 ? 'positive' : kpis.appUsePct >= 40 ? 'warning' : 'critical',
    text: `Overall iKMC app usage is ${kpis.appUsePct}% — ${kpis.appUseDays} of ${kpis.possibleFacDays} possible facility-days had activity.`,
  });

  // Best performing facility
  const activeFacs = facs.filter(f => f.appUseDays > 0).sort((a, b) => b.appUsePct - a.appUsePct);
  if (activeFacs.length) {
    const best = activeFacs[0];
    insights.push({
      type: 'positive',
      text: `${best.name} achieved the highest weekly iKMC app usage at ${best.appUsePct}% (${best.appUseDays} of ${totalDays} days).`,
    });
  }

  // Facilities with zero app activity
  const noActivity = facs.filter(f => f.appUseDays === 0);
  if (noActivity.length) {
    const names = noActivity.slice(0, 2).map(f => f.name).join(', ')
      + (noActivity.length > 2 ? ` and ${noActivity.length - 2} more` : '');
    insights.push({
      type: noActivity.length >= Math.ceil(facs.length / 2) ? 'critical' : 'warning',
      text: `${noActivity.length} facilit${noActivity.length > 1 ? 'ies' : 'y'} had no iKMC app activity this week: ${names}.`,
    });
  }

  // Facilities with complete activity
  const fullActivity = facs.filter(f => f.appUsePct === 100);
  if (fullActivity.length) {
    insights.push({
      type: 'positive',
      text: `${fullActivity.length} facilit${fullActivity.length > 1 ? 'ies' : 'y'} maintained complete daily iKMC app usage throughout the week.`,
    });
  }

  // Highest LBW admissions facility
  const lbwFacs = facs.filter(f => f.lbwAdmitted > 0).sort((a, b) => b.lbwAdmitted - a.lbwAdmitted);
  if (lbwFacs.length) {
    insights.push({
      type: 'info',
      text: `${lbwFacs[0].name} recorded the highest LBW admissions this week (${lbwFacs[0].lbwAdmitted} babies).`,
    });
  }

  // Weight gain/stable insight
  if (kpis.wsTotal > 0) {
    insights.push({
      type: kpis.gsPct >= 70 ? 'positive' : kpis.gsPct >= 40 ? 'warning' : 'critical',
      text: `${kpis.gsPct}% of discharged babies with weight records achieved stable or improved weight (${kpis.gainStable} of ${kpis.wsTotal} babies).`,
    });
  } else {
    insights.push({
      type: 'warning',
      text: 'No discharge weight data available this week — weight gain/stable metric cannot be calculated.',
    });
  }

  // Exclusive breastfeeding insight
  if (kpis.bfTotal > 0) {
    insights.push({
      type: kpis.bfPct >= 70 ? 'positive' : kpis.bfPct >= 40 ? 'warning' : 'critical',
      text: `Exclusive breastfeeding compliance: ${kpis.bfPct}% (${kpis.exclusiveBF} of ${kpis.bfTotal} babies with nutrition records).`,
    });
  }

  // Missing baby assessment data
  const noAssess = facs.filter(f => f.totalBaby > 0 && f.assessed === 0);
  if (noAssess.length) {
    const names = noAssess.slice(0, 2).map(f => f.name).join(', ')
      + (noAssess.length > 2 ? ` and ${noAssess.length - 2} more` : '');
    insights.push({
      type: 'warning',
      text: `${noAssess.length} facilit${noAssess.length > 1 ? 'ies' : 'y'} with admissions submitted no baby assessment records: ${names}.`,
    });
  }

  return insights;
}

// ── Main component ─────────────────────────────────────────────────────────
export default function DistrictDashboard() {
  const dispatch = useDispatch();
  const { filterOptions, kpis, matrix, loading } = useSelector(s => s.district);

  // Independent local filter state — does NOT share with main dashboard
  const [stateId,        setStateId]        = useState('');
  const [districtCode,   setDistrictCode]   = useState('');
  const [facilityTypeId, setFacilityTypeId] = useState('');
  const [facilityId,     setFacilityId]     = useState('');
  const [startDate,      setStartDate]      = useState(sevenDaysAgoStr());
  const [endDate,        setEndDate]        = useState(todayStr());

  const [dismissedInsights, setDismissedInsights] = useState(new Set());

  useEffect(() => {
    dispatch(fetchDistrictFilters());
  }, [dispatch]);

  const fetchData = useCallback(() => {
    const args = { stateId, districtCode, facilityTypeId, facilityId, startDate, endDate };
    dispatch(fetchDistrictKpis(args));
    dispatch(fetchFacilityMatrix(args));
  }, [stateId, districtCode, facilityTypeId, facilityId, startDate, endDate, dispatch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset dismissed when data refreshes
  useEffect(() => {
    setDismissedInsights(new Set());
  }, [matrix, kpis]);

  // Cascaded filter options — all client-side, no shared Redux state
  const stateOptions = filterOptions?.states || [];
  const districtOptions = (filterOptions?.districts || []).filter(
    d => !stateId || String(d.stateId) === String(stateId)
  );
  const typeOptions = filterOptions?.facilityTypes || [];
  const facilityOptions = (filterOptions?.facilities || []).filter(
    f =>
      (!stateId        || String(f.stateId)        === String(stateId)) &&
      (!districtCode   || String(f.districtCode)   === String(districtCode)) &&
      (!facilityTypeId || String(f.facilityTypeId) === String(facilityTypeId))
  );

  const k   = kpis?.kpis   || {};
  const mat = matrix        || { facilities: [], dates: [] };

  const allInsights = useMemo(() => computeInsights(mat, k), [mat, k]);
  const visibleInsights = allInsights.filter((_, i) => !dismissedInsights.has(i));

  const logoSrc = `${import.meta.env.BASE_URL}cel_logo.png`;

  return (
    <div className="dd-page">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="dd-header">
        <div className="dd-header-left">
          <img
            src={logoSrc}
            alt="CEL · ICMR"
            className="dd-header-logo"
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
          <div className="dd-header-divider" />
          <div className="dd-title-block">
            <h1 className="dd-title">District Weekly Performance</h1>
            <p className="dd-subtitle">
              {kpis?.period
                ? `${kpis.period.start} — ${kpis.period.end} · ${kpis.period.totalDays} days`
                : 'Facility-level iKMC monitoring dashboard'}
            </p>
          </div>
        </div>

        <div className="dd-header-right">
          <button className="dd-export-btn" onClick={() => window.print()} title="Export as PDF">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            Export PDF
          </button>
          <Link to="/dashboard" className="dd-main-dash-btn">← Main Dashboard</Link>
        </div>
      </header>

      {/* ── Filter Bar ─────────────────────────────────────────────────────── */}
      <div className="dd-filter-bar">
        <FilterGroup label="State">
          <select
            className="dd-select"
            value={stateId}
            onChange={e => { setStateId(e.target.value); setDistrictCode(''); setFacilityId(''); }}
          >
            <option value="">All States</option>
            {stateOptions.map(s => <option key={s.id} value={s.id}>{toTitleCase(s.name)}</option>)}
          </select>
        </FilterGroup>

        <FilterGroup label="District">
          <select
            className="dd-select"
            value={districtCode}
            onChange={e => { setDistrictCode(e.target.value); setFacilityId(''); }}
          >
            <option value="">All Districts</option>
            {districtOptions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </FilterGroup>

        <FilterGroup label="Facility Type">
          <select
            className="dd-select"
            value={facilityTypeId}
            onChange={e => { setFacilityTypeId(e.target.value); setFacilityId(''); }}
          >
            <option value="">All Types</option>
            {typeOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </FilterGroup>

        <FilterGroup label="Facility">
          <select
            className="dd-select"
            value={facilityId}
            onChange={e => setFacilityId(e.target.value)}
          >
            <option value="">All Facilities</option>
            {facilityOptions.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </FilterGroup>

        <FilterGroup label="From">
          <input
            type="date"
            className="dd-date-input"
            value={startDate}
            max={endDate}
            onChange={e => setStartDate(e.target.value)}
          />
        </FilterGroup>

        <FilterGroup label="To">
          <input
            type="date"
            className="dd-date-input"
            value={endDate}
            min={startDate}
            max={todayStr()}
            onChange={e => setEndDate(e.target.value)}
          />
        </FilterGroup>
      </div>

      <div className="dd-body">

        {/* ── KPI Cards ───────────────────────────────────────────────────── */}
        <section className="dd-kpi-section">
          <KpiCard label="iKMC Facilities"  value={k.totalFacilities ?? '—'} unit="total"           accent="#6366f1" loading={loading.kpis} />
          <KpiCard label="Daily App Use"   value={k.appUsePct != null ? `${k.appUsePct}%` : '—'}
                   sub={`${k.appUseDays ?? 0} / ${k.possibleFacDays ?? 0} facility-days`}
                   accent="#0ea5e9" loading={loading.kpis} />
          <KpiCard label="Total Babies"    value={k.totalBaby ?? '—'}      unit="admissions"       accent="#8b5cf6" loading={loading.kpis} />
          <KpiCard label="LBW Admitted"    value={k.lbwAdmitted ?? '—'}    unit="LBW babies"       accent="#f59e0b" loading={loading.kpis} />
          <KpiCard label="LBW Discharged"  value={k.lbwDischarged ?? '—'}  unit="LBW babies"       accent="#10b981" loading={loading.kpis} />
          <KpiCard label="48h Stay"        value={k.stay48 ?? '—'}         unit="babies stayed ≥48h" accent="#3b82f6" loading={loading.kpis} />
          <KpiCard label="Exclusive BF"
                   value={k.bfPct != null ? `${k.bfPct}%` : '—'}
                   sub={`${k.exclusiveBF ?? 0} of ${k.bfTotal ?? 0} babies`}
                   accent="#ec4899" loading={loading.kpis} />
          <KpiCard label="Wt Gain / Stable"
                   value={k.gsPct != null ? `${k.gsPct}%` : '—'}
                   sub={`${k.gainStable ?? 0} of ${k.wsTotal ?? 0} babies`}
                   accent="#22c55e" loading={loading.kpis} />
          <KpiCard label="Baby Assessed"   value={k.babyAssessed ?? '—'}   unit="babies"           accent="#f97316" loading={loading.kpis} />
          <KpiCard label="Total Mothers"   value={k.totalMothers ?? '—'}   unit="admissions"       accent="#a855f7" loading={loading.kpis} />
        </section>

        {/* ── Facility Matrix ─────────────────────────────────────────────── */}
        <section className="dd-matrix-section">
          <div className="dd-card">
            <div className="dd-card-header">
              <h2 className="dd-card-title">Facility Performance Matrix</h2>
              <p className="dd-card-sub">
                Daily iKMC app use (squares) + period aggregates per facility
              </p>
            </div>

            {loading.matrix ? (
              <div className="dd-loading">Loading matrix…</div>
            ) : mat.facilities.length === 0 ? (
              <div className="dd-empty">No facilities match the selected filters.</div>
            ) : (
              <div className="dd-matrix-wrap">
                <table className="dd-matrix-table">
                  <thead>
                    <tr>
                      <th className="dd-th-fac dd-sticky-col">Facility</th>
                      {mat.dates.map(dt => {
                        const d = new Date(dt + 'T12:00:00Z');
                        return (
                          <th key={dt} className="dd-th-day">
                            <div className="dd-day-dow">{DAY_ABBR[d.getUTCDay()]}</div>
                            <div className="dd-day-date">{dt.slice(5)}</div>
                          </th>
                        );
                      })}
                      <th className="dd-th-kpi">LBW Admission</th>
                      <th className="dd-th-kpi">LBW Discharge</th>
                      <th className="dd-th-kpi">48h Stay</th>
                      <th className="dd-th-kpi">Exclusive BF</th>
                      <th className="dd-th-kpi">Weight Gain/Stable</th>
                      <th className="dd-th-kpi">Total Baby</th>
                      <th className="dd-th-kpi">Baby Ass.</th>
                      <th className="dd-th-kpi">Total Mother</th>
                      <th className="dd-th-kpi">App%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mat.facilities.map(fac => (
                      <tr key={fac.id} className="dd-row">
                        <td className="dd-td-fac dd-sticky-col">
                          <div className="dd-fac-name">{fac.name}</div>
                          <div className="dd-fac-meta">
                            <span className="dd-type-badge">{fac.type}</span>
                            <span className="dd-fac-district">{fac.district}</span>
                          </div>
                        </td>

                        {fac.dailyAppUse.map((used, i) => (
                          <td key={i} className="dd-td-day">
                            <div
                              className={`dd-sq ${used ? 'dd-sq--on' : 'dd-sq--off'}`}
                              title={`${mat.dates[i]}${used ? ' · App used' : ' · No activity'}`}
                            />
                          </td>
                        ))}

                        <td className="dd-td-kpi">{fac.lbwAdmitted}</td>
                        <td className="dd-td-kpi">{fac.lbwDischarged}</td>
                        <td className="dd-td-kpi">{fac.stay48}</td>
                        <td className="dd-td-kpi">{fac.bfPct  != null ? `${fac.bfPct}%`  : '—'}</td>
                        <td className="dd-td-kpi">{fac.gsPct  != null ? `${fac.gsPct}%`  : '—'}</td>
                        <td className="dd-td-kpi">{fac.totalBaby}</td>
                        <td className="dd-td-kpi">{fac.assessed}</td>
                        <td className="dd-td-kpi">{fac.totalMothers}</td>
                        <td className="dd-td-kpi">
                          <span className={`dd-app-pct ${
                            fac.appUsePct >= 70 ? 'dd-pct-hi'
                            : fac.appUsePct >= 40 ? 'dd-pct-mid'
                            : 'dd-pct-lo'
                          }`}>
                            {fac.appUsePct}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!loading.matrix && mat.facilities.length > 0 && (
              <div className="dd-legend">
                <span className="dd-leg-item">
                  <span className="dd-leg-sq dd-leg-on" /> App Used
                </span>
                <span className="dd-leg-item">
                  <span className="dd-leg-sq dd-leg-off" /> No Activity
                </span>
                <span className="dd-leg-item">
                  <span className="dd-app-pct dd-pct-hi">70%+</span> High
                </span>
                <span className="dd-leg-item">
                  <span className="dd-app-pct dd-pct-mid">40–69%</span> Moderate
                </span>
                <span className="dd-leg-item">
                  <span className="dd-app-pct dd-pct-lo">&lt;40%</span> Low
                </span>
              </div>
            )}
          </div>
        </section>

        {/* ── Weekly Insights ─────────────────────────────────────────────── */}
        {!loading.kpis && !loading.matrix && visibleInsights.length > 0 && (
          <section className="dd-insights-section">
            <div className="dd-insights-header">
              <span className="dd-insights-title">
                <InsightIcon type="info" size={16} />
                Weekly Insights
              </span>
              {dismissedInsights.size < allInsights.length && (
                <button
                  className="dd-insights-clear"
                  onClick={() => setDismissedInsights(new Set(allInsights.map((_, i) => i)))}
                >
                  Dismiss all
                </button>
              )}
            </div>

            <div className="dd-insights-grid">
              {allInsights.map((insight, i) => {
                if (dismissedInsights.has(i)) return null;
                return (
                  <div key={i} className={`dd-insight-card dd-insight-${insight.type}`}>
                    <div className="dd-insight-icon">
                      <InsightIcon type={insight.type} size={18} />
                    </div>
                    <p className="dd-insight-text">{insight.text}</p>
                    <button
                      className="dd-insight-dismiss"
                      onClick={() => setDismissedInsights(prev => new Set([...prev, i]))}
                      title="Dismiss"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function FilterGroup({ label, children }) {
  return (
    <div className="dd-filter-group">
      <label className="dd-filter-label">{label}</label>
      {children}
    </div>
  );
}

function KpiCard({ label, value, unit, sub, accent, loading }) {
  return (
    <div className="dd-kpi-card" style={{ '--kpi-accent': accent }}>
      <div className="dd-kpi-accent-bar" />
      <div className="dd-kpi-body">
        {loading ? (
          <div className="dd-kpi-shimmer" />
        ) : (
          <div className="dd-kpi-val">{value}</div>
        )}
        {!loading && unit && <div className="dd-kpi-unit">{unit}</div>}
        {!loading && sub  && <div className="dd-kpi-sub">{sub}</div>}
        <div className="dd-kpi-label">{label}</div>
      </div>
    </div>
  );
}

function InsightIcon({ type, size = 20 }) {
  const icons = {
    positive: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/>
      </svg>
    ),
    warning: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    ),
    critical: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
    ),
    info: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#0369a1" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    ),
  };
  return icons[type] || icons.info;
}
