import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Chart from 'chart.js/auto';
import HeaderFilters from '../../components/common/HeaderFilters';
import {
  fetchAdmissionKpi,
  fetchAdmissionTrend,
  fetchAdmissionComposition,
  fetchAdmissionBirthWeight,
  fetchAdmissionDischarge,
  fetchEarlyCareKpi,
} from '../../redux/slices/admissionSlice';
import './Dashboard.css';
import './DashboardSkeleton.css';

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// Semantic color mapping for discharge categories
const DC_COLORS = {
  'Normal Discharge':    '#22c55e',
  "Doctor's discretion": '#14b8a6',
  'Referral':            '#3b82f6',
  'LAMA':                '#f59e0b',
  'DOPR':                '#94a3b8',
  'Died':                '#ef4444',
};

// ── helpers ──────────────────────────────────────────────────────────────────
function parseMonthId(id) {
  const [yr, mo] = id.split('-');
  return { yr: parseInt(yr), mo: parseInt(mo) };
}

function formatMonthId(id) {
  const { yr, mo } = parseMonthId(id);
  return `${MONTH_SHORT[mo - 1]} ${yr}`;
}

// Center-text donut plugin factory (reused for both donut charts)
function makeCenterTextPlugin(id, getValue) {
  return {
    id,
    afterDraw(chart) {
      const { ctx, chartArea } = chart;
      if (!chartArea) return;
      const cx = (chartArea.left + chartArea.right)  / 2;
      const cy = (chartArea.top  + chartArea.bottom) / 2;
      const { label, value } = getValue();
      ctx.save();
      ctx.font = '500 10.5px "DM Sans", sans-serif';
      ctx.fillStyle = '#9ca3af'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, cx, cy - 12);
      ctx.font = '600 21px "DM Mono", monospace';
      ctx.fillStyle = '#111827';
      ctx.fillText(value, cx, cy + 10);
      ctx.restore();
    }
  };
}

const Dashboard = () => {
  const dispatch = useDispatch();

  // Chart canvas refs
  const admChartRef   = useRef(null);
  const donutChartRef = useRef(null);
  const kmcChartRef   = useRef(null);

  // Chart instance refs
  const admChartInstanceRef   = useRef(null);
  const donutChartInstanceRef = useRef(null);

  // Filters — all multi-select arrays now
  const { selectedFacilities, selectedLounges, selectedMonths } = useSelector(s => s.filters);

  // Admission data
  const {
    kpi:         admKpi,
    trend:       admTrend,
    composition: admComp,
    birthWeight: admBw,
    discharge:   admDischarge,
    earlyCare:   admEarlyCare,
    loading:     admLoading,
  } = useSelector(s => s.admissions);

  const [isDashboardLoading, setIsDashboardLoading] = useState(true);
  const [insightFilter,    setInsightFilter]    = useState(null);  // 'critical' | 'warning' | 'positive' | null
  const [mobileInsightIdx, setMobileInsightIdx] = useState(0);
  const [mobileVisible,    setMobileVisible]    = useState(true);

  // ── Section label (dynamic month range) ──────────────────────────────────
  const sectionLabel = useMemo(() => {
    if (!selectedMonths.length) return 'Loading…';
    const sorted = [...selectedMonths].sort();
    if (sorted.length === 1) return formatMonthId(sorted[0]);
    const first = formatMonthId(sorted[0]);
    const last  = formatMonthId(sorted[sorted.length - 1]);
    // Show range when contiguous, count otherwise
    return `${first} – ${last}`;
  }, [selectedMonths]);

  // ── Previous period label for KPI trend text ──────────────────────────────
  const prevPeriodLabel = useMemo(() => {
    if (!admKpi?.previousPeriods?.length) return '';
    const pp = admKpi.previousPeriods;
    if (pp.length === 1) return formatMonthId(pp[0]);
    const first = formatMonthId([...pp].sort()[0]);
    const last  = formatMonthId([...pp].sort().pop());
    return `${first} – ${last}`;
  }, [admKpi]);

  // Stable string keys — re-fire effects only when content actually changes
  const selectedMonthsKey     = [...selectedMonths].sort().join(',');
  const selectedFacilitiesKey = [...selectedFacilities].sort().join(',');
  const selectedLoungesKey    = [...selectedLounges].sort().join(',');

  // ── Trigger skeleton when lounge selection becomes ready ─────────────────
  useEffect(() => {
    if (selectedLounges.length) {
      setIsDashboardLoading(true);
      const timer = setTimeout(() => setIsDashboardLoading(false), 1200);
      return () => clearTimeout(timer);
    } else {
      setIsDashboardLoading(true);
    }
  }, [selectedLoungesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset insight filter + mobile index whenever dashboard filters change
  useEffect(() => {
    setInsightFilter(null);
    setMobileInsightIdx(0);
    setMobileVisible(true);
  }, [selectedFacilitiesKey, selectedLoungesKey, selectedMonthsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset mobile index when filter badge changes
  useEffect(() => { setMobileInsightIdx(0); setMobileVisible(true); }, [insightFilter]);

  // ── Fetch all admission data when filters change ──────────────────────────
  useEffect(() => {
    if (!selectedFacilities.length || !selectedMonths.length) return;
    const params = { facilityIds: selectedFacilitiesKey, months: selectedMonthsKey };
    if (selectedLounges.length) params.loungeIds = selectedLoungesKey;
    dispatch(fetchAdmissionKpi(params));
    dispatch(fetchAdmissionTrend(params));
    dispatch(fetchAdmissionComposition(params));
    dispatch(fetchAdmissionBirthWeight(params));
    dispatch(fetchAdmissionDischarge(params));
    dispatch(fetchEarlyCareKpi(params));
  }, [selectedFacilitiesKey, selectedLoungesKey, selectedMonthsKey, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Static charts (KMC trend only now) ───────────────────────────────────
  useEffect(() => {
    if (isDashboardLoading) return;
    const gridColor = 'rgba(0,0,0,0.06)', tickColor = '#9ca3af';
    Chart.defaults.font = { family: "'DM Sans', sans-serif", size: 11 };

    let kmcChartInstance;
    if (kmcChartRef.current) {
      kmcChartInstance = new Chart(kmcChartRef.current, {
        type: 'line',
        data: {
          labels: ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'],
          datasets: [
            { label: 'Avg KMC hrs', data: [6.1,6.4,6.6,6.9,7.1,7.4], borderColor: '#0f766e', backgroundColor: 'rgba(15,118,110,0.08)', fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: '#0f766e', borderWidth: 2 },
            { label: 'Target',      data: [8,8,8,8,8,8],              borderColor: '#d1fae5', borderWidth: 1.5, borderDash: [5,4], pointRadius: 0, fill: false }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${c.parsed.y.toFixed(1)} hrs` } } },
          scales: {
            x: { ticks: { color: tickColor }, grid: { display: false }, border: { display: false } },
            y: { min: 5.5, max: 9, ticks: { color: tickColor, callback: v => v+'h' }, grid: { color: gridColor }, border: { display: false } }
          }
        }
      });
    }
    return () => { if (kmcChartInstance) kmcChartInstance.destroy(); };
  }, [isDashboardLoading]);

  // ── Admission trend chart ─────────────────────────────────────────────────
  useEffect(() => {
    if (admChartInstanceRef.current) { admChartInstanceRef.current.destroy(); admChartInstanceRef.current = null; }
    if (isDashboardLoading || !admChartRef.current || admTrend.length === 0) return;

    const gridColor = 'rgba(0,0,0,0.06)', tickColor = '#9ca3af';
    const labels = admTrend.map(d => `${MONTH_SHORT[d.month-1]} '${String(d.year).slice(2)}`);
    const counts  = admTrend.map(d => d.count);

    const pointLabelsPlugin = {
      id: 'pointLabels',
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        chart.getDatasetMeta(0).data.forEach((pt, i) => {
          ctx.save();
          ctx.font = '600 10.5px "DM Sans", sans-serif'; ctx.fillStyle = '#1d4ed8';
          ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          ctx.fillText(counts[i].toLocaleString(), pt.x, pt.y - 7);
          ctx.restore();
        });
      }
    };

    admChartInstanceRef.current = new Chart(admChartRef.current, {
      type: 'line', plugins: [pointLabelsPlugin],
      data: { labels, datasets: [{ label: 'Admissions', data: counts, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.07)', fill: true, tension: 0.38, pointRadius: 5, pointHoverRadius: 7, pointBackgroundColor: '#3b82f6', pointBorderColor: '#fff', pointBorderWidth: 2, borderWidth: 2.5 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 22 } },
        plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false, callbacks: { title: items => { const d = admTrend[items[0].dataIndex]; return `${MONTH_FULL[d.month-1]} ${d.year}`; }, label: item => ` Admissions: ${item.parsed.y.toLocaleString()}` } } },
        scales: {
          x: { ticks: { color: tickColor, maxTicksLimit: 12 }, grid: { display: false }, border: { display: false } },
          y: { ticks: { color: tickColor }, grid: { color: gridColor }, border: { display: false }, min: 0, suggestedMax: Math.max(...counts, 1) * 1.30 }
        }
      }
    });
    return () => { if (admChartInstanceRef.current) { admChartInstanceRef.current.destroy(); admChartInstanceRef.current = null; } };
  }, [isDashboardLoading, admTrend]);

  // ── Inborn / Outborn donut ────────────────────────────────────────────────
  useEffect(() => {
    if (donutChartInstanceRef.current) { donutChartInstanceRef.current.destroy(); donutChartInstanceRef.current = null; }
    if (isDashboardLoading || !donutChartRef.current || !admComp || admComp.total === 0) return;

    const { inborn, outborn, total } = admComp;
    const inbornPct  = ((inborn  / total) * 100).toFixed(1);
    const outbornPct = ((outborn / total) * 100).toFixed(1);
    const centerPlugin = makeCenterTextPlugin('compCenter', () => ({ label: 'Total', value: total.toLocaleString() }));

    donutChartInstanceRef.current = new Chart(donutChartRef.current, {
      type: 'doughnut', plugins: [centerPlugin],
      data: { labels: ['Inborn','Outborn'], datasets: [{ data: [inborn, outborn], backgroundColor: ['#3b82f6','#14b8a6'], hoverBackgroundColor: ['#2563eb','#0d9488'], borderWidth: 0, hoverOffset: 8 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '70%',
        animation: { animateRotate: true, duration: 700, easing: 'easeInOutQuart' },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed.toLocaleString()} (${ctx.dataIndex === 0 ? inbornPct : outbornPct}%)` } } }
      }
    });
    return () => { if (donutChartInstanceRef.current) { donutChartInstanceRef.current.destroy(); donutChartInstanceRef.current = null; } };
  }, [isDashboardLoading, admComp]);

  // Birth weight and discharge visualizations are pure CSS/JSX — no Chart.js needed

  // ── Derived display values ────────────────────────────────────────────────
  const inbornPct  = admComp && admComp.total > 0 ? ((admComp.inborn  / admComp.total) * 100).toFixed(1) : '0.0';
  const outbornPct = admComp && admComp.total > 0 ? ((admComp.outborn / admComp.total) * 100).toFixed(1) : '0.0';

  // ── Birth weight category data ────────────────────────────────────────────
  const bwCats = useMemo(() => {
    if (!admBw || admBw.total === 0) return [];
    const t = admBw.total;
    const pct = v => t > 0 ? ((v / t) * 100).toFixed(1) : '0.0';
    return [
      { key: 'lt1800',  label: '<1800g',       value: admBw.lt1800,       color: '#ef4444', pct: pct(admBw.lt1800) },
      { key: 'btw',     label: '1800–2499g',   value: admBw.btw1800_2499, color: '#f59e0b', pct: pct(admBw.btw1800_2499) },
      { key: 'gte2500', label: '≥2500g',       value: admBw.gte2500,      color: '#22c55e', pct: pct(admBw.gte2500) },
      { key: 'na',      label: 'Not available',value: admBw.na,           color: '#9ca3af', pct: pct(admBw.na) },
    ];
  }, [admBw]);

  const kpiColor = () => !admKpi ? 'green' : admKpi.direction === 'down' ? 'red' : admKpi.direction === 'up' ? 'green' : 'amber';
  const trendClass = () => !admKpi ? 'trend-neu' : admKpi.direction === 'up' ? 'trend-up' : admKpi.direction === 'down' ? 'trend-dn' : 'trend-neu';
  const trendArrow = () => !admKpi ? '→' : admKpi.direction === 'up' ? '↑' : admKpi.direction === 'down' ? '↓' : '→';

  // ── AI-Powered Insight Engine ─────────────────────────────────────────────
  // Analyzes all live dashboard data and generates prioritised executive insights.
  // type: 'critical' | 'warning' | 'positive' | 'info'
  const insights = useMemo(() => {
    const list = [];
    const add = (type, icon, msg, priority) => list.push({ type, icon, msg, priority });

    // ── Admission trend ───────────────────────────────────────────────────────
    if (admKpi && admKpi.previous > 0) {
      const chg = Math.abs(admKpi.percentChange);
      if (admKpi.direction === 'down' && chg >= 15)
        add('critical', '📉', `Admissions dropped ${chg}% vs previous period — ${admKpi.current} vs ${admKpi.previous} babies`, 1);
      else if (admKpi.direction === 'down' && chg >= 5)
        add('warning',  '⚠',  `Admissions declined ${chg}% compared to previous period`, 3);
      else if (admKpi.direction === 'up' && chg >= 10)
        add('positive', '📈', `Admissions up ${chg}% — ${admKpi.current} babies admitted, strong growth observed`, 6);
      else if (admKpi.direction === 'up')
        add('info',     '📊', `Admissions up ${chg}% from previous period (${admKpi.current} total)`, 9);
    }

    // ── Multi-month trend direction ────────────────────────────────────────────
    if (admTrend && admTrend.length >= 3) {
      const counts = admTrend.map(r => r.count);
      const last = counts.slice(-3);
      if (last[0] < last[1] && last[1] < last[2])
        add('positive', '📈', `Admission trend rising consistently over the last 3 months`, 7);
      else if (last[0] > last[1] && last[1] > last[2])
        add('warning',  '⚠',  `Admission trend declining over the last 3 months — investigate operational factors`, 4);
    }

    // ── Inborn / Outborn composition ──────────────────────────────────────────
    if (admComp && admComp.total > 0) {
      const oPct = parseFloat(((admComp.outborn / admComp.total) * 100).toFixed(1));
      const iPct = parseFloat(((admComp.inborn  / admComp.total) * 100).toFixed(1));
      if (oPct > 65)
        add('info', '📊', `High referral load — ${oPct}% of admissions are Outborn babies`, 9);
      else if (iPct > 80)
        add('info', '📊', `Predominantly Inborn admissions at ${iPct}% — facility managing internal deliveries`, 10);
    }

    // ── Mortality ─────────────────────────────────────────────────────────────
    if (admDischarge) {
      const { diedPct, diedCount, lamaPct, lamaCount, totalDischarge, categories } = admDischarge;

      if (diedPct > 5)
        add('critical', '🔴', `Critical: Mortality rate at ${diedPct}% — ${diedCount} deaths recorded, immediate review required`, 1);
      else if (diedPct > 3)
        add('warning',  '⚠',  `Elevated mortality rate at ${diedPct}% — ${diedCount} deaths recorded this period`, 2);
      else if (diedPct > 0)
        add('info',     '📊', `Mortality rate within range at ${diedPct}% — ${diedCount} deaths recorded`, 10);

      // ── LAMA ─────────────────────────────────────────────────────────────
      if (lamaPct > 15)
        add('critical', '🔴', `LAMA rate critically high at ${lamaPct}% — ${lamaCount} patients left against medical advice`, 2);
      else if (lamaPct > 10)
        add('warning',  '⚠',  `Elevated LAMA rate at ${lamaPct}% — ${lamaCount} cases require follow-up`, 3);
      else if (lamaPct <= 5 && lamaCount > 0)
        add('positive', '✅', `Low LAMA rate of ${lamaPct}% — good patient retention this period`, 8);

      // ── Normal discharge rate ─────────────────────────────────────────────
      const normalCat = categories?.find(c => c.label.toLowerCase().includes('normal'));
      if (normalCat && totalDischarge > 0 && normalCat.pct >= 70)
        add('positive', '✅', `${normalCat.pct}% of discharges are Normal — strong clinical outcome performance`, 7);

      // ── Referral insight ──────────────────────────────────────────────────
      const refCat = categories?.find(c => c.label.toLowerCase() === 'referral');
      if (refCat && totalDischarge > 0 && refCat.pct > 15)
        add('warning', '⚠', `High referral discharge rate at ${refCat.pct}% — ${refCat.total} babies referred out`, 4);
    }

    // ── Birth weight ──────────────────────────────────────────────────────────
    if (admBw && admBw.total > 0) {
      const missingPct = parseFloat(((admBw.na          / admBw.total) * 100).toFixed(1));
      const vlbwPct    = parseFloat(((admBw.lt1800      / admBw.total) * 100).toFixed(1));
      const lbwPct     = parseFloat(((admBw.btw1800_2499/ admBw.total) * 100).toFixed(1));
      const normalWtPct= parseFloat(((admBw.gte2500     / admBw.total) * 100).toFixed(1));
      const lowTotal   = parseFloat((vlbwPct + lbwPct).toFixed(1));

      if (missingPct > 15)
        add('critical', '⚠', `Birth weight data missing for ${missingPct}% of records — data quality requires attention`, 3);
      else if (missingPct > 8)
        add('warning',  '⚠', `Birth weight data missing for ${missingPct}% of records — data capture needs improvement`, 5);

      if (vlbwPct > 30)
        add('critical', '🔴', `High proportion of very low birth weight babies (<1800g): ${vlbwPct}% — elevated clinical risk`, 2);
      else if (vlbwPct > 20)
        add('warning',  '⚠', `${vlbwPct}% of admitted babies have very low birth weight (<1800g)`, 4);

      if (lowTotal > 65)
        add('warning',  '⚠', `${lowTotal}% of admitted babies are low birth weight (<2500g) — high-risk cohort`, 4);

      if (normalWtPct >= 40)
        add('positive', '✅', `${normalWtPct}% of admitted babies have birth weight ≥2500g — relatively healthy intake`, 8);
    }

    // ── KMC initiation compliance ─────────────────────────────────────────────
    if (admEarlyCare) {
      const { kmc, bf } = admEarlyCare;

      if (kmc.total > 0) {
        if (kmc.overallPct < 60)
          add('critical', '🔴', `KMC initiation compliance critically low at ${kmc.overallPct}% — immediate intervention required`, 1);
        else if (kmc.overallPct < 80)
          add('warning',  '⚠', `KMC initiation at ${kmc.overallPct}% — below 80% compliance target`, 3);
        else
          add('positive', '✅', `KMC initiation compliance strong at ${kmc.overallPct}% — exceeding 80% target`, 6);

        const kmcGap = kmc.inbornPct - kmc.outbornPct;
        if (kmcGap > 25)
          add('warning',  '⚠', `KMC initiation gap — Inborn ${kmc.inbornPct}% vs Outborn ${kmc.outbornPct}% (${kmcGap.toFixed(0)}pp difference)`, 4);
        else if (kmcGap < -20)
          add('positive', '📊', `Outborn KMC initiation (${kmc.outbornPct}%) outperforming Inborn (${kmc.inbornPct}%)`, 7);
      }

      if (bf.total > 0) {
        if (bf.overallPct < 60)
          add('critical', '🔴', `Breastfeeding initiation critically low at ${bf.overallPct}% — immediate action required`, 1);
        else if (bf.overallPct < 80)
          add('warning',  '⚠', `Breastfeeding initiation at ${bf.overallPct}% — below 80% compliance target`, 3);
        else
          add('positive', '✅', `Breastfeeding initiation compliance strong at ${bf.overallPct}% — exceeding target`, 6);

        const bfGap = bf.inbornPct - bf.outbornPct;
        if (bfGap > 25)
          add('warning',  '⚠', `Breastfeeding initiation gap — Inborn ${bf.inbornPct}% vs Outborn ${bf.outbornPct}%`, 4);
      }

      // Combined early care summary (only if both are strong)
      if (kmc.total > 0 && bf.total > 0 && kmc.overallPct >= 80 && bf.overallPct >= 80)
        add('positive', '✅', `Both early care indicators above target — KMC ${kmc.overallPct}%, BF ${bf.overallPct}% initiation`, 5);
    }

    // Sort: critical (1) → warning (2) → positive (3) → info (4), then by priority
    const order = { critical: 0, warning: 1, positive: 2, info: 3 };
    return list.sort((a, b) => order[a.type] - order[b.type] || a.priority - b.priority);
  }, [admKpi, admDischarge, admBw, admEarlyCare, admComp, admTrend]);

  // Filtered insight list (shared by both desktop ticker and mobile rotator)
  const filteredInsights = useMemo(
    () => insightFilter ? insights.filter(i => i.type === insightFilter) : insights,
    [insights, insightFilter]
  );

  // Mobile auto-rotation — cycles through filteredInsights every 4.5s with fade
  useEffect(() => {
    if (filteredInsights.length <= 1) return;
    const id = setInterval(() => {
      setMobileVisible(false);
      const t = setTimeout(() => {
        setMobileInsightIdx(idx => (idx + 1) % filteredInsights.length);
        setMobileVisible(true);
      }, 280);
      return () => clearTimeout(t);
    }, 4500);
    return () => clearInterval(id);
  }, [filteredInsights.length]);

  const advanceMobileInsight = () => {
    if (filteredInsights.length <= 1) return;
    setMobileVisible(false);
    setTimeout(() => {
      setMobileInsightIdx(idx => (idx + 1) % filteredInsights.length);
      setMobileVisible(true);
    }, 200);
  };

  return (
    <div className="dashboard-container">
      {/* HEADER */}
      <header className="header">
        <div className="header-left">
          <img src={`${import.meta.env.BASE_URL}cel_logo.png`} alt="CEL · ICMR" className="header-logo" />
          <div className="header-divider" />
          <div>
            <div className="header-title">KMC Programme — Executive Dashboard</div>
            <div className="header-sub">Uttar Pradesh · Health &amp; Family Welfare Department</div>
          </div>
        </div>
        <div className="header-right">
          <HeaderFilters />
          <button className="btn-export" onClick={() => window.print()}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 10v3h10v-3M5 7l3 3 3-3M8 1v9"/></svg>
            Export PDF
          </button>
        </div>
      </header>

      {/* INSIGHT BAR */}
      {(() => {
        const critCount = insights.filter(i => i.type === 'critical').length;
        const warnCount = insights.filter(i => i.type === 'warning').length;
        const posCount  = insights.filter(i => i.type === 'positive').length;
        const toggle    = (type) => setInsightFilter(f => f === type ? null : type);

        // Desktop ticker
        const tickerItems = filteredInsights.length > 0
          ? [...filteredInsights, ...filteredInsights]
          : [{ type: 'info', icon: '✅', msg: 'All dashboard indicators are within acceptable range — no critical alerts detected' }];
        const tickerDuration = Math.max(filteredInsights.length * 7, 18);

        // Mobile rotator
        const fallbackInsight = { type: 'info', icon: '✅', msg: 'All indicators within acceptable range' };
        const mobileInsight   = filteredInsights.length > 0
          ? filteredInsights[mobileInsightIdx % filteredInsights.length]
          : fallbackInsight;
        const safeIdx = filteredInsights.length > 0 ? (mobileInsightIdx % filteredInsights.length) + 1 : 1;
        const mobileTotal = filteredInsights.length > 0 ? filteredInsights.length : 1;

        // Left label panel (shared)
        const labelPanel = (
          <div className="insight-label-panel">
            <span className="insight-lightning">⚡</span>
            <span className="insight-label-text">Insights</span>
            <div className="insight-badges">
              {critCount > 0 && (
                <button className={`ib-badge ib-critical${insightFilter === 'critical' ? ' ib-active' : ''}`} onClick={() => toggle('critical')}>
                  {critCount} Critical
                </button>
              )}
              {warnCount > 0 && (
                <button className={`ib-badge ib-warning${insightFilter === 'warning' ? ' ib-active' : ''}`} onClick={() => toggle('warning')}>
                  {warnCount} Warning{warnCount > 1 ? 's' : ''}
                </button>
              )}
              {posCount > 0 && (
                <button className={`ib-badge ib-positive${insightFilter === 'positive' ? ' ib-active' : ''}`} onClick={() => toggle('positive')}>
                  {posCount} Positive
                </button>
              )}
              {critCount === 0 && warnCount === 0 && (
                <span className="ib-badge ib-stable">Stable</span>
              )}
            </div>
          </div>
        );

        return (
          <div className="insight-bar">
            {labelPanel}

            {/* ── Desktop: continuous scrolling ticker ── */}
            <div className="insight-ticker-wrap insight-desktop-only">
              <div key={insightFilter ?? 'all'} className="insight-ticker" style={{ animationDuration: `${tickerDuration}s` }}>
                {tickerItems.map((ins, i) => (
                  <span key={i} className={`insight-pill ip-${ins.type}`}>
                    <span className="ip-icon">{ins.icon}</span>
                    <span className="ip-msg">{ins.msg}</span>
                    <span className="ip-sep">◆</span>
                  </span>
                ))}
              </div>
            </div>

            {/* ── Mobile: auto-rotating single-insight card ── */}
            <button
              className={`insight-mobile-rotator insight-mobile-only ip-${mobileInsight.type} ${mobileVisible ? 'imr-in' : 'imr-out'}`}
              onClick={advanceMobileInsight}
              aria-label="Next insight"
            >
              <span className="ip-icon">{mobileInsight.icon}</span>
              <span className="imr-msg">{mobileInsight.msg}</span>
              <span className="imr-nav">
                <span className="imr-counter">{safeIdx}/{mobileTotal}</span>
                <span className="imr-arrow">›</span>
              </span>
            </button>
          </div>
        );
      })()}

      {/* MAIN */}
      <div className="main">
        {isDashboardLoading ? (
          <div className="dashboard-skeleton">
            <div className="skel-row-1"><div className="skel-box" style={{height:'100px'}}></div></div>
            <div className="skel-row-2col">
              <div className="skel-box" style={{height:'280px'}}></div>
              <div className="skel-box" style={{height:'280px'}}></div>
            </div>
            <div className="skel-row-3col">
              <div className="skel-box" style={{height:'260px'}}></div>
              <div className="skel-box" style={{height:'260px'}}></div>
              <div className="skel-box" style={{height:'260px'}}></div>
            </div>
            <div className="skel-row-2col-even">
              <div className="skel-box" style={{height:'280px'}}></div>
              <div className="skel-box" style={{height:'280px'}}></div>
            </div>
          </div>
        ) : (
          <>
            {/* KPI CARDS */}
            <div>
              <div className="section-label">Executive summary — {sectionLabel}</div>
              <div className="kpi-grid">

                {/* Total Admissions — DYNAMIC */}
                <div className={`kpi ${kpiColor()}`}>
                  <div className="kpi-label">Total admissions</div>
                  {admLoading.kpi ? (
                    <div className="kpi-val adm-loading">—</div>
                  ) : admKpi ? (
                    <>
                      <div className="kpi-val">{admKpi.current.toLocaleString()}</div>
                      <div className={`kpi-trend ${trendClass()}`}>
                        {trendArrow()} {Math.abs(admKpi.percentChange)}% vs {prevPeriodLabel}
                      </div>
                    </>
                  ) : (
                    <><div className="kpi-val">—</div><div className="kpi-trend trend-neu">No data</div></>
                  )}
                </div>

                {/* Total Discharges — DYNAMIC */}
                <div className={`kpi ${admLoading.discharge ? 'green' : admDischarge ? 'green' : 'green'}`}>
                  <div className="kpi-label">Total discharges</div>
                  {admLoading.discharge ? (
                    <div className="kpi-val adm-loading">—</div>
                  ) : admDischarge ? (
                    <>
                      <div className="kpi-val">{admDischarge.totalDischarge.toLocaleString()}</div>
                      <div className="kpi-trend trend-neu">→ {sectionLabel}</div>
                    </>
                  ) : (
                    <><div className="kpi-val">—</div><div className="kpi-trend trend-neu">No data</div></>
                  )}
                </div>

                <div className="kpi amber kpi--static"><div className="kpi-label">Avg KMC duration</div><div className="kpi-val">7.4 <span style={{fontSize:'14px',fontWeight:400}}>hrs</span></div><div className="kpi-trend trend-up">↑ 0.6 hrs vs Apr</div></div>

                {/* Mortality rate — DYNAMIC */}
                <div className={`kpi ${!admDischarge ? 'green' : admDischarge.diedPct > 5 ? 'red' : admDischarge.diedPct > 3 ? 'amber' : 'green'}`}>
                  <div className="kpi-label">Mortality rate</div>
                  {admLoading.discharge ? (
                    <div className="kpi-val adm-loading">—</div>
                  ) : admDischarge ? (
                    <>
                      <div className="kpi-val">{admDischarge.diedPct}<span style={{fontSize:'14px',fontWeight:400}}>%</span></div>
                      <div className={`kpi-trend ${admDischarge.diedPct > 5 ? 'trend-dn' : admDischarge.diedPct > 3 ? 'trend-neu' : 'trend-up'}`}>
                        {admDischarge.diedCount} deaths recorded
                      </div>
                    </>
                  ) : (
                    <><div className="kpi-val">—</div><div className="kpi-trend trend-neu">No data</div></>
                  )}
                </div>

                {/* LAMA % — DYNAMIC */}
                <div className={`kpi ${!admDischarge ? 'amber' : admDischarge.lamaPct > 15 ? 'red' : admDischarge.lamaPct > 10 ? 'amber' : 'green'}`}>
                  <div className="kpi-label">LAMA %</div>
                  {admLoading.discharge ? (
                    <div className="kpi-val adm-loading">—</div>
                  ) : admDischarge ? (
                    <>
                      <div className="kpi-val">{admDischarge.lamaPct}<span style={{fontSize:'14px',fontWeight:400}}>%</span></div>
                      <div className={`kpi-trend ${admDischarge.lamaPct > 15 ? 'trend-dn' : admDischarge.lamaPct > 10 ? 'trend-neu' : 'trend-up'}`}>
                        {admDischarge.lamaCount} LAMA cases
                      </div>
                    </>
                  ) : (
                    <><div className="kpi-val">—</div><div className="kpi-trend trend-neu">No data</div></>
                  )}
                </div>
                {/* KMC within 2 hours — DYNAMIC */}
                {(() => {
                  const d   = admEarlyCare?.kmc;
                  const pct = d?.overallPct ?? null;
                  const col = pct === null ? 'green' : pct >= 80 ? 'green' : pct >= 60 ? 'amber' : 'red';
                  const trendCls = pct === null ? 'trend-neu' : pct >= 80 ? 'trend-up' : pct >= 60 ? 'trend-neu' : 'trend-dn';
                  return (
                    <div className={`kpi ${col}`}>
                      <div className="kpi-label">KMC Initiated within 2 Hours</div>
                      {admLoading.earlyCare ? (
                        <div className="kpi-val adm-loading">—</div>
                      ) : d ? (
                        <>
                          <div className="kpi-val">{d.overallPct}<span style={{fontSize:'14px',fontWeight:400}}>%</span></div>
                          <div className={`kpi-trend ${trendCls}`}>{d.totalYes.toLocaleString()} of {d.total.toLocaleString()} babies</div>
                        </>
                      ) : (
                        <><div className="kpi-val">—</div><div className="kpi-trend trend-neu">No data</div></>
                      )}
                    </div>
                  );
                })()}
                {/* Breastfeeding within 1 hour — DYNAMIC */}
                {(() => {
                  const d   = admEarlyCare?.bf;
                  const pct = d?.overallPct ?? null;
                  const col = pct === null ? 'green' : pct >= 80 ? 'green' : pct >= 60 ? 'amber' : 'red';
                  const trendCls = pct === null ? 'trend-neu' : pct >= 80 ? 'trend-up' : pct >= 60 ? 'trend-neu' : 'trend-dn';
                  return (
                    <div className={`kpi ${col}`}>
                      <div className="kpi-label">Breastfeeding Initiated within 1 Hour</div>
                      {admLoading.earlyCare ? (
                        <div className="kpi-val adm-loading">—</div>
                      ) : d ? (
                        <>
                          <div className="kpi-val">{d.overallPct}<span style={{fontSize:'14px',fontWeight:400}}>%</span></div>
                          <div className={`kpi-trend ${trendCls}`}>{d.totalYes.toLocaleString()} of {d.total.toLocaleString()} babies</div>
                        </>
                      ) : (
                        <><div className="kpi-val">—</div><div className="kpi-trend trend-neu">No data</div></>
                      )}
                    </div>
                  );
                })()}
                <div className="kpi green kpi--static"><div className="kpi-label">KMC transport</div><div className="kpi-val">82<span style={{fontSize:'14px',fontWeight:400}}>%</span></div><div className="kpi-trend trend-up">↑ 7% vs Apr</div></div>
              </div>
            </div>

            {/* ROW 2: Admission trend + Inborn/Outborn */}
            <div className="row-2col">
              <div className="card">
                <div className="card-title">Admission trend — monthly ({sectionLabel})</div>
                <div className="chart-wrap" style={{height:'230px', position:'relative'}}>
                  <canvas ref={admChartRef} role="img" aria-label="Monthly admission trend chart" />
                  {admLoading.trend && <div className="adm-chart-overlay">Loading trend data…</div>}
                  {!admLoading.trend && admTrend.length === 0 && <div className="adm-chart-overlay">No admission data available</div>}
                </div>
              </div>

              <div className="card">
                <div className="card-title">Inborn vs Outborn composition</div>
                <div className="chart-wrap" style={{height:'165px', position:'relative'}}>
                  <canvas ref={donutChartRef} role="img" aria-label="Inborn vs Outborn donut chart" />
                  {admLoading.composition && <div className="adm-chart-overlay">Loading…</div>}
                  {!admLoading.composition && (!admComp || admComp.total === 0) && <div className="adm-chart-overlay">No admission data available</div>}
                </div>
                <div className="comp-stats">
                  <div className="comp-item">
                    <span className="comp-dot" style={{background:'#3b82f6'}} />
                    <div className="comp-info">
                      <div className="comp-label">Inborn</div>
                      <div className="comp-count">{admLoading.composition ? '—' : (admComp?.inborn ?? 0).toLocaleString()}</div>
                      <div className="comp-pct" style={{color:'#3b82f6'}}>{admLoading.composition ? '' : `${inbornPct}%`}</div>
                    </div>
                  </div>
                  <div className="comp-sep" />
                  <div className="comp-item">
                    <span className="comp-dot" style={{background:'#14b8a6'}} />
                    <div className="comp-info">
                      <div className="comp-label">Outborn</div>
                      <div className="comp-count">{admLoading.composition ? '—' : (admComp?.outborn ?? 0).toLocaleString()}</div>
                      <div className="comp-pct" style={{color:'#14b8a6'}}>{admLoading.composition ? '' : `${outbornPct}%`}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ROW 3: Birth weight (dynamic donut) + Clinical compliance + KMC trend */}
            <div className="row-3col">
              {/* Birth Weight Distribution — DYNAMIC (CSS visualization) */}
              <div className="card">
                <div className="card-title">Birth weight distribution</div>
                {admLoading.birthWeight ? (
                  <div className="adm-chart-overlay" style={{position:'relative', height:'160px'}}>Loading…</div>
                ) : !admBw || admBw.total === 0 ? (
                  <div className="adm-chart-overlay" style={{position:'relative', height:'120px'}}>No birth weight data</div>
                ) : (
                  <div className="bw-section">
                    {/* Total summary */}
                    <div className="bw-total-row">
                      <span className="bw-total-num">{admBw.total.toLocaleString()}</span>
                      <span className="bw-total-label">total babies</span>
                    </div>
                    {/* Proportional distribution bar */}
                    <div className="bw-dist-bar">
                      {bwCats.filter(c => c.value > 0).map(c => (
                        <div key={c.key} className="bw-dist-seg"
                          style={{flex: c.value, background: c.color}}
                          title={`${c.label}: ${c.value.toLocaleString()} (${c.pct}%)`}
                        />
                      ))}
                    </div>
                    {/* 2×2 category tiles */}
                    <div className="bw-tiles">
                      {bwCats.map(c => (
                        <div key={c.key} className="bw-tile" style={{borderLeftColor: c.color}}>
                          <div className="bw-tile-label">{c.label}</div>
                          <div className="bw-tile-count">{c.value.toLocaleString()}</div>
                          <div className="bw-tile-pct" style={{color: c.color}}>{c.pct}%</div>
                          <div className="bw-tile-track">
                            <div className="bw-tile-fill" style={{width: c.pct + '%', background: c.color}} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="card">
                <div className="card-title">Clinical compliance indicators</div>
                <div className="static-tag">✗ Not integrated — static data</div>
                <div className="prog-item"><div className="prog-header"><span>KMC transport — mother</span><span className="prog-pct">82%</span></div><div className="prog-track"><div className="prog-fill" style={{width:'82%',background:'#22c55e'}}></div></div></div>
                <div className="prog-item"><div className="prog-header"><span>KMC transport — surrogate</span><span className="prog-pct">61%</span></div><div className="prog-track"><div className="prog-fill" style={{width:'61%',background:'#f59e0b'}}></div></div></div>
                <div className="prog-item"><div className="prog-header"><span>Complete data capture</span><span className="prog-pct">92%</span></div><div className="prog-track"><div className="prog-fill" style={{width:'92%',background:'#3b82f6'}}></div></div></div>
              </div>

              <div className="card">
                <div className="card-title">Avg KMC duration — 6-month trend</div>
                <div className="static-tag">✗ Not integrated — static data</div>
                <div className="chart-wrap" style={{height:'150px'}}>
                  <canvas ref={kmcChartRef} role="img" aria-label="KMC duration trend chart" />
                </div>
                <div style={{textAlign:'center', marginTop:'8px'}}>
                  <span style={{fontSize:'11px', color:'var(--text-muted)'}}>Target: </span>
                  <span style={{fontSize:'11px', fontWeight:600, color:'var(--green)'}}>≥8 hrs &nbsp;·&nbsp; Current: 7.4 hrs</span>
                </div>
              </div>
            </div>

            {/* ROW 4: Early Care Indicators — KMC within 2h + BF within 1h */}
            <div className="row-2col-even">
              {/* ── KMC within 2 hours ── */}
              {[
                { key: 'kmc', title: 'KMC Initiated within 2 Hours',         icon: '🫀' },
                { key: 'bf',  title: 'Breastfeeding Initiated within 1 Hour', icon: '🤱' },
              ].map(({ key, title }) => {
                const data    = admEarlyCare?.[key];
                const loading = admLoading.earlyCare;
                return (
                  <div key={key} className="card ec-card">
                    <div className="card-title">{title}</div>

                    {loading && (
                      <div className="ec-empty">Loading data…</div>
                    )}
                    {!loading && !data && (
                      <div className="ec-empty">No data available</div>
                    )}
                    {!loading && data && data.total === 0 && (
                      <div className="ec-empty">No records for selected period</div>
                    )}
                    {!loading && data && data.total > 0 && (() => {
                      const overallColor = data.overallPct >= 80 ? '#22c55e'
                                         : data.overallPct >= 60 ? '#f59e0b'
                                         :                          '#ef4444';
                      return (
                        <>
                          {/* Overall compliance badge */}
                          <div className="ec-overall">
                            <div className="ec-pct-ring" style={{'--pct-color': overallColor, '--pct': data.overallPct}}>
                              <span className="ec-pct-num" style={{color: overallColor}}>
                                {data.overallPct}%
                              </span>
                              <span className="ec-pct-label">compliant</span>
                            </div>
                            <div className="ec-overall-stats">
                              <div className="ec-stat-row">
                                <span className="ec-stat-dot yes" />
                                <span className="ec-stat-label">Yes</span>
                                <span className="ec-stat-val">{data.totalYes.toLocaleString()} <span className="ec-stat-pct">({data.overallPct}%)</span></span>
                              </div>
                              <div className="ec-stat-row">
                                <span className="ec-stat-dot no" />
                                <span className="ec-stat-label">No</span>
                                <span className="ec-stat-val">{data.totalNo.toLocaleString()} <span className="ec-stat-pct">({(100 - data.overallPct).toFixed(1)}%)</span></span>
                              </div>
                              <div className="ec-stat-row ec-stat-total">
                                <span className="ec-stat-label">Total</span>
                                <span className="ec-stat-val">{data.total.toLocaleString()}</span>
                              </div>
                            </div>
                          </div>

                          {/* Inborn / Outborn split panels */}
                          <div className="ec-split">
                            {[
                              { label: 'Inborn',  yes: data.inbornYes,  no: data.inbornNo,  pct: data.inbornPct,  total: data.inbornTotal  },
                              { label: 'Outborn', yes: data.outbornYes, no: data.outbornNo, pct: data.outbornPct, total: data.outbornTotal },
                            ].map(panel => {
                              const pColor = panel.pct >= 80 ? '#22c55e'
                                           : panel.pct >= 60 ? '#f59e0b'
                                           :                    '#ef4444';
                              const yesFlex = panel.total > 0 ? (panel.yes / panel.total) * 100 : 0;
                              const noFlex  = panel.total > 0 ? (panel.no  / panel.total) * 100 : 0;
                              return (
                                <div key={panel.label} className="ec-panel">
                                  <div className="ec-panel-header">
                                    <span className="ec-panel-label">{panel.label}</span>
                                    <span className="ec-panel-pct" style={{color: pColor}}>{panel.pct}%</span>
                                    <span className="ec-panel-total">{panel.total.toLocaleString()} babies</span>
                                  </div>
                                  <div
                                    className="ec-bar"
                                    title={`${panel.label}: Yes ${panel.yes} (${panel.pct}%) · No ${panel.no} (${(100 - panel.pct).toFixed(1)}%)`}
                                  >
                                    <div className="ec-bar-yes" style={{flex: yesFlex || 0.001}} />
                                    <div className="ec-bar-no"  style={{flex: noFlex  || 0.001}} />
                                  </div>
                                  <div className="ec-panel-sub">
                                    <span className="ec-sub-yes">Yes: {panel.yes.toLocaleString()} ({panel.pct}%)</span>
                                    <span className="ec-sub-sep">·</span>
                                    <span className="ec-sub-no">No: {panel.no.toLocaleString()} ({(100 - panel.pct).toFixed(1)}%)</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                );
              })}
            </div>

            {/* ROW 5: Discharge outcomes — DYNAMIC + Facility ranking */}
            <div className="row-2col-even">
              <div className="card">
                <div className="card-title">
                  Discharge outcomes breakdown
                  {admDischarge && !admLoading.discharge && (
                    <span style={{marginLeft:'8px', fontSize:'11px', fontWeight:500, color:'var(--text-muted)'}}>
                      {admDischarge.totalDischarge.toLocaleString()} total
                    </span>
                  )}
                </div>

                {/* Stacked bar legend */}
                <div className="dc-bar-legend">
                  <span className="dc-bar-legend-swatch" style={{background:'#3b82f6'}} />
                  <span className="dc-bar-legend-label">Inborn</span>
                  <span className="dc-bar-legend-swatch" style={{background:'#14b8a6', marginLeft:'12px'}} />
                  <span className="dc-bar-legend-label">Outborn</span>
                </div>

                {/* Individual stacked bars */}
                {admLoading.discharge && (
                  <div className="adm-chart-overlay" style={{position:'relative',height:'180px'}}>Loading discharge data…</div>
                )}
                {!admLoading.discharge && (!admDischarge || !admDischarge.categories?.length) && (
                  <div className="adm-chart-overlay" style={{position:'relative',height:'180px'}}>No discharge data available</div>
                )}
                {admDischarge && !admLoading.discharge && admDischarge.categories?.length > 0 && (() => {
                  const maxTotal = Math.max(...admDischarge.categories.map(c => c.total), 1);
                  return (
                    <div className="dc-bars">
                      {admDischarge.categories.map(c => {
                        const barW    = (c.total / maxTotal) * 100;
                        const inPct   = c.total > 0 ? (c.inborn  / c.total) * 100 : 0;
                        const outPct  = c.total > 0 ? (c.outborn / c.total) * 100 : 0;
                        const color   = DC_COLORS[c.label] || '#94a3b8';
                        return (
                          <div key={c.label} className="dc-bar-row">
                            <div className="dc-bar-header">
                              <span className="dc-bar-dot" style={{background: color}} />
                              <span className="dc-bar-name">{c.label}</span>
                              <span className="dc-bar-meta">
                                <span className="dc-bar-count">{c.total.toLocaleString()}</span>
                                <span className="dc-bar-pct" style={{color}}>{c.pct}%</span>
                              </span>
                            </div>
                            <div className="dc-bar-track">
                              <div className="dc-bar-fill" style={{width:`${barW}%`}}>
                                {inPct > 0 && (
                                  <div className="dc-bar-seg dc-bar-inborn" style={{flex: inPct}} />
                                )}
                                {outPct > 0 && (
                                  <div className="dc-bar-seg dc-bar-outborn" style={{flex: outPct}} />
                                )}
                              </div>
                            </div>
                            <div className="dc-bar-sub">
                              Inborn: {c.inborn.toLocaleString()} &nbsp;·&nbsp; Outborn: {c.outborn.toLocaleString()}
                              {c.other > 0 && ` · Other: ${c.other.toLocaleString()}`}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              <div className="card">
                <div className="card-title">Facility performance ranking — {sectionLabel}</div>
                <div className="static-tag">✗ Not integrated — static data</div>
                <div className="table-responsive">
                  <table className="facility-table">
                    <thead><tr><th>Facility</th><th>KMC hrs</th><th>SSC %</th><th>BF %</th><th>Mortality</th><th>Status</th></tr></thead>
                    <tbody>
                      <tr><td><strong>KGMU Lucknow</strong></td><td><div className="mini-bar-wrap"><div className="mini-bar-track"><div className="mini-bar-fill" style={{width:'89%',background:'#22c55e'}}></div></div><span className="mini-val">8.9</span></div></td><td style={{color:'var(--green)',fontWeight:600,fontFamily:'var(--mono)'}}>84%</td><td style={{color:'var(--green)',fontWeight:600,fontFamily:'var(--mono)'}}>91%</td><td style={{fontFamily:'var(--mono)'}}>2.1%</td><td><span className="badge badge-top">Top</span></td></tr>
                      <tr><td><strong>BRD Gorakhpur</strong></td><td><div className="mini-bar-wrap"><div className="mini-bar-track"><div className="mini-bar-fill" style={{width:'81%',background:'#22c55e'}}></div></div><span className="mini-val">8.1</span></div></td><td style={{color:'var(--green)',fontWeight:600,fontFamily:'var(--mono)'}}>79%</td><td style={{color:'var(--green)',fontWeight:600,fontFamily:'var(--mono)'}}>85%</td><td style={{fontFamily:'var(--mono)'}}>2.8%</td><td><span className="badge badge-good">Good</span></td></tr>
                      <tr><td><strong>LLRM Meerut</strong></td><td><div className="mini-bar-wrap"><div className="mini-bar-track"><div className="mini-bar-fill" style={{width:'72%',background:'#f59e0b'}}></div></div><span className="mini-val">7.2</span></div></td><td style={{color:'var(--amber)',fontWeight:600,fontFamily:'var(--mono)'}}>72%</td><td style={{color:'var(--amber)',fontWeight:600,fontFamily:'var(--mono)'}}>80%</td><td style={{fontFamily:'var(--mono)'}}>3.4%</td><td><span className="badge badge-avg">Average</span></td></tr>
                      <tr><td><strong>DWH Varanasi</strong></td><td><div className="mini-bar-wrap"><div className="mini-bar-track"><div className="mini-bar-fill" style={{width:'64%',background:'#f59e0b'}}></div></div><span className="mini-val">6.4</span></div></td><td style={{color:'var(--amber)',fontWeight:600,fontFamily:'var(--mono)'}}>65%</td><td style={{color:'var(--amber)',fontWeight:600,fontFamily:'var(--mono)'}}>71%</td><td style={{fontFamily:'var(--mono)'}}>3.9%</td><td><span className="badge badge-avg">Average</span></td></tr>
                      <tr><td><strong>CHC Ballia</strong></td><td><div className="mini-bar-wrap"><div className="mini-bar-track"><div className="mini-bar-fill" style={{width:'58%',background:'#ef4444'}}></div></div><span className="mini-val">5.8</span></div></td><td style={{color:'var(--red)',fontWeight:600,fontFamily:'var(--mono)'}}>51%</td><td style={{color:'var(--red)',fontWeight:600,fontFamily:'var(--mono)'}}>63%</td><td style={{fontFamily:'var(--mono)'}}>4.7%</td><td><span className="badge badge-low">Low</span></td></tr>
                      <tr><td><strong>DH Agra</strong></td><td><div className="mini-bar-wrap"><div className="mini-bar-track"><div className="mini-bar-fill" style={{width:'51%',background:'#ef4444'}}></div></div><span className="mini-val">5.1</span></div></td><td style={{color:'var(--red)',fontWeight:600,fontFamily:'var(--mono)'}}>48%</td><td style={{color:'var(--red)',fontWeight:600,fontFamily:'var(--mono)'}}>58%</td><td style={{color:'var(--red)',fontFamily:'var(--mono)',fontWeight:600}}>5.4%</td><td><span className="badge badge-low">Low ⚠</span></td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="footer">
          Data source: HMIS / KMC Programme MIS &nbsp;·&nbsp; Last updated: 23 May 2025, 08:00 IST &nbsp;·&nbsp;
          Health &amp; Family Welfare Department, Government of Uttar Pradesh &nbsp;·&nbsp; For official use only
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
