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
  fetchTransportKpi,
  fetchKmcDurationTrend,
  fetchGenderComposition,
  fetchSummaryTable,
  fetchStayDuration,
  fetchWeightStability,
  fetchBreastfeeding,
} from '../../redux/slices/admissionSlice';
import {
  fetchLoungePerformance,
  fetchAttendanceMatrix,
} from '../../redux/slices/nurseSlice';
import './Dashboard.css';
import './DashboardSkeleton.css';
import DebugIcon from '../../components/common/DebugIcon';
import DebugModal from '../../components/common/DebugModal';

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const STAY_COLORS   = ['#3b82f6', '#8b5cf6', '#14b8a6', '#f59e0b'];
const WEIGHT_COLORS = { gain: '#22c55e', stable: '#3b82f6', loss: '#ef4444' };
const BF_COLORS     = { exclusive: '#8b5cf6', non_exclusive: '#f59e0b' };

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

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
function formatMonthId(id) {
  const [yr, mo] = id.split('-');
  return `${MONTH_SHORT[parseInt(mo) - 1]} ${yr}`;
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
  const admChartRef      = useRef(null);
  const donutChartRef    = useRef(null);
  const kmcChartRef      = useRef(null);
  const stayChartRef     = useRef(null);
  const weightChartRef       = useRef(null);
  const bfChartRef           = useRef(null);
  const nurseTrendChartRef   = useRef(null);
  const nurseMonthlyChartRef = useRef(null);

  // Chart instance refs
  const admChartInstanceRef          = useRef(null);
  const donutChartInstanceRef        = useRef(null);
  const kmcChartInstanceRef          = useRef(null);
  const stayChartInstanceRef         = useRef(null);
  const weightChartInstanceRef       = useRef(null);
  const bfChartInstanceRef           = useRef(null);
  const nurseTrendChartInstanceRef   = useRef(null);
  const nurseMonthlyChartInstanceRef = useRef(null);

  // Filters
  const filtersState = useSelector(s => s.filters);
  const { selectedFacilities, selectedLounges, startDate, endDate, visibility } = filtersState;

  // Admission data
  const {
    kpi:          admKpi,
    trend:        admTrend,
    composition:  admComp,
    birthWeight:  admBw,
    discharge:    admDischarge,
    earlyCare:    admEarlyCare,
    transport:    admTransport,
    kmcDuration:  admKmcDuration,
    gender:       admGender,
    summaryTable: admSummary,
    stayDuration:    admStayDuration,
    weightStability: admWeightStability,
    breastfeeding:   admBreastfeeding,
    loading:         admLoading,
  } = useSelector(s => s.admissions);

  const {
    loungePerformance: nurseLounge,
    attendanceMatrix:  nurseMatrix,
    loading:           nurseLoading,
  } = useSelector(s => s.nurses);

  const [isDashboardLoading, setIsDashboardLoading] = useState(true);
  const [insightFilter,    setInsightFilter]    = useState(null);  // 'critical' | 'warning' | 'positive' | null
  const [mobileInsightIdx, setMobileInsightIdx] = useState(0);
  const [mobileVisible,    setMobileVisible]    = useState(true);
  
  // Debug Modal State
  const [activeDebugInfo, setActiveDebugInfo] = useState(null);

  // ── Section label (date range) ────────────────────────────────────────────
  const sectionLabel = useMemo(() => {
    if (!startDate || !endDate) return 'Loading…';
    return `${fmtDate(startDate)} – ${fmtDate(endDate)}`;
  }, [startDate, endDate]);

  // ── Previous period label for KPI trend text ──────────────────────────────
  const prevPeriodLabel = useMemo(() => {
    if (!admKpi?.previousPeriod) return '';
    const { startDate: ps, endDate: pe } = admKpi.previousPeriod;
    return `${fmtDate(ps)} – ${fmtDate(pe)}`;
  }, [admKpi]);

  // Stable string keys — re-fire effects only when content actually changes
  const selectedFacilitiesKey = [...selectedFacilities].sort().join(',');
  const selectedLoungesKey    = [...selectedLounges].sort().join(',');

  // ── Trigger skeleton when location or date range changes ─────────────────
  useEffect(() => {
    if (selectedLounges.length && startDate && endDate) {
      setIsDashboardLoading(true);
      const timer = setTimeout(() => setIsDashboardLoading(false), 1200);
      return () => clearTimeout(timer);
    } else {
      setIsDashboardLoading(true);
    }
  }, [selectedLoungesKey, startDate, endDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset insight filter + mobile index whenever dashboard filters change
  useEffect(() => {
    setInsightFilter(null);
    setMobileInsightIdx(0);
    setMobileVisible(true);
  }, [selectedFacilitiesKey, selectedLoungesKey, startDate, endDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset mobile index when filter badge changes
  useEffect(() => { setMobileInsightIdx(0); setMobileVisible(true); }, [insightFilter]);

  // ── Fetch all admission data when filters change ──────────────────────────
  useEffect(() => {
    if (!selectedFacilities.length || !startDate || !endDate) return;
    const params = { facilityIds: selectedFacilitiesKey, startDate, endDate };
    if (selectedLounges.length) params.loungeIds = selectedLoungesKey;
    dispatch(fetchAdmissionKpi(params));
    dispatch(fetchAdmissionTrend(params));
    dispatch(fetchAdmissionComposition(params));
    dispatch(fetchAdmissionBirthWeight(params));
    dispatch(fetchAdmissionDischarge(params));
    dispatch(fetchEarlyCareKpi(params));
    dispatch(fetchTransportKpi(params));
    dispatch(fetchKmcDurationTrend(params));
    dispatch(fetchGenderComposition(params));
    dispatch(fetchSummaryTable(params));
    dispatch(fetchStayDuration(params));
    dispatch(fetchWeightStability(params));
    dispatch(fetchBreastfeeding(params));
    dispatch(fetchLoungePerformance(params));
    dispatch(fetchAttendanceMatrix(params));
  }, [selectedFacilitiesKey, selectedLoungesKey, startDate, endDate, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── KMC Duration trend chart (dynamic) ───────────────────────────────────
  useEffect(() => {
    if (kmcChartInstanceRef.current) { kmcChartInstanceRef.current.destroy(); kmcChartInstanceRef.current = null; }
    if (isDashboardLoading || !kmcChartRef.current || admKmcDuration.length === 0) return;

    const gridColor = 'rgba(0,0,0,0.06)', tickColor = '#9ca3af';
    Chart.defaults.font = { family: "'DM Sans', sans-serif", size: 11 };

    const labels   = admKmcDuration.map(d => `${MONTH_SHORT[d.month - 1]} '${String(d.year).slice(2)}`);
    const avgs     = admKmcDuration.map(d => d.avgHours);
    const maxVal   = Math.max(...avgs, 8);
    const targetData = admKmcDuration.map(() => 8);

    const pointLabelsPlugin = {
      id: 'kmcPointLabels',
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        chart.getDatasetMeta(0).data.forEach((pt, i) => {
          ctx.save();
          ctx.font = '600 10.5px "DM Sans", sans-serif';
          ctx.fillStyle = '#0f766e';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(avgs[i].toFixed(1) + 'h', pt.x, pt.y - 7);
          ctx.restore();
        });
      }
    };

    kmcChartInstanceRef.current = new Chart(kmcChartRef.current, {
      type: 'line',
      plugins: [pointLabelsPlugin],
      data: {
        labels,
        datasets: [
          {
            label: 'Avg KMC hrs/baby/day',
            data: avgs,
            borderColor: '#0f766e', backgroundColor: 'rgba(15,118,110,0.08)',
            fill: true, tension: 0.4, pointRadius: 5, pointHoverRadius: 7,
            pointBackgroundColor: '#0f766e', pointBorderColor: '#fff', pointBorderWidth: 2,
            borderWidth: 2.5,
          },
          {
            label: 'Target (8 hrs)',
            data: targetData,
            borderColor: '#16a34a', borderWidth: 1.5,
            borderDash: [5, 4], pointRadius: 0, fill: false,
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 24 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: 'index', intersect: false,
            callbacks: {
              title: items => {
                const d = admKmcDuration[items[0].dataIndex];
                return `${MONTH_SHORT[d.month - 1]} ${d.year}`;
              },
              label: item => {
                const d = admKmcDuration[item.dataIndex];
                if (item.datasetIndex === 1) return ` Target: 8.0 hrs`;
                return [
                  ` Avg: ${d.avgHours.toFixed(2)} hrs / baby / day`,
                  ` Baby-days: ${d.babyDays.toLocaleString()}`,
                  ` Total KMC: ${d.totalKmcHours.toFixed(1)} hrs`,
                ];
              }
            }
          }
        },
        scales: {
          x: { ticks: { color: tickColor }, grid: { display: false }, border: { display: false } },
          y: {
            min: 0, suggestedMax: Math.ceil(maxVal * 1.15),
            ticks: { color: tickColor, callback: v => v + 'h' },
            grid: { color: gridColor }, border: { display: false }
          }
        }
      }
    });

    return () => { if (kmcChartInstanceRef.current) { kmcChartInstanceRef.current.destroy(); kmcChartInstanceRef.current = null; } };
  }, [isDashboardLoading, admKmcDuration]);

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

  // ── Stay Duration bar chart ───────────────────────────────────────────────
  useEffect(() => {
    if (stayChartInstanceRef.current) { stayChartInstanceRef.current.destroy(); stayChartInstanceRef.current = null; }
    if (isDashboardLoading || !stayChartRef.current || !admStayDuration?.categories?.length) return;

    const cats   = admStayDuration.categories;
    const labels = cats.map(c => c.label);
    const counts = cats.map(c => c.count);
    const gridColor = 'rgba(0,0,0,0.06)', tickColor = '#9ca3af';

    stayChartInstanceRef.current = new Chart(stayChartRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Babies',
          data: counts,
          backgroundColor: STAY_COLORS,
          borderRadius: 6,
          borderWidth: 0,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 16 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => {
                const cat = cats[item.dataIndex];
                return ` ${cat.count.toLocaleString()} babies (${cat.pct}%)`;
              }
            }
          }
        },
        scales: {
          x: { ticks: { color: tickColor }, grid: { display: false }, border: { display: false } },
          y: { ticks: { color: tickColor }, grid: { color: gridColor }, border: { display: false }, min: 0 }
        }
      }
    });

    return () => { if (stayChartInstanceRef.current) { stayChartInstanceRef.current.destroy(); stayChartInstanceRef.current = null; } };
  }, [isDashboardLoading, admStayDuration]);

  // ── Weight Stability donut chart ─────────────────────────────────────────
  useEffect(() => {
    if (weightChartInstanceRef.current) { weightChartInstanceRef.current.destroy(); weightChartInstanceRef.current = null; }
    if (isDashboardLoading || !weightChartRef.current || !admWeightStability?.totalWithData) return;

    const cats   = admWeightStability.categories.filter(c => c.count > 0 || c.key !== 'stable');
    const labels = cats.map(c => c.label);
    const counts = cats.map(c => c.count);
    const colors = cats.map(c => WEIGHT_COLORS[c.key] || '#9ca3af');
    const total  = admWeightStability.totalWithData;

    const centerPlugin = makeCenterTextPlugin('weightCenter', () => ({
      label: 'w/ data', value: total.toLocaleString()
    }));

    weightChartInstanceRef.current = new Chart(weightChartRef.current, {
      type: 'doughnut', plugins: [centerPlugin],
      data: { labels, datasets: [{ data: counts, backgroundColor: colors, hoverOffset: 8, borderWidth: 0 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '68%',
        animation: { animateRotate: true, duration: 700, easing: 'easeInOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed.toLocaleString()} (${cats[ctx.dataIndex].pct}%)` } }
        }
      }
    });

    return () => { if (weightChartInstanceRef.current) { weightChartInstanceRef.current.destroy(); weightChartInstanceRef.current = null; } };
  }, [isDashboardLoading, admWeightStability]);

  // ── Breastfeeding donut chart ─────────────────────────────────────────────
  useEffect(() => {
    if (bfChartInstanceRef.current) { bfChartInstanceRef.current.destroy(); bfChartInstanceRef.current = null; }
    if (isDashboardLoading || !bfChartRef.current || !admBreastfeeding?.totalWithData) return;

    const excl    = admBreastfeeding.categories.find(c => c.key === 'exclusive');
    const nonExcl = admBreastfeeding.categories.find(c => c.key === 'non_exclusive');
    if (!excl || !nonExcl) return;

    const centerPlugin = makeCenterTextPlugin('bfCenter', () => ({
      label: 'w/ data', value: admBreastfeeding.totalWithData.toLocaleString()
    }));

    bfChartInstanceRef.current = new Chart(bfChartRef.current, {
      type: 'doughnut', plugins: [centerPlugin],
      data: {
        labels: [excl.label, nonExcl.label],
        datasets: [{ data: [excl.count, nonExcl.count], backgroundColor: [BF_COLORS.exclusive, BF_COLORS.non_exclusive], hoverOffset: 8, borderWidth: 0 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '68%',
        animation: { animateRotate: true, duration: 700, easing: 'easeInOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed.toLocaleString()} (${[excl, nonExcl][ctx.dataIndex].pct}%)` } }
        }
      }
    });

    return () => { if (bfChartInstanceRef.current) { bfChartInstanceRef.current.destroy(); bfChartInstanceRef.current = null; } };
  }, [isDashboardLoading, admBreastfeeding]);

  // ── Nurse daily trend bar chart ───────────────────────────────────────────
  useEffect(() => {
    if (nurseTrendChartInstanceRef.current) { nurseTrendChartInstanceRef.current.destroy(); nurseTrendChartInstanceRef.current = null; }
    if (isDashboardLoading || !nurseTrendChartRef.current || !nurseLounge?.dailyTrend?.length) return;

    const trend  = nurseLounge.dailyTrend;
    const labels = trend.map(d => {
      const dt = new Date(d.date + 'T12:00:00Z');
      return `${dt.getUTCDate()} ${MONTH_SHORT[dt.getUTCMonth()]}`;
    });
    const counts  = trend.map(d => d.nurseCount);
    const gridColor = 'rgba(0,0,0,0.06)', tickColor = '#9ca3af';
    const maxVal = Math.max(...counts, 1);

    nurseTrendChartInstanceRef.current = new Chart(nurseTrendChartRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Nurses checked in',
          data: counts,
          backgroundColor: counts.map(c => c > 0 ? 'rgba(59,130,246,0.75)' : 'rgba(239,68,68,0.65)'),
          borderRadius: 4,
          borderWidth: 0,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 12 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: items => `${trend[items[0].dataIndex].date}`,
              label: item => ` ${item.parsed.y} nurse${item.parsed.y !== 1 ? 's' : ''} checked in`,
            }
          }
        },
        scales: {
          x: { ticks: { color: tickColor, maxTicksLimit: 30, font: { size: 10 } }, grid: { display: false }, border: { display: false } },
          y: { ticks: { color: tickColor, stepSize: 1 }, grid: { color: gridColor }, border: { display: false }, min: 0, suggestedMax: maxVal + 1 }
        }
      }
    });

    return () => { if (nurseTrendChartInstanceRef.current) { nurseTrendChartInstanceRef.current.destroy(); nurseTrendChartInstanceRef.current = null; } };
  }, [isDashboardLoading, nurseLounge]);

  // ── Nurse monthly trend chart ─────────────────────────────────────────────
  useEffect(() => {
    if (nurseMonthlyChartInstanceRef.current) { nurseMonthlyChartInstanceRef.current.destroy(); nurseMonthlyChartInstanceRef.current = null; }
    if (isDashboardLoading || !nurseMonthlyChartRef.current || !nurseLounge?.monthlyTrend?.length) return;

    const trend  = nurseLounge.monthlyTrend;
    const labels = trend.map(m => `${MONTH_SHORT[m.month - 1]} '${String(m.year).slice(2)}`);
    const gridColor = 'rgba(0,0,0,0.06)', tickColor = '#9ca3af';

    nurseMonthlyChartInstanceRef.current = new Chart(nurseMonthlyChartRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Checked-In Days',
            data: trend.map(m => m.checkinDays),
            backgroundColor: '#3b82f6',
            borderRadius: 4,
            borderWidth: 0,
          },
          {
            label: 'Missed Days',
            data: trend.map(m => m.missedDays),
            backgroundColor: '#fca5a5',
            borderRadius: 4,
            borderWidth: 0,
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 12 } },
        plugins: {
          legend: { display: true, position: 'top', labels: { boxWidth: 12, font: { size: 11 }, color: '#6b7280' } },
          tooltip: {
            mode: 'index', intersect: false,
            callbacks: {
              title: items => labels[items[0].dataIndex],
              label: item => ` ${item.dataset.label}: ${item.parsed.y} days`,
              afterBody: items => {
                const m = trend[items[0].dataIndex];
                return [`Attendance: ${m.pct}% (${m.checkinDays}/${m.totalDays} days)`];
              }
            }
          }
        },
        scales: {
          x: { stacked: true, ticks: { color: tickColor }, grid: { display: false }, border: { display: false } },
          y: { stacked: true, ticks: { color: tickColor, stepSize: 5 }, grid: { color: gridColor }, border: { display: false }, min: 0 }
        }
      }
    });

    return () => { if (nurseMonthlyChartInstanceRef.current) { nurseMonthlyChartInstanceRef.current.destroy(); nurseMonthlyChartInstanceRef.current = null; } };
  }, [isDashboardLoading, nurseLounge]);

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

  // ── Executive Summary Table helpers ─────────────────────────────────────────
  const estBadge = (curr, prev, mode = 'neutral') => {
    if (curr == null || prev == null || prev === 0) return null;
    const diff = curr - prev;
    if (Math.abs(diff) < 0.001) return null;
    let cls = 'est-trend-neu';
    if (mode === 'higher-better') cls = diff > 0 ? 'est-trend-pos' : 'est-trend-neg';
    if (mode === 'lower-better')  cls = diff < 0 ? 'est-trend-pos' : 'est-trend-neg';
    const absPct = ((Math.abs(diff) / Math.abs(prev)) * 100).toFixed(1);
    return <span className={`est-trend ${cls}`}>{diff > 0 ? '↑' : '↓'}{absPct}%</span>;
  };
  const estPpBadge = (currPct, prevPct, higherIsBetter = true) => {
    if (currPct == null || prevPct == null) return null;
    const diff = parseFloat((currPct - prevPct).toFixed(1));
    if (Math.abs(diff) < 0.1) return null;
    const cls = (higherIsBetter ? diff > 0 : diff < 0) ? 'est-trend-pos' : 'est-trend-neg';
    return <span className={`est-trend ${cls}`}>{diff > 0 ? '↑' : '↓'}{Math.abs(diff)}pp</span>;
  };
  const estKmcClass = (avg) => {
    if (avg == null) return '';
    return avg >= 8 ? 'est-green' : avg >= 6 ? 'est-amber' : 'est-red';
  };
  const estPctClass = (p) => {
    if (p == null) return '';
    return p >= 80 ? 'est-green' : p >= 60 ? 'est-amber' : 'est-red';
  };

  return (
    <div className="dashboard-container">
      {/* HEADER */}
      <header className="header">
        <div className="header-left">
          <img src={`${import.meta.env.BASE_URL}cel_logo.png`} alt="CEL · ICMR" className="header-logo" />
          <div className="header-divider" />
          <div>
            <div className="header-title">iKMC Programme — Executive Dashboard</div>
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
            {visibility.kpiCards !== false && <div>
              <div className="section-label">Executive summary — {sectionLabel}</div>
              <div className="kpi-grid">

                {/* Total Admissions — DYNAMIC */}
                <div className={`kpi ${kpiColor()}`}>
                  <div className="kpi-label">
                    Total admissions
                    <DebugIcon onClick={setActiveDebugInfo} info={{
                      title: 'Total Admissions KPI',
                      sourceTable: 'babyAdmission',
                      appliedLogic: 'Count of unique admission IDs (status = 1 OR 2).',
                      queryLogic: 'SELECT COUNT(id) FROM babyAdmission WHERE facilityId IN (...)',
                      formulas: ['Total Admissions = COUNT(id)']
                    }} />
                  </div>
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

                {(() => {
                  const overallAvg = admKmcDuration.length > 0
                    ? (admKmcDuration.reduce((s, d) => s + d.totalKmcHours, 0) /
                       admKmcDuration.reduce((s, d) => s + d.babyDays,     0))
                    : null;
                  const totalBabyDays = admKmcDuration.reduce((s, d) => s + d.babyDays, 0);
                  const col = overallAvg === null ? 'amber'
                    : overallAvg >= 8 ? 'green'
                    : overallAvg >= 6 ? 'amber'
                    : 'red';
                  const trendCls = col === 'green' ? 'trend-up' : col === 'red' ? 'trend-dn' : 'trend-neu';
                  return (
                    <div className={`kpi ${col}`}>
                      <div className="kpi-label">Avg KMC duration</div>
                      {admLoading.kmcDuration ? (
                        <div className="kpi-val adm-loading">—</div>
                      ) : overallAvg !== null ? (
                        <>
                          <div className="kpi-val">{overallAvg.toFixed(1)}<span style={{fontSize:'14px',fontWeight:400}}> hrs</span></div>
                          <div className={`kpi-trend ${trendCls}`}>{totalBabyDays.toLocaleString()} baby-days</div>
                        </>
                      ) : (
                        <><div className="kpi-val">—</div><div className="kpi-trend trend-neu">No data</div></>
                      )}
                    </div>
                  );
                })()}

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
                {(() => {
                  const d   = admTransport?.overall;
                  const pct = d?.mother?.pct ?? null;
                  const col = pct === null ? 'green' : pct >= 80 ? 'green' : pct >= 60 ? 'amber' : 'red';
                  const trendCls = pct === null ? 'trend-neu' : pct >= 80 ? 'trend-up' : pct >= 60 ? 'trend-neu' : 'trend-dn';
                  return (
                    <div className={`kpi ${col}`}>
                      <div className="kpi-label">KMC transport</div>
                      {admLoading.transport ? (
                        <div className="kpi-val adm-loading">—</div>
                      ) : d && d.total > 0 ? (
                        <>
                          <div className="kpi-val">{pct}<span style={{fontSize:'14px',fontWeight:400}}>%</span></div>
                          <div className={`kpi-trend ${trendCls}`}>{d.mother.count.toLocaleString()} of {d.total.toLocaleString()} with mother</div>
                        </>
                      ) : (
                        <><div className="kpi-val">—</div><div className="kpi-trend trend-neu">No data</div></>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>}

            {/* ROW 2: Admission trend + Inborn/Outborn */}
            {(visibility.admissionTrend !== false || visibility.inbornOutborn !== false) && <div className="row-2col">
              {visibility.admissionTrend !== false && <div className="card">
                <div className="card-title">
                  Admission trend — monthly ({sectionLabel})
                  <DebugIcon onClick={setActiveDebugInfo} info={{
                    title: 'Admission Trend',
                    sourceTable: 'babyAdmission',
                    appliedLogic: 'Monthly grouped count of admissions.',
                    groupingLogic: 'GROUP BY YEAR(admissionDate), MONTH(admissionDate)',
                    queryLogic: 'SELECT YEAR(admissionDate), MONTH(admissionDate), COUNT(id) FROM babyAdmission GROUP BY 1, 2'
                  }} />
                </div>
                <div className="chart-wrap chart-fill">
                  <canvas ref={admChartRef} role="img" aria-label="Monthly admission trend chart" />
                  {admLoading.trend && <div className="adm-chart-overlay">Loading trend data…</div>}
                  {!admLoading.trend && admTrend.length === 0 && <div className="adm-chart-overlay">No admission data available</div>}
                </div>
              </div>}

              {visibility.inbornOutborn !== false && <div className="card">
                <div className="card-title">
                  Inborn vs Outborn composition
                  <DebugIcon onClick={setActiveDebugInfo} info={{
                    title: 'Inborn vs Outborn Composition',
                    sourceTable: 'babyAdmission',
                    appliedLogic: 'Counts grouped by babyType (1=Inborn, 2=Outborn).',
                    formulas: ['Inborn % = (Inborn / Total) * 100', 'Outborn % = (Outborn / Total) * 100']
                  }} />
                </div>
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
              </div>}
            </div>}

            {/* ROW 3: Birth weight (dynamic donut) + Clinical compliance + KMC trend */}
            {(visibility.birthWeight !== false || visibility.gender !== false || visibility.kmcDuration !== false) && <div className="row-3col">
              {/* Birth Weight Distribution — DYNAMIC (CSS visualization) */}
              {visibility.birthWeight !== false && <div className="card">
                <div className="card-title">
                  Birth weight distribution
                  <DebugIcon onClick={setActiveDebugInfo} info={{
                    title: 'Birth Weight Distribution',
                    sourceTable: 'babyAdmission',
                    appliedLogic: 'Admissions categorized by birthWeight metric.',
                    formulas: ['VLBW = <1800g', 'LBW = 1800-2499g', 'Normal = >=2500g']
                  }} />
                </div>
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
              </div>}

              {/* Gender Composition — DYNAMIC */}
              {visibility.gender !== false && <div className="card">
                <div className="card-title">
                  Gender composition
                  <DebugIcon onClick={setActiveDebugInfo} info={{
                    title: 'Gender Composition',
                    sourceTable: 'babyAdmission',
                    appliedLogic: 'Counts by babyGender (1=Male, 2=Female). Includes Inborn/Outborn split.',
                    queryLogic: 'SELECT babyGender, babyType, COUNT(id) FROM babyAdmission GROUP BY babyGender, babyType'
                  }} />
                </div>
                {admLoading.gender ? (
                  <div className="adm-chart-overlay" style={{position:'relative',height:'140px'}}>Loading…</div>
                ) : !admGender || admGender.total === 0 ? (
                  <div className="adm-chart-overlay" style={{position:'relative',height:'140px'}}>No data available</div>
                ) : (() => {
                  const genders = [
                    { key: 'male',   label: 'Male',   icon: '♂', color: '#3b82f6', inbornColor: '#1d4ed8', outbornColor: '#93c5fd', data: admGender.male   },
                    { key: 'female', label: 'Female', icon: '♀', color: '#ec4899', inbornColor: '#be185d', outbornColor: '#f9a8d4', data: admGender.female },
                  ];
                  return (
                    <div className="gd-section">
                      <div className="gd-total">
                        <span className="gd-total-num">{admGender.total.toLocaleString()}</span>
                        <span className="gd-total-lbl">total babies</span>
                      </div>
                      <div className="gd-rows">
                        {genders.map(({ key, label, icon, color, inbornColor, outbornColor, data }) => {
                          const inbornFlex  = data.total > 0 ? (data.inborn  / data.total) * 100 : 50;
                          const outbornFlex = data.total > 0 ? (data.outborn / data.total) * 100 : 50;
                          return (
                            <div key={key} className="gd-row" style={{'--gd-color': color}}>
                              <div className="gd-row-head">
                                <span className="gd-icon" style={{color}}>{icon}</span>
                                <span className="gd-label">{label}</span>
                                <span className="gd-count">{data.total.toLocaleString()}</span>
                                <span className="gd-pct" style={{color}}>{data.pct}%</span>
                              </div>
                              <div
                                className="gd-bar"
                                title={`${label} — Inborn: ${data.inborn.toLocaleString()} · Outborn: ${data.outborn.toLocaleString()}`}
                              >
                                <div className="gd-seg" style={{flex: inbornFlex  || 0.001, background: inbornColor}} />
                                <div className="gd-seg" style={{flex: outbornFlex || 0.001, background: outbornColor}} />
                              </div>
                              <div className="gd-sub">
                                <span style={{color: inbornColor, fontWeight:600}}>Inborn: {data.inborn.toLocaleString()}</span>
                                <span className="gd-sub-sep">·</span>
                                <span style={{color: outbornColor === '#f9a8d4' ? '#be185d' : '#1d4ed8', fontWeight:600}}>Outborn: {data.outborn.toLocaleString()}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>}

              {/* KMC Duration Trend — DYNAMIC */}
              {visibility.kmcDuration !== false && <div className="card">
                <div className="card-title">
                  Avg KMC duration / baby / day
                  <DebugIcon onClick={setActiveDebugInfo} info={{
                    title: 'KMC Duration Trend',
                    sourceTable: 'kmcTransaction, babyAdmission',
                    appliedLogic: 'Average KMC hours per baby per day per month.',
                    formulas: ['Avg Hours = SUM(kmcHours) / SUM(babyDays)']
                  }} />
                </div>
                {(() => {
                  const overallAvg = admKmcDuration.length > 0
                    ? (admKmcDuration.reduce((s, d) => s + d.totalKmcHours, 0) /
                       admKmcDuration.reduce((s, d) => s + d.babyDays,     0)).toFixed(1)
                    : null;
                  const avgColor = overallAvg === null ? 'var(--text-muted)'
                    : parseFloat(overallAvg) >= 8 ? 'var(--green)'
                    : parseFloat(overallAvg) >= 6 ? 'var(--amber)'
                    : 'var(--red)';
                  return (
                    <>
                      {overallAvg && (
                        <div className="kmc-avg-strip">
                          <span className="kmc-avg-val" style={{color: avgColor}}>{overallAvg}<span className="kmc-avg-unit">h</span></span>
                          <span className="kmc-avg-meta">avg · target ≥8 h</span>
                        </div>
                      )}
                      <div className="chart-wrap chart-fill">
                        <canvas ref={kmcChartRef} role="img" aria-label="KMC duration trend chart" />
                        {admLoading.kmcDuration && <div className="adm-chart-overlay">Loading…</div>}
                        {!admLoading.kmcDuration && admKmcDuration.length === 0 && <div className="adm-chart-overlay">No KMC duration data</div>}
                      </div>
                    </>
                  );
                })()}
              </div>}
            </div>}

            {/* ROW 4: Early Care Indicators — KMC within 2h + BF within 1h */}
            {visibility.earlyCare !== false && <div className="row-2col-even">
              {/* ── KMC within 2 hours ── */}
              {[
                { key: 'kmc', title: 'KMC Initiated within 2 Hours',         icon: '🫀', debug: { title: 'Early Care: KMC', sourceTable: 'babyAdmission', formulas: ['KMC < 2h % = (Yes / Total) * 100'] } },
                { key: 'bf',  title: 'Breastfeeding Initiated within 1 Hour', icon: '🤱', debug: { title: 'Early Care: Breastfeeding', sourceTable: 'babyAdmission', formulas: ['BF < 1h % = (Yes / Total) * 100'] } },
              ].map(({ key, title, debug }) => {
                const data    = admEarlyCare?.[key];
                const loading = admLoading.earlyCare;
                return (
                  <div key={key} className="card ec-card">
                    <div className="card-title">
                      {title}
                      <DebugIcon onClick={setActiveDebugInfo} info={debug} />
                    </div>

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
            </div>}

            {/* ROW 5: Transportation in KMC Position — DYNAMIC */}
            {visibility.transport !== false && <div>
              <div className="section-label">Transportation in KMC Position — {sectionLabel}</div>
              <div className="card tp-card">
                <div className="card-title">
                  Baby Transportation in KMC Position
                  <DebugIcon onClick={setActiveDebugInfo} info={{
                    title: 'Transportation in KMC',
                    sourceTable: 'babyAdmission',
                    appliedLogic: 'Counts based on transportType and kmcTransport position.',
                    formulas: ['Transferred in KMC % = (Yes / Total Transferred) * 100']
                  }} />
                </div>
                {admLoading.transport ? (
                  <div className="ec-empty">Loading transport data…</div>
                ) : !admTransport || admTransport.overall.total === 0 ? (
                  <div className="ec-empty">No transportation data available for selected period</div>
                ) : (() => {
                  const panels = [
                    { key: 'overall', label: 'Overall', sub: 'All babies', data: admTransport.overall },
                    { key: 'inborn',  label: 'Inborn Only', sub: 'Born at this facility', data: admTransport.inborn },
                  ];
                  return (
                    <div className="tp-panels">
                      {panels.map(({ key, label, sub, data }) => {
                        const motherFlex    = data.total > 0 ? (data.mother.count    / data.total) * 100 : 50;
                        const surrogateFlex = data.total > 0 ? (data.surrogate.count / data.total) * 100 : 50;
                        return (
                          <div key={key} className="tp-panel">
                            <div className="tp-panel-head">
                              <div>
                                <div className="tp-panel-label">{label}</div>
                                <div className="tp-panel-sub">{sub}</div>
                              </div>
                              <div className="tp-panel-total">
                                <span className="tp-total-num">{data.total.toLocaleString()}</span>
                                <span className="tp-total-lbl">babies</span>
                              </div>
                            </div>

                            <div
                              className="tp-bar"
                              title={`Mother: ${data.mother.count.toLocaleString()} (${data.mother.pct}%) · Surrogate: ${data.surrogate.count.toLocaleString()} (${data.surrogate.pct}%)`}
                            >
                              <div className="tp-seg tp-seg-mother"    style={{ flex: motherFlex    || 0.001 }} />
                              <div className="tp-seg tp-seg-surrogate" style={{ flex: surrogateFlex || 0.001 }} />
                            </div>

                            <div className="tp-stats">
                              {[
                                { cls: 'mother',    label: 'With Mother',    d: data.mother    },
                                { cls: 'surrogate', label: 'With Surrogate', d: data.surrogate },
                              ].map(({ cls, label: statLabel, d }) => (
                                <div key={cls} className="tp-stat-row">
                                  <span className={`tp-dot tp-dot-${cls}`} />
                                  <span className="tp-stat-label">{statLabel}</span>
                                  <span className="tp-stat-count">{d.count.toLocaleString()}</span>
                                  <span className={`tp-stat-pct tp-pct-${cls}`}>{d.pct}%</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>}

            {/* ROW 6: Discharge outcomes — full width */}
            {visibility.discharge !== false && <div className="card">
              <div className="card-title">
                Discharge outcomes breakdown
                <DebugIcon onClick={setActiveDebugInfo} info={{
                  title: 'Discharge Outcomes',
                  sourceTable: 'babyAdmission',
                  appliedLogic: 'Discharge categories grouped and counted.',
                  formulas: ['Mortality % = (Died / Total Discharged) * 100', 'LAMA % = (LAMA / Total Discharged) * 100']
                }} />
                {admDischarge && !admLoading.discharge && (
                  <span style={{marginLeft:'8px', fontSize:'11px', fontWeight:500, color:'var(--text-muted)'}}>
                    {admDischarge.totalDischarge.toLocaleString()} total
                  </span>
                )}
              </div>

              <div className="dc-bar-legend">
                <span className="dc-bar-legend-swatch" style={{background:'#3b82f6'}} />
                <span className="dc-bar-legend-label">Inborn</span>
                <span className="dc-bar-legend-swatch" style={{background:'#14b8a6', marginLeft:'12px'}} />
                <span className="dc-bar-legend-label">Outborn</span>
              </div>

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
                      const barW   = (c.total / maxTotal) * 100;
                      const inPct  = c.total > 0 ? (c.inborn  / c.total) * 100 : 0;
                      const outPct = c.total > 0 ? (c.outborn / c.total) * 100 : 0;
                      const color  = DC_COLORS[c.label] || '#94a3b8';
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
                              {inPct  > 0 && <div className="dc-bar-seg dc-bar-inborn"  style={{flex: inPct}}  />}
                              {outPct > 0 && <div className="dc-bar-seg dc-bar-outborn" style={{flex: outPct}} />}
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
            </div>}

            {/* ROW 7: Executive Summary Analytics Table */}
            {visibility.executiveSummary !== false && <div className="card est-card">
              <div className="est-header">
                <div>
                  <div className="card-title" style={{marginBottom:'2px'}}>
                    Executive performance summary
                    <DebugIcon onClick={setActiveDebugInfo} info={{
                      title: 'Facility Summary Table',
                      sourceTable: 'babyAdmission, kmcTransaction',
                      appliedLogic: 'Aggregated monthly table of all key indicators.',
                      groupingLogic: 'Grouped by Month-Year over the selected period.'
                    }} />
                  </div>
                  <div className="est-subtitle">Month-wise indicator comparison · {sectionLabel}</div>
                </div>
                <div className="est-legend">
                  <span className="est-leg-item"><span className="est-trend est-trend-pos">↑</span> Improvement</span>
                  <span className="est-leg-sep">·</span>
                  <span className="est-leg-item"><span className="est-trend est-trend-neg">↓</span> Decline</span>
                  <span className="est-leg-sep">·</span>
                  <span className="est-leg-item"><span className="est-trend est-trend-neu">↑</span> Neutral (count)</span>
                  <span className="est-leg-sep">·</span>
                  <span className="est-leg-item">pp = percentage points</span>
                </div>
              </div>

              {admLoading.summary && (
                <div className="adm-chart-overlay" style={{position:'relative',height:'260px'}}>Building executive summary…</div>
              )}
              {!admLoading.summary && (!admSummary || admSummary.months.length === 0) && (
                <div className="adm-chart-overlay" style={{position:'relative',height:'180px'}}>No data available for selected filters</div>
              )}
              {admSummary && !admLoading.summary && admSummary.months.length > 0 && (() => {
                const mos = admSummary.months;
                const prev = (idx) => idx > 0 ? mos[idx - 1] : null;

                return (
                  <div className="est-wrap">
                    <table className="est-table">
                      <thead>
                        <tr>
                          <th className="est-col-ind">Indicator</th>
                          {mos.map(m => <th key={m} className="est-col-month">{formatMonthId(m)}</th>)}
                        </tr>
                      </thead>
                      <tbody>

                        {/* ── GROUP: Volume ── */}
                        <tr className="est-group-row">
                          <td className="est-group-label" colSpan={mos.length + 1}>Volume</td>
                        </tr>

                        {/* Admissions */}
                        <tr>
                          <td className="est-col-ind est-td-ind">
                            <div className="est-ind-cell">
                              <span className="est-ind-dot" style={{background:'#3b82f6'}} />
                              <span className="est-ind-name">Admissions</span>
                            </div>
                          </td>
                          {mos.map((m, i) => {
                            const v = admSummary.admissions[m] ?? null;
                            const p = prev(i) ? (admSummary.admissions[prev(i)] ?? null) : null;
                            return (
                              <td key={m}>
                                <div className="est-cell">
                                  <span className="est-val">{v != null ? v.toLocaleString() : '—'}</span>
                                  {estBadge(v, p, 'neutral')}
                                </div>
                              </td>
                            );
                          })}
                        </tr>

                        {/* BW <1800g */}
                        <tr>
                          <td className="est-col-ind est-td-ind">
                            <div className="est-ind-cell">
                              <span className="est-ind-dot" style={{background:'#f59e0b'}} />
                              <span className="est-ind-name">BW &lt;1800g</span>
                            </div>
                          </td>
                          {mos.map((m, i) => {
                            const v = admSummary.bwLt1800[m] ?? null;
                            const p = prev(i) ? (admSummary.bwLt1800[prev(i)] ?? null) : null;
                            return (
                              <td key={m}>
                                <div className="est-cell">
                                  <span className="est-val">{v != null ? v.toLocaleString() : '—'}</span>
                                  {estBadge(v, p, 'neutral')}
                                </div>
                              </td>
                            );
                          })}
                        </tr>

                        {/* Discharges */}
                        <tr>
                          <td className="est-col-ind est-td-ind">
                            <div className="est-ind-cell">
                              <span className="est-ind-dot" style={{background:'#14b8a6'}} />
                              <span className="est-ind-name">Discharges</span>
                            </div>
                          </td>
                          {mos.map((m, i) => {
                            const v = admSummary.discharges[m] ?? null;
                            const p = prev(i) ? (admSummary.discharges[prev(i)] ?? null) : null;
                            return (
                              <td key={m}>
                                <div className="est-cell">
                                  <span className="est-val">{v != null ? v.toLocaleString() : '—'}</span>
                                  {estBadge(v, p, 'neutral')}
                                </div>
                              </td>
                            );
                          })}
                        </tr>

                        {/* ── GROUP: Early Care ── */}
                        <tr className="est-group-row">
                          <td className="est-group-label" colSpan={mos.length + 1}>Early Care Quality</td>
                        </tr>

                        {/* SSC <2h */}
                        <tr>
                          <td className="est-col-ind est-td-ind">
                            <div className="est-ind-cell">
                              <span className="est-ind-dot" style={{background:'#22c55e'}} />
                              <span className="est-ind-name">SSC &lt;2h</span>
                            </div>
                          </td>
                          {mos.map((m, i) => {
                            const d    = admSummary.ssc2h[m];
                            const pPct = prev(i) ? (admSummary.ssc2h[prev(i)]?.pct ?? null) : null;
                            return (
                              <td key={m}>
                                <div className="est-cell">
                                  <span className={`est-val ${estPctClass(d?.pct ?? null)}`}>
                                    {d ? `${d.pct}%` : '—'}
                                  </span>
                                  {d && <span className="est-sub">{d.yes.toLocaleString()} / {d.total.toLocaleString()}</span>}
                                  {estPpBadge(d?.pct ?? null, pPct)}
                                </div>
                              </td>
                            );
                          })}
                        </tr>

                        {/* BF <1h */}
                        <tr>
                          <td className="est-col-ind est-td-ind">
                            <div className="est-ind-cell">
                              <span className="est-ind-dot" style={{background:'#8b5cf6'}} />
                              <span className="est-ind-name">BF &lt;1h</span>
                            </div>
                          </td>
                          {mos.map((m, i) => {
                            const d    = admSummary.bf1h[m];
                            const pPct = prev(i) ? (admSummary.bf1h[prev(i)]?.pct ?? null) : null;
                            return (
                              <td key={m}>
                                <div className="est-cell">
                                  <span className={`est-val ${estPctClass(d?.pct ?? null)}`}>
                                    {d ? `${d.pct}%` : '—'}
                                  </span>
                                  {d && <span className="est-sub">{d.yes.toLocaleString()} / {d.total.toLocaleString()}</span>}
                                  {estPpBadge(d?.pct ?? null, pPct)}
                                </div>
                              </td>
                            );
                          })}
                        </tr>

                        {/* ── GROUP: KMC Quality ── */}
                        <tr className="est-group-row">
                          <td className="est-group-label" colSpan={mos.length + 1}>KMC Quality</td>
                        </tr>

                        {/* Avg KMC */}
                        <tr>
                          <td className="est-col-ind est-td-ind">
                            <div className="est-ind-cell">
                              <span className="est-ind-dot" style={{background:'#0f766e'}} />
                              <span className="est-ind-name">Avg KMC</span>
                            </div>
                          </td>
                          {mos.map((m, i) => {
                            const d    = admSummary.avgKmc[m];
                            const pAvg = prev(i) ? (admSummary.avgKmc[prev(i)]?.avg ?? null) : null;
                            return (
                              <td key={m}>
                                <div className="est-cell">
                                  <span className={`est-val ${estKmcClass(d?.avg ?? null)}`}>
                                    {d ? `${d.avg.toFixed(1)}h` : '—'}
                                  </span>
                                  {d && <span className="est-sub">{d.babyDays.toLocaleString()} baby-days</span>}
                                  {estBadge(d?.avg ?? null, pAvg, 'higher-better')}
                                </div>
                              </td>
                            );
                          })}
                        </tr>

                        {/* KMC Trans (M) */}
                        <tr>
                          <td className="est-col-ind est-td-ind">
                            <div className="est-ind-cell">
                              <span className="est-ind-dot" style={{background:'#1d4ed8'}} />
                              <span className="est-ind-name">KMC Trans (M)</span>
                            </div>
                          </td>
                          {mos.map((m, i) => {
                            const d = admSummary.kmcTransMother[m];
                            const p = prev(i) ? (admSummary.kmcTransMother[prev(i)] ?? null) : null;
                            return (
                              <td key={m}>
                                <div className="est-cell">
                                  <span className="est-val">{d ? d.count.toLocaleString() : '—'}</span>
                                  {d && <span className="est-sub">{d.pct}% of {d.total.toLocaleString()}</span>}
                                  {estBadge(d?.count ?? null, p?.count ?? null, 'neutral')}
                                </div>
                              </td>
                            );
                          })}
                        </tr>

                        {/* KMC Trans (S) */}
                        <tr>
                          <td className="est-col-ind est-td-ind">
                            <div className="est-ind-cell">
                              <span className="est-ind-dot" style={{background:'#7c3aed'}} />
                              <span className="est-ind-name">KMC Trans (S)</span>
                            </div>
                          </td>
                          {mos.map((m, i) => {
                            const d = admSummary.kmcTransSurrogate[m];
                            const p = prev(i) ? (admSummary.kmcTransSurrogate[prev(i)] ?? null) : null;
                            return (
                              <td key={m}>
                                <div className="est-cell">
                                  <span className="est-val">{d ? d.count.toLocaleString() : '—'}</span>
                                  {d && <span className="est-sub">{d.pct}% of {d.total.toLocaleString()}</span>}
                                  {estBadge(d?.count ?? null, p?.count ?? null, 'neutral')}
                                </div>
                              </td>
                            );
                          })}
                        </tr>

                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>}

            {/* ROW 8: Stay Duration Analytics */}
            {visibility.stayDuration !== false && <div>
              <div className="section-label">Stay Duration Analytics — {sectionLabel}</div>
              <div className="stay-kpi-grid">
                {admLoading.stayDuration
                  ? [0,1,2,3].map(i => <div key={i} className="stay-kpi-card stay-kpi-loading" />)
                  : admStayDuration?.categories?.map((cat, i) => (
                    <div key={cat.key} className="stay-kpi-card" style={{'--stay-color': STAY_COLORS[i]}}>
                      <div className="stay-cat-label">{cat.label}</div>
                      <div className="stay-cat-count">{cat.count.toLocaleString()}</div>
                      <div className="stay-cat-pct" style={{color: STAY_COLORS[i]}}>{cat.pct}%</div>
                      <div className="stay-cat-bar-track">
                        <div className="stay-cat-bar-fill" style={{width: cat.pct + '%', background: STAY_COLORS[i]}} />
                      </div>
                      <div className="stay-cat-sub">
                        of {admStayDuration.total.toLocaleString()} total babies
                      </div>
                    </div>
                  ))
                }
              </div>
              <div className="card" style={{marginTop:'16px'}}>
                <div className="card-title">
                  Stay Duration Distribution
                  <DebugIcon onClick={setActiveDebugInfo} info={{
                    title: 'Stay Duration Distribution',
                    sourceTable: 'babyAdmission',
                    appliedLogic: 'Duration = TIMESTAMPDIFF(HOUR, admissionDateTime, COALESCE(dateOfDischarge, NOW())). Active admissions use NOW() as proxy.',
                    formulas: ['Stay Hours = TIMESTAMPDIFF(HOUR, admissionDateTime, COALESCE(dateOfDischarge, NOW()))'],
                    categories: ['0–24h', '24–48h', '48–72h', '>72h']
                  }} />
                </div>
                {admLoading.stayDuration && (
                  <div className="adm-chart-overlay" style={{position:'relative',height:'200px'}}>Loading stay data…</div>
                )}
                {!admLoading.stayDuration && !admStayDuration?.total && (
                  <div className="adm-chart-overlay" style={{position:'relative',height:'200px'}}>No stay duration data for selected period</div>
                )}
                {!admLoading.stayDuration && admStayDuration?.total > 0 && (
                  <div className="chart-wrap chart-fill" style={{minHeight:'200px'}}>
                    <canvas ref={stayChartRef} role="img" aria-label="Stay duration distribution chart" />
                  </div>
                )}
              </div>
            </div>}

            {/* ROW 9: Weight Stability Analytics */}
            {visibility.weightStability !== false && (
              <div>
                <div className="section-label">Weight Stability Analytics — {sectionLabel}</div>
                <div className="row-2col-even">
                  {/* Left: KPI tiles */}
                  <div className="card">
                    <div className="card-title">
                      Weight Gain / Loss Distribution
                      <DebugIcon onClick={setActiveDebugInfo} info={{
                        title: 'Weight Stability Analytics',
                        sourceTable: 'babyDailyWeight',
                        appliedLogic: 'Compares birth weight (weightType=1) vs discharge weight (weightType=4) per admission. Gain = discharge > birth, Loss = discharge < birth, Stable = equal.',
                        formulas: ['Weight Diff = discharge_weight − birth_weight'],
                        note: 'Only babies with both birth and discharge weights recorded are included. Discharge weight data may be sparse.'
                      }} />
                    </div>
                    {admLoading.weightStability ? (
                      <div className="adm-chart-overlay" style={{position:'relative',height:'180px'}}>Loading weight data…</div>
                    ) : !admWeightStability || admWeightStability.totalWithData === 0 ? (
                      <div className="adm-chart-overlay" style={{position:'relative',height:'180px'}}>
                        {admWeightStability ? `No discharge weight data available (0 of ${admWeightStability.totalAdmissions.toLocaleString()} babies have discharge weights recorded)` : 'No data available'}
                      </div>
                    ) : (() => {
                      const cats = admWeightStability.categories;
                      return (
                        <div className="ws-section">
                          <div className="ws-coverage">
                            <span className="ws-coverage-num">{admWeightStability.totalWithData.toLocaleString()}</span>
                            <span className="ws-coverage-of"> of {admWeightStability.totalAdmissions.toLocaleString()} babies</span>
                            <span className="ws-coverage-label"> have both birth &amp; discharge weights</span>
                          </div>
                          <div className="ws-tiles">
                            {cats.map(c => (
                              <div key={c.key} className="ws-tile" style={{'--ws-color': WEIGHT_COLORS[c.key]}}>
                                <div className="ws-tile-icon">
                                  {c.key === 'gain' ? '↑' : c.key === 'loss' ? '↓' : '→'}
                                </div>
                                <div className="ws-tile-label">{c.label}</div>
                                <div className="ws-tile-count">{c.count.toLocaleString()}</div>
                                <div className="ws-tile-pct" style={{color: WEIGHT_COLORS[c.key]}}>{c.pct}%</div>
                                <div className="ws-tile-track">
                                  <div className="ws-tile-fill" style={{width: c.pct + '%', background: WEIGHT_COLORS[c.key]}} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Right: Donut chart */}
                  <div className="card">
                    <div className="card-title">Weight Change Overview</div>
                    {admLoading.weightStability ? (
                      <div className="adm-chart-overlay" style={{position:'relative',height:'200px'}}>Loading…</div>
                    ) : !admWeightStability?.totalWithData ? (
                      <div className="adm-chart-overlay" style={{position:'relative',height:'200px'}}>Insufficient discharge weight data</div>
                    ) : (
                      <>
                        <div className="chart-wrap" style={{height:'190px',position:'relative'}}>
                          <canvas ref={weightChartRef} role="img" aria-label="Weight stability donut chart" />
                        </div>
                        <div className="comp-stats">
                          {admWeightStability.categories.map(c => (
                            <div key={c.key} className="comp-item" style={{minWidth:0}}>
                              <span className="comp-dot" style={{background: WEIGHT_COLORS[c.key]}} />
                              <div className="comp-info">
                                <div className="comp-label">{c.label}</div>
                                <div className="comp-count">{c.count.toLocaleString()}</div>
                                <div className="comp-pct" style={{color: WEIGHT_COLORS[c.key]}}>{c.pct}%</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ROW 10: Breastfeeding Analytics */}
            {visibility.breastfeeding !== false && (
              <div>
                <div className="section-label">Breastfeeding Analytics — {sectionLabel}</div>
                <div className="row-2col-even">
                  {/* Left: KPI tiles */}
                  <div className="card">
                    <div className="card-title">
                      Exclusive vs Non-Exclusive Breastfeeding
                      <DebugIcon onClick={setActiveDebugInfo} info={{
                        title: 'Breastfeeding Analytics',
                        sourceTable: 'babyDailyNutrition',
                        appliedLogic: 'Each baby is classified based on all their nutrition records. Exclusive = only breastfeed methods 1 (Breastfeed) or 2 (Expressed BM) found across all records. Non-Exclusive = any other method code present.',
                        formulas: ['Exclusive % = (Exclusive / (Exclusive + Non-Exclusive)) × 100'],
                        note: 'breastFeedMethod stored as JSON array. Babies with no nutrition records are counted separately as No Data.'
                      }} />
                    </div>
                    {admLoading.breastfeeding ? (
                      <div className="adm-chart-overlay" style={{position:'relative',height:'180px'}}>Loading breastfeeding data…</div>
                    ) : !admBreastfeeding || admBreastfeeding.totalWithData === 0 ? (
                      <div className="adm-chart-overlay" style={{position:'relative',height:'180px'}}>No breastfeeding data available</div>
                    ) : (() => {
                      const excl     = admBreastfeeding.categories.find(c => c.key === 'exclusive');
                      const nonExcl  = admBreastfeeding.categories.find(c => c.key === 'non_exclusive');
                      const noData   = admBreastfeeding.categories.find(c => c.key === 'no_data');
                      return (
                        <div className="bf-section">
                          <div className="bf-summary">
                            <div className="bf-excl-badge" style={{color: BF_COLORS.exclusive}}>
                              <span className="bf-excl-pct">{admBreastfeeding.exclusivePct}%</span>
                              <span className="bf-excl-label">Exclusive BF rate</span>
                            </div>
                            <div className="bf-totals">
                              <span className="bf-total-num">{admBreastfeeding.totalWithData.toLocaleString()}</span>
                              <span className="bf-total-label"> babies with feeding data</span>
                            </div>
                          </div>
                          <div className="bf-tiles">
                            {[excl, nonExcl].filter(Boolean).map(c => (
                              <div key={c.key} className="bf-tile" style={{'--bf-color': BF_COLORS[c.key]}}>
                                <div className="bf-tile-label">{c.label}</div>
                                <div className="bf-tile-count">{c.count.toLocaleString()}</div>
                                <div className="bf-tile-pct" style={{color: BF_COLORS[c.key]}}>{c.pct}%</div>
                                <div className="bf-tile-track">
                                  <div className="bf-tile-fill" style={{width: c.pct + '%', background: BF_COLORS[c.key]}} />
                                </div>
                              </div>
                            ))}
                          </div>
                          {noData && noData.count > 0 && (
                            <div className="bf-nodata-note">
                              + {noData.count.toLocaleString()} babies have no nutrition records
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Right: Donut chart */}
                  <div className="card">
                    <div className="card-title">Breastfeeding Method Distribution</div>
                    {admLoading.breastfeeding ? (
                      <div className="adm-chart-overlay" style={{position:'relative',height:'200px'}}>Loading…</div>
                    ) : !admBreastfeeding?.totalWithData ? (
                      <div className="adm-chart-overlay" style={{position:'relative',height:'200px'}}>No breastfeeding data</div>
                    ) : (
                      <>
                        <div className="chart-wrap" style={{height:'190px',position:'relative'}}>
                          <canvas ref={bfChartRef} role="img" aria-label="Breastfeeding method donut chart" />
                        </div>
                        <div className="comp-stats">
                          {admBreastfeeding.categories.filter(c => c.key !== 'no_data').map(c => (
                            <div key={c.key} className="comp-item" style={{minWidth:0}}>
                              <span className="comp-dot" style={{background: BF_COLORS[c.key]}} />
                              <div className="comp-info">
                                <div className="comp-label">{c.label}</div>
                                <div className="comp-count">{c.count.toLocaleString()}</div>
                                <div className="comp-pct" style={{color: BF_COLORS[c.key]}}>{c.pct}%</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ROW 11: Nurse Lounge Performance Analytics */}
            {visibility.nurseLounge !== false && (
              <div>
                <div className="section-label">Nurse Lounge Performance — {sectionLabel}</div>

                {/* KPI Cards */}
                {nurseLoading.loungePerformance ? (
                  <div className="nurse-kpi-grid">
                    {[0,1,2,3].map(i => <div key={i} className="nurse-kpi-card nurse-kpi-loading" />)}
                  </div>
                ) : nurseLounge?.kpi ? (() => {
                  const { totalDays, checkinDays, missedDays, pct } = nurseLounge.kpi;
                  const pctColor = pct >= 90 ? '#22c55e' : pct >= 70 ? '#f59e0b' : '#ef4444';
                  return (
                    <div className="nurse-kpi-grid">
                      <div className="nurse-kpi-card" style={{'--nk-color': pctColor}}>
                        <div className="nurse-kpi-label">Attendance Rate</div>
                        <div className="nurse-kpi-val" style={{color: pctColor}}>{pct}<span className="nurse-kpi-unit">%</span></div>
                        <div className="nurse-kpi-sub">Lounge operational coverage</div>
                      </div>
                      <div className="nurse-kpi-card" style={{'--nk-color': '#3b82f6'}}>
                        <div className="nurse-kpi-label">Total Days in Range</div>
                        <div className="nurse-kpi-val">{totalDays}</div>
                        <div className="nurse-kpi-sub">{sectionLabel}</div>
                      </div>
                      <div className="nurse-kpi-card" style={{'--nk-color': '#22c55e'}}>
                        <div className="nurse-kpi-label">Check-In Days</div>
                        <div className="nurse-kpi-val" style={{color:'#22c55e'}}>{checkinDays}</div>
                        <div className="nurse-kpi-sub">≥1 nurse checked in</div>
                      </div>
                      <div className="nurse-kpi-card" style={{'--nk-color': missedDays > 0 ? '#ef4444' : '#9ca3af'}}>
                        <div className="nurse-kpi-label">Missed Days</div>
                        <div className="nurse-kpi-val" style={{color: missedDays > 0 ? '#ef4444' : '#9ca3af'}}>{missedDays}</div>
                        <div className="nurse-kpi-sub">No check-in recorded</div>
                      </div>
                    </div>
                  );
                })() : null}

                {/* Charts */}
                <div className="row-2col" style={{marginTop:'12px'}}>
                  <div className="card">
                    <div className="card-title">
                      Daily Attendance Trend
                      <DebugIcon onClick={setActiveDebugInfo} info={{
                        title: 'Nurse Daily Attendance',
                        sourceTable: 'nurseDutyChange',
                        appliedLogic: 'A day is counted as "Operational" if at least one nurse (any nurseId) has a record in nurseDutyChange for the selected lounge on that date. Each bar = number of nurses who checked in.',
                        formulas: ['Attendance % = (Check-In Days / Total Days) × 100'],
                      }} />
                    </div>
                    {nurseLoading.loungePerformance ? (
                      <div className="adm-chart-overlay" style={{position:'relative',height:'220px'}}>Loading nurse data…</div>
                    ) : !nurseLounge?.dailyTrend?.length ? (
                      <div className="adm-chart-overlay" style={{position:'relative',height:'220px'}}>No check-in data for selected period</div>
                    ) : (
                      <div className="chart-wrap chart-fill" style={{minHeight:'220px'}}>
                        <canvas ref={nurseTrendChartRef} role="img" aria-label="Nurse daily check-in trend" />
                      </div>
                    )}
                  </div>

                  <div className="card">
                    <div className="card-title">Monthly Attendance Summary</div>
                    {nurseLoading.loungePerformance ? (
                      <div className="adm-chart-overlay" style={{position:'relative',height:'220px'}}>Loading…</div>
                    ) : !nurseLounge?.monthlyTrend?.length ? (
                      <div className="adm-chart-overlay" style={{position:'relative',height:'220px'}}>No data available</div>
                    ) : (
                      <>
                        <div className="chart-wrap chart-fill" style={{minHeight:'190px'}}>
                          <canvas ref={nurseMonthlyChartRef} role="img" aria-label="Nurse monthly attendance chart" />
                        </div>
                        <div className="nurse-monthly-legend">
                          {nurseLounge.monthlyTrend.map(m => {
                            const color = m.pct >= 90 ? '#22c55e' : m.pct >= 70 ? '#f59e0b' : '#ef4444';
                            return (
                              <div key={`${m.year}-${m.month}`} className="nurse-mo-pill" style={{borderColor: color}}>
                                <span className="nurse-mo-name">{MONTH_SHORT[m.month - 1]} '{String(m.year).slice(2)}</span>
                                <span className="nurse-mo-pct" style={{color}}>{m.pct}%</span>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ROW 12: Nurse-wise Attendance Matrix */}
            {visibility.nurseMatrix !== false && (
              <div>
                <div className="section-label">Nurse-wise Attendance Matrix — {sectionLabel}</div>
                <div className="card">
                  <div className="card-title">
                    Individual Nurse Attendance Tracking
                    <DebugIcon onClick={setActiveDebugInfo} info={{
                      title: 'Nurse Attendance Matrix',
                      sourceTable: 'nurseDutyChange, staffMaster',
                      appliedLogic: 'Each cell shows whether a nurse (nurseId → staffMaster.name) had at least one check-in on that date for the selected lounge. Multiple check-ins on the same day count as one.',
                      formulas: ['Present % = (Present Days / Total Days in Range) × 100'],
                    }} />
                    {nurseMatrix?.nurses?.length > 0 && (
                      <span style={{marginLeft:'8px', fontSize:'11px', fontWeight:500, color:'var(--text-muted)'}}>
                        {nurseMatrix.nurses.length} nurse{nurseMatrix.nurses.length !== 1 ? 's' : ''} · {nurseMatrix.totalDays} days
                      </span>
                    )}
                  </div>

                  {nurseLoading.attendanceMatrix && (
                    <div className="adm-chart-overlay" style={{position:'relative',height:'180px'}}>Loading attendance matrix…</div>
                  )}
                  {!nurseLoading.attendanceMatrix && (!nurseMatrix?.nurses?.length) && (
                    <div className="adm-chart-overlay" style={{position:'relative',height:'180px'}}>No nurse check-in data for selected period</div>
                  )}
                  {!nurseLoading.attendanceMatrix && nurseMatrix?.nurses?.length > 0 && (() => {
                    const { dates, nurses, totalDays: matrixDays } = nurseMatrix;
                    const presentSet = (n) => new Set(n.presentDates);
                    return (
                      <div className="nm-wrap">
                        <div className="nm-scroll">
                          <table className="nm-table">
                            <thead>
                              <tr>
                                <th className="nm-th-name">Nurse</th>
                                <th className="nm-th-stat">Present</th>
                                <th className="nm-th-stat">Absent</th>
                                <th className="nm-th-stat">Att%</th>
                                {dates.map(d => {
                                  const dt = new Date(d + 'T12:00:00Z');
                                  return (
                                    <th key={d} className="nm-th-day" title={d}>
                                      <div>{dt.getUTCDate()}</div>
                                      <div className="nm-th-mo">{MONTH_SHORT[dt.getUTCMonth()]}</div>
                                    </th>
                                  );
                                })}
                              </tr>
                            </thead>
                            <tbody>
                              {nurses.map(nurse => {
                                const ps = presentSet(nurse);
                                const pctColor = nurse.pct >= 90 ? '#16a34a' : nurse.pct >= 70 ? '#d97706' : '#dc2626';
                                return (
                                  <tr key={nurse.nurseId} className="nm-row">
                                    <td className="nm-td-name">{nurse.name}</td>
                                    <td className="nm-td-stat nm-present-count">{nurse.presentCount}</td>
                                    <td className="nm-td-stat nm-absent-count">{nurse.absentCount}</td>
                                    <td className="nm-td-stat" style={{color: pctColor, fontWeight: 700}}>{nurse.pct}%</td>
                                    {dates.map(d => (
                                      <td key={d} className={`nm-cell ${ps.has(d) ? 'nm-present' : 'nm-absent'}`}
                                        title={ps.has(d) ? `${nurse.name} — Present on ${d}` : `${nurse.name} — Absent on ${d}`}
                                      >
                                        {ps.has(d) ? '✓' : '✕'}
                                      </td>
                                    ))}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <div className="nm-legend">
                          <span className="nm-leg-item nm-leg-present">✓ Present</span>
                          <span className="nm-leg-item nm-leg-absent">✕ Absent</span>
                          <span className="nm-leg-note">Min. 1 check-in = Present · {matrixDays} total days in range</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

          </>
        )}

        <div className="footer">
          Data source: iKMC Application &nbsp;·&nbsp; Last updated: 23 May 2025, 08:00 IST &nbsp;·&nbsp;
          Copyright &copy; 2026 - All rights reserved Community Empowerment Lab &nbsp;·&nbsp; For official use only
        </div>
      </div>

      <DebugModal 
        info={activeDebugInfo} 
        onClose={() => setActiveDebugInfo(null)} 
        filters={filtersState} 
      />
    </div>
  );
};

export default Dashboard;
