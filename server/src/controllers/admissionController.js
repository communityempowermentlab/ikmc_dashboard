const pool = require('../config/db');

// ── Shared helpers ──────────────────────────────────────────────────────────

function parseIds(raw) {
    return (raw || '').split(',').map(s => s.trim()).filter(Boolean);
}

function buildFacilityClause(facilityIds) {
    const conds  = ['lm.status = 1', 'lm.phase > 0'];
    const params = [];
    if (facilityIds.length) {
        const ph = facilityIds.map(() => '?').join(',');
        conds.push(`lm.facilityId IN (${ph})`);
        params.push(...facilityIds);
    }
    return { clause: conds.join(' AND '), params };
}

function buildLoungeClause(loungeIds) {
    if (!loungeIds.length) return null;
    const ph = loungeIds.map(() => '?').join(',');
    return { clause: `ba.loungeId IN (${ph})`, params: loungeIds };
}

function parseDateRange(query) {
    return {
        startDate: (query.startDate || '').trim(),
        endDate:   (query.endDate   || '').trim(),
    };
}

function buildDateRangeClause(alias, startDate, endDate) {
    return {
        clause: `DATE(${alias}.admissionDateTime) BETWEEN ? AND ?`,
        params: [startDate, endDate],
    };
}

function getPrecedingDateRange(startDate, endDate) {
    const start  = new Date(startDate + 'T00:00:00Z');
    const end    = new Date(endDate   + 'T00:00:00Z');
    const diffMs = end.getTime() - start.getTime() + 86400000;
    const prevEndMs   = start.getTime() - 86400000;
    const prevStartMs = prevEndMs - diffMs + 86400000;
    const fmt = (ms) => new Date(ms).toISOString().slice(0, 10);
    return { prevStartDate: fmt(prevStartMs), prevEndDate: fmt(prevEndMs) };
}

// ── Earliest check-in date ────────────────────────────────────────────────────
// GET /api/v1/admissions/earliest
// Returns the date of the very first nurseDutyChange (check-in) record in the DB
exports.getEarliestAdmissionDate = async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT DATE_FORMAT(MIN(DATE(addDate)), '%Y-%m-%d') AS earliest
             FROM nurseDutyChange WHERE addDate IS NOT NULL AND status = 1`
        );
        res.json({ earliest: rows[0].earliest });
    } catch (err) {
        console.error('Error in getEarliestAdmissionDate:', err);
        res.status(500).json({ error: 'Server error' });
    }
};

// ── KPI ──────────────────────────────────────────────────────────────────────
// GET /api/v1/admissions/kpi?facilityIds=228&startDate=2026-01-01&endDate=2026-05-26&loungeIds=222
exports.getAdmissionKpi = async (req, res) => {
    try {
        const { facilityIds: fParam, loungeIds: lParam } = req.query;
        const { startDate, endDate } = parseDateRange(req.query);
        if (!startDate || !endDate)
            return res.status(400).json({ error: 'startDate and endDate are required' });

        const facilityIds = parseIds(fParam);
        const loungeIds   = parseIds(lParam);
        const { prevStartDate, prevEndDate } = getPrecedingDateRange(startDate, endDate);

        const buildQuery = (sd, ed) => {
            const { clause: fClause, params: fParams } = buildFacilityClause(facilityIds);
            const { clause: dClause, params: dParams } = buildDateRangeClause('ba', sd, ed);
            let where = `${fClause} AND ba.status IN (1, 2) AND ${dClause}`;
            const p = [...fParams, ...dParams];
            const lClause = buildLoungeClause(loungeIds);
            if (lClause) { where += ` AND ${lClause.clause}`; p.push(...lClause.params); }
            return { where, p };
        };

        const curr = buildQuery(startDate, endDate);
        const prev = buildQuery(prevStartDate, prevEndDate);

        const [[currRows], [prevRows]] = await Promise.all([
            pool.query(`SELECT COUNT(*) AS count FROM babyAdmission ba JOIN loungeMaster lm ON ba.loungeId = lm.loungeId WHERE ${curr.where}`, curr.p),
            pool.query(`SELECT COUNT(*) AS count FROM babyAdmission ba JOIN loungeMaster lm ON ba.loungeId = lm.loungeId WHERE ${prev.where}`, prev.p),
        ]);

        const current  = parseInt(currRows[0].count);
        const previous = parseInt(prevRows[0].count);
        let percentChange = 0, direction = 'neutral';
        if (previous > 0) {
            percentChange = ((current - previous) / previous) * 100;
            direction = percentChange > 0 ? 'up' : percentChange < 0 ? 'down' : 'neutral';
        } else if (current > 0) {
            percentChange = 100; direction = 'up';
        }

        res.json({
            current, previous,
            percentChange: parseFloat(percentChange.toFixed(1)),
            direction,
            currentPeriod:  { startDate, endDate },
            previousPeriod: { startDate: prevStartDate, endDate: prevEndDate },
        });
    } catch (err) {
        console.error('Error in getAdmissionKpi:', err);
        res.status(500).json({ error: 'Server error fetching admission KPI' });
    }
};

// ── TREND ─────────────────────────────────────────────────────────────────────
// GET /api/v1/admissions/trend?facilityIds=228&startDate=...&endDate=...
exports.getAdmissionTrend = async (req, res) => {
    try {
        const { facilityIds: fParam, loungeIds: lParam } = req.query;
        const { startDate, endDate } = parseDateRange(req.query);
        if (!startDate || !endDate)
            return res.status(400).json({ error: 'startDate and endDate are required' });

        const facilityIds = parseIds(fParam);
        const loungeIds   = parseIds(lParam);

        const { clause: fClause, params: fParams } = buildFacilityClause(facilityIds);
        const { clause: dClause, params: dParams } = buildDateRangeClause('ba', startDate, endDate);
        let where = `${fClause} AND ba.status IN (1, 2) AND ${dClause}`;
        const params = [...fParams, ...dParams];
        const lClause = buildLoungeClause(loungeIds);
        if (lClause) { where += ` AND ${lClause.clause}`; params.push(...lClause.params); }

        const [rows] = await pool.query(
            `SELECT YEAR(ba.admissionDateTime) AS yr, MONTH(ba.admissionDateTime) AS mo, COUNT(*) AS count
             FROM babyAdmission ba JOIN loungeMaster lm ON ba.loungeId = lm.loungeId
             WHERE ${where}
             GROUP BY YEAR(ba.admissionDateTime), MONTH(ba.admissionDateTime)
             ORDER BY yr ASC, mo ASC`,
            params
        );

        res.json(rows.map(r => ({ year: r.yr, month: r.mo, count: parseInt(r.count) })));
    } catch (err) {
        console.error('Error in getAdmissionTrend:', err);
        res.status(500).json({ error: 'Server error fetching admission trend' });
    }
};

// ── COMPOSITION ───────────────────────────────────────────────────────────────
exports.getAdmissionComposition = async (req, res) => {
    try {
        const { facilityIds: fParam, loungeIds: lParam } = req.query;
        const { startDate, endDate } = parseDateRange(req.query);
        if (!startDate || !endDate)
            return res.status(400).json({ error: 'startDate and endDate are required' });

        const facilityIds = parseIds(fParam);
        const loungeIds   = parseIds(lParam);

        const { clause: fClause, params: fParams } = buildFacilityClause(facilityIds);
        const { clause: dClause, params: dParams } = buildDateRangeClause('ba', startDate, endDate);
        let where = `${fClause} AND ba.status IN (1, 2) AND ${dClause} AND ba.typeOfBorn IN ('Inborn','Outborn')`;
        const params = [...fParams, ...dParams];
        const lClause = buildLoungeClause(loungeIds);
        if (lClause) { where += ` AND ${lClause.clause}`; params.push(...lClause.params); }

        const [rows] = await pool.query(
            `SELECT ba.typeOfBorn, COUNT(*) AS count
             FROM babyAdmission ba JOIN loungeMaster lm ON ba.loungeId = lm.loungeId
             WHERE ${where} GROUP BY ba.typeOfBorn`,
            params
        );

        let inborn = 0, outborn = 0;
        for (const row of rows) {
            if (row.typeOfBorn === 'Inborn')  inborn  = parseInt(row.count);
            if (row.typeOfBorn === 'Outborn') outborn = parseInt(row.count);
        }
        res.json({ inborn, outborn, total: inborn + outborn });
    } catch (err) {
        console.error('Error in getAdmissionComposition:', err);
        res.status(500).json({ error: 'Server error fetching composition data' });
    }
};

// ── DISCHARGE OUTCOMES ───────────────────────────────────────────────────────
exports.getAdmissionDischarge = async (req, res) => {
    try {
        const { facilityIds: fParam, loungeIds: lParam } = req.query;
        const { startDate, endDate } = parseDateRange(req.query);
        if (!startDate || !endDate)
            return res.status(400).json({ error: 'startDate and endDate are required' });

        const facilityIds = parseIds(fParam);
        const loungeIds   = parseIds(lParam);

        const { clause: fClause, params: fParams } = buildFacilityClause(facilityIds);
        const { clause: dClause, params: dParams } = buildDateRangeClause('ba', startDate, endDate);
        let where = `${fClause} AND ba.status IN (1, 2) AND ${dClause}
                     AND ba.typeOfDischarge IS NOT NULL AND ba.typeOfDischarge != ''`;
        const params = [...fParams, ...dParams];
        const lClause = buildLoungeClause(loungeIds);
        if (lClause) { where += ` AND ${lClause.clause}`; params.push(...lClause.params); }

        const [rows] = await pool.query(
            `SELECT ba.typeOfDischarge, ba.typeOfBorn, COUNT(*) AS count
             FROM babyAdmission ba JOIN loungeMaster lm ON ba.loungeId = lm.loungeId
             WHERE ${where}
             GROUP BY ba.typeOfDischarge, ba.typeOfBorn ORDER BY ba.typeOfDischarge`,
            params
        );

        const catMap = {};
        for (const row of rows) {
            const key = row.typeOfDischarge;
            if (!catMap[key]) catMap[key] = { label: key, inborn: 0, outborn: 0, other: 0 };
            const n = parseInt(row.count);
            if (row.typeOfBorn === 'Inborn')       catMap[key].inborn  += n;
            else if (row.typeOfBorn === 'Outborn') catMap[key].outborn += n;
            else                                   catMap[key].other   += n;
        }

        const categories = Object.values(catMap)
            .map(c => ({ ...c, total: c.inborn + c.outborn + c.other }))
            .sort((a, b) => b.total - a.total);

        const totalDischarge = categories.reduce((s, c) => s + c.total, 0);
        categories.forEach(c => {
            c.pct = totalDischarge > 0 ? parseFloat(((c.total / totalDischarge) * 100).toFixed(1)) : 0;
        });

        const lamaRow = categories.find(c => c.label.toLowerCase() === 'lama');
        const diedRow = categories.find(c => c.label.toLowerCase() === 'died');

        res.json({
            categories, totalDischarge,
            lamaCount: lamaRow?.total || 0,
            lamaPct:   lamaRow ? parseFloat(((lamaRow.total / (totalDischarge || 1)) * 100).toFixed(1)) : 0,
            diedCount: diedRow?.total || 0,
            diedPct:   diedRow ? parseFloat(((diedRow.total / (totalDischarge || 1)) * 100).toFixed(1)) : 0,
        });
    } catch (err) {
        console.error('Error in getAdmissionDischarge:', err);
        res.status(500).json({ error: 'Server error fetching discharge data' });
    }
};

// ── BIRTH WEIGHT ──────────────────────────────────────────────────────────────
exports.getAdmissionBirthWeight = async (req, res) => {
    try {
        const { facilityIds: fParam, loungeIds: lParam } = req.query;
        const { startDate, endDate } = parseDateRange(req.query);
        if (!startDate || !endDate)
            return res.status(400).json({ error: 'startDate and endDate are required' });

        const facilityIds = parseIds(fParam);
        const loungeIds   = parseIds(lParam);

        const { clause: fClause, params: fParams } = buildFacilityClause(facilityIds);
        const { clause: dClause, params: dParams } = buildDateRangeClause('ba', startDate, endDate);
        let where = `${fClause} AND ba.status IN (1, 2) AND ${dClause}`;
        const params = [...fParams, ...dParams];
        const lClause = buildLoungeClause(loungeIds);
        if (lClause) { where += ` AND ${lClause.clause}`; params.push(...lClause.params); }

        const [rows] = await pool.query(
            `SELECT
                CASE
                  WHEN bdw.babyWeight IS NULL    THEN 'na'
                  WHEN bdw.babyWeight < 1800     THEN 'lt1800'
                  WHEN bdw.babyWeight < 2500     THEN 'btw1800_2499'
                  ELSE                                'gte2500'
                END AS category,
                COUNT(*) AS count
             FROM babyAdmission ba
             JOIN loungeMaster lm ON ba.loungeId = lm.loungeId
             LEFT JOIN babyDailyWeight bdw ON bdw.babyAdmissionId = ba.id AND bdw.weightType = 1
             WHERE ${where} GROUP BY category`,
            params
        );

        let lt1800 = 0, btw1800_2499 = 0, gte2500 = 0, na = 0;
        for (const row of rows) {
            const c = parseInt(row.count);
            if (row.category === 'lt1800')       lt1800       = c;
            if (row.category === 'btw1800_2499') btw1800_2499 = c;
            if (row.category === 'gte2500')      gte2500      = c;
            if (row.category === 'na')           na           = c;
        }
        res.json({ lt1800, btw1800_2499, gte2500, na, total: lt1800 + btw1800_2499 + gte2500 + na });
    } catch (err) {
        console.error('Error in getAdmissionBirthWeight:', err);
        res.status(500).json({ error: 'Server error fetching birth weight data' });
    }
};

// ── EARLY CARE KPI ────────────────────────────────────────────────────────────
exports.getEarlyCareKpi = async (req, res) => {
    try {
        const { facilityIds: fParam, loungeIds: lParam } = req.query;
        const { startDate, endDate } = parseDateRange(req.query);
        if (!startDate || !endDate)
            return res.status(400).json({ error: 'startDate and endDate are required' });

        const facilityIds = parseIds(fParam);
        const loungeIds   = parseIds(lParam);

        const { clause: fClause, params: fParams } = buildFacilityClause(facilityIds);
        const { clause: dClause, params: dParams } = buildDateRangeClause('ba', startDate, endDate);
        let where = `${fClause} AND ba.status IN (1, 2) AND ${dClause}
                     AND ba.typeOfBorn IN ('Inborn','Outborn')
                     AND br.kmcInitiated2Hour IN (11, 12)
                     AND br.breastfeedInitiated1Hour IN (11, 12)`;
        const params = [...fParams, ...dParams];
        const lClause = buildLoungeClause(loungeIds);
        if (lClause) { where += ` AND ${lClause.clause}`; params.push(...lClause.params); }

        const [rows] = await pool.query(
            `SELECT ba.typeOfBorn, br.kmcInitiated2Hour, br.breastfeedInitiated1Hour, COUNT(*) AS cnt
             FROM babyAdmission ba
             JOIN loungeMaster lm ON ba.loungeId = lm.loungeId
             JOIN babyRegistration br ON br.babyId = ba.babyId
             WHERE ${where}
             GROUP BY ba.typeOfBorn, br.kmcInitiated2Hour, br.breastfeedInitiated1Hour`,
            params
        );

        const kmc = { inbornYes: 0, inbornNo: 0, outbornYes: 0, outbornNo: 0 };
        const bf  = { inbornYes: 0, inbornNo: 0, outbornYes: 0, outbornNo: 0 };

        for (const row of rows) {
            const n = parseInt(row.cnt);
            const isInborn = row.typeOfBorn === 'Inborn';
            if (row.kmcInitiated2Hour === 11)        isInborn ? (kmc.inbornYes  += n) : (kmc.outbornYes  += n);
            else                                     isInborn ? (kmc.inbornNo   += n) : (kmc.outbornNo   += n);
            if (row.breastfeedInitiated1Hour === 11) isInborn ? (bf.inbornYes   += n) : (bf.outbornYes   += n);
            else                                     isInborn ? (bf.inbornNo    += n) : (bf.outbornNo    += n);
        }

        const pct = (yes, no) => {
            const t = yes + no;
            return t > 0 ? parseFloat(((yes / t) * 100).toFixed(1)) : 0;
        };
        const enrich = (obj) => ({
            ...obj,
            inbornTotal:  obj.inbornYes  + obj.inbornNo,
            outbornTotal: obj.outbornYes + obj.outbornNo,
            total:        obj.inbornYes  + obj.inbornNo + obj.outbornYes + obj.outbornNo,
            totalYes:     obj.inbornYes  + obj.outbornYes,
            totalNo:      obj.inbornNo   + obj.outbornNo,
            inbornPct:    pct(obj.inbornYes,  obj.inbornNo),
            outbornPct:   pct(obj.outbornYes, obj.outbornNo),
            overallPct:   pct(obj.inbornYes + obj.outbornYes, obj.inbornNo + obj.outbornNo),
        });

        res.json({ kmc: enrich(kmc), bf: enrich(bf) });
    } catch (err) {
        console.error('Error in getEarlyCareKpi:', err);
        res.status(500).json({ error: 'Server error fetching early care KPI' });
    }
};

// ── TRANSPORT KPI ─────────────────────────────────────────────────────────────
exports.getTransportKpi = async (req, res) => {
    try {
        const { facilityIds: fParam, loungeIds: lParam } = req.query;
        const { startDate, endDate } = parseDateRange(req.query);
        if (!startDate || !endDate)
            return res.status(400).json({ error: 'startDate and endDate are required' });

        const facilityIds = parseIds(fParam);
        const loungeIds   = parseIds(lParam);

        const { clause: fClause, params: fParams } = buildFacilityClause(facilityIds);
        const { clause: dClause, params: dParams } = buildDateRangeClause('ba', startDate, endDate);
        let where = `${fClause} AND ba.status IN (1, 2) AND ${dClause}
                     AND ba.babyTransferredCondition IN (11, 12)`;
        const params = [...fParams, ...dParams];
        const lClause = buildLoungeClause(loungeIds);
        if (lClause) { where += ` AND ${lClause.clause}`; params.push(...lClause.params); }

        const [rows] = await pool.query(
            `SELECT ba.typeOfBorn, ba.babyTransferredCondition, COUNT(*) AS count
             FROM babyAdmission ba JOIN loungeMaster lm ON ba.loungeId = lm.loungeId
             WHERE ${where}
             GROUP BY ba.typeOfBorn, ba.babyTransferredCondition`,
            params
        );

        let overallMother = 0, overallSurrogate = 0;
        let inbornMother  = 0, inbornSurrogate  = 0;

        for (const row of rows) {
            const n = parseInt(row.count);
            const isMother = parseInt(row.babyTransferredCondition) === 11;
            const isInborn = row.typeOfBorn === 'Inborn';
            if (isMother) { overallMother    += n; if (isInborn) inbornMother    += n; }
            else          { overallSurrogate  += n; if (isInborn) inbornSurrogate += n; }
        }

        const pct = (part, total) => total > 0 ? parseFloat(((part / total) * 100).toFixed(1)) : 0;
        const overallTotal = overallMother + overallSurrogate;
        const inbornTotal  = inbornMother  + inbornSurrogate;

        res.json({
            overall: {
                mother:    { count: overallMother,    pct: pct(overallMother,    overallTotal) },
                surrogate: { count: overallSurrogate, pct: pct(overallSurrogate, overallTotal) },
                total: overallTotal
            },
            inborn: {
                mother:    { count: inbornMother,    pct: pct(inbornMother,    inbornTotal) },
                surrogate: { count: inbornSurrogate, pct: pct(inbornSurrogate, inbornTotal) },
                total: inbornTotal
            }
        });
    } catch (err) {
        console.error('Error in getTransportKpi:', err);
        res.status(500).json({ error: 'Server error fetching transport KPI' });
    }
};

// ── KMC DURATION TREND ────────────────────────────────────────────────────────
exports.getKmcDurationTrend = async (req, res) => {
    try {
        const { facilityIds: fParam, loungeIds: lParam } = req.query;
        const { startDate, endDate } = parseDateRange(req.query);
        if (!startDate || !endDate)
            return res.status(400).json({ error: 'startDate and endDate are required' });

        const facilityIds = parseIds(fParam);
        const loungeIds   = parseIds(lParam);

        const { clause: fClause, params: fParams } = buildFacilityClause(facilityIds);
        let where = `${fClause} AND ba.status IN (1, 2) AND DATE(bdk.kmcDate) BETWEEN ? AND ?
                     AND (
                       (bdk.kmcDurationByMother IS NOT NULL AND bdk.kmcDurationByMother != '') OR
                       (bdk.kmcDurationByOther  IS NOT NULL AND bdk.kmcDurationByOther  != '')
                     )`;
        const params = [...fParams, startDate, endDate];
        const lClause = buildLoungeClause(loungeIds);
        if (lClause) { where += ` AND ${lClause.clause}`; params.push(...lClause.params); }

        const [rows] = await pool.query(
            `SELECT
               YEAR(bdk.kmcDate)  AS yr,
               MONTH(bdk.kmcDate) AS mo,
               COUNT(DISTINCT CONCAT(bdk.babyAdmissionId, '-', bdk.kmcDate)) AS babyDays,
               ROUND(SUM(
                 COALESCE(TIME_TO_SEC(CAST(bdk.kmcDurationByMother AS TIME)), 0) +
                 COALESCE(TIME_TO_SEC(CAST(bdk.kmcDurationByOther  AS TIME)), 0)
               ) / 3600, 2) AS totalKmcHours
             FROM babyDailyKMC bdk
             JOIN babyAdmission ba ON bdk.babyAdmissionId = ba.id
             JOIN loungeMaster  lm ON ba.loungeId = lm.loungeId
             WHERE ${where}
             GROUP BY yr, mo ORDER BY yr ASC, mo ASC`,
            params
        );

        res.json(rows.map(r => ({
            year:          r.yr,
            month:         r.mo,
            babyDays:      parseInt(r.babyDays),
            totalKmcHours: parseFloat(r.totalKmcHours),
            avgHours:      r.babyDays > 0
                ? parseFloat((r.totalKmcHours / r.babyDays).toFixed(2))
                : 0,
        })));
    } catch (err) {
        console.error('Error in getKmcDurationTrend:', err);
        res.status(500).json({ error: 'Server error fetching KMC duration trend' });
    }
};

// ── EXECUTIVE SUMMARY TABLE ───────────────────────────────────────────────────
// Groups by admission-month within the date range; months derived from actual data.
exports.getSummaryTable = async (req, res) => {
    try {
        const { facilityIds: fParam, loungeIds: lParam } = req.query;
        const { startDate, endDate } = parseDateRange(req.query);
        if (!startDate || !endDate)
            return res.status(400).json({ error: 'startDate and endDate are required' });

        const facilityIds = parseIds(fParam);
        const loungeIds   = parseIds(lParam);

        const { clause: fClause, params: fParams } = buildFacilityClause(facilityIds);
        const { clause: dClause, params: dParams } = buildDateRangeClause('ba', startDate, endDate);
        let baseWhere  = `${fClause} AND ba.status IN (1, 2) AND ${dClause}`;
        const basePrms = [...fParams, ...dParams];
        const lClause  = buildLoungeClause(loungeIds);
        if (lClause) { baseWhere += ` AND ${lClause.clause}`; basePrms.push(...lClause.params); }

        const q1 = pool.query(
            `SELECT
               CONCAT(YEAR(ba.admissionDateTime), '-', LPAD(MONTH(ba.admissionDateTime), 2, '0')) AS mKey,
               COUNT(*) AS admCount,
               SUM(CASE WHEN bdw.babyWeight IS NOT NULL AND bdw.babyWeight < 1800 THEN 1 ELSE 0 END) AS bwLt1800,
               SUM(CASE WHEN ba.typeOfDischarge IS NOT NULL AND ba.typeOfDischarge != '' THEN 1 ELSE 0 END) AS dcCount
             FROM babyAdmission ba
             JOIN loungeMaster lm ON ba.loungeId = lm.loungeId
             LEFT JOIN babyDailyWeight bdw ON bdw.babyAdmissionId = ba.id AND bdw.weightType = 1
             WHERE ${baseWhere}
             GROUP BY mKey ORDER BY mKey`,
            basePrms
        );

        const q2Where = baseWhere +
            ` AND ba.typeOfBorn IN ('Inborn','Outborn')
              AND br.kmcInitiated2Hour IN (11, 12)
              AND br.breastfeedInitiated1Hour IN (11, 12)`;
        const q2 = pool.query(
            `SELECT
               CONCAT(YEAR(ba.admissionDateTime), '-', LPAD(MONTH(ba.admissionDateTime), 2, '0')) AS mKey,
               SUM(CASE WHEN br.kmcInitiated2Hour        = 11 THEN 1 ELSE 0 END) AS sscYes,
               SUM(CASE WHEN br.breastfeedInitiated1Hour = 11 THEN 1 ELSE 0 END) AS bfYes,
               COUNT(*) AS ecTotal
             FROM babyAdmission ba
             JOIN loungeMaster lm ON ba.loungeId = lm.loungeId
             JOIN babyRegistration br ON br.babyId = ba.babyId
             WHERE ${q2Where}
             GROUP BY mKey ORDER BY mKey`,
            basePrms
        );

        const { clause: fClause3, params: fParams3 } = buildFacilityClause(facilityIds);
        let kmcWhere = `${fClause3} AND ba.status IN (1, 2) AND DATE(bdk.kmcDate) BETWEEN ? AND ?
                        AND ((bdk.kmcDurationByMother IS NOT NULL AND bdk.kmcDurationByMother != '')
                          OR (bdk.kmcDurationByOther  IS NOT NULL AND bdk.kmcDurationByOther  != ''))`;
        const kmcPrms = [...fParams3, startDate, endDate];
        if (lClause) { kmcWhere += ` AND ${lClause.clause}`; kmcPrms.push(...lClause.params); }
        const q3 = pool.query(
            `SELECT
               CONCAT(YEAR(bdk.kmcDate), '-', LPAD(MONTH(bdk.kmcDate), 2, '0')) AS mKey,
               COUNT(DISTINCT CONCAT(bdk.babyAdmissionId, '-', bdk.kmcDate)) AS babyDays,
               ROUND(SUM(
                 COALESCE(TIME_TO_SEC(CAST(bdk.kmcDurationByMother AS TIME)), 0) +
                 COALESCE(TIME_TO_SEC(CAST(bdk.kmcDurationByOther  AS TIME)), 0)
               ) / 3600, 2) AS totalKmcHrs
             FROM babyDailyKMC bdk
             JOIN babyAdmission ba ON bdk.babyAdmissionId = ba.id
             JOIN loungeMaster  lm ON ba.loungeId = lm.loungeId
             WHERE ${kmcWhere}
             GROUP BY mKey ORDER BY mKey`,
            kmcPrms
        );

        const q4Where = baseWhere + ` AND ba.babyTransferredCondition IN (11, 12)`;
        const q4 = pool.query(
            `SELECT
               CONCAT(YEAR(ba.admissionDateTime), '-', LPAD(MONTH(ba.admissionDateTime), 2, '0')) AS mKey,
               SUM(CASE WHEN ba.babyTransferredCondition = 11 THEN 1 ELSE 0 END) AS motherCnt,
               SUM(CASE WHEN ba.babyTransferredCondition = 12 THEN 1 ELSE 0 END) AS surrogateCnt,
               COUNT(*) AS tpTotal
             FROM babyAdmission ba JOIN loungeMaster lm ON ba.loungeId = lm.loungeId
             WHERE ${q4Where}
             GROUP BY mKey ORDER BY mKey`,
            basePrms
        );

        const [[q1Rows], [q2Rows], [q3Rows], [q4Rows]] = await Promise.all([q1, q2, q3, q4]);

        const pct = (n, d) => d > 0 ? parseFloat(((n / d) * 100).toFixed(1)) : 0;
        const months = q1Rows.map(r => r.mKey).sort();

        const admMap = {}, bwMap = {}, dcMap = {};
        for (const r of q1Rows) {
            admMap[r.mKey] = parseInt(r.admCount);
            bwMap[r.mKey]  = parseInt(r.bwLt1800);
            dcMap[r.mKey]  = parseInt(r.dcCount);
        }

        const sscMap = {}, bfMap = {};
        for (const r of q2Rows) {
            const tot = parseInt(r.ecTotal);
            const sy  = parseInt(r.sscYes);
            const by  = parseInt(r.bfYes);
            sscMap[r.mKey] = { yes: sy, total: tot, pct: pct(sy, tot) };
            bfMap[r.mKey]  = { yes: by, total: tot, pct: pct(by, tot) };
        }

        const kmcMap = {};
        for (const r of q3Rows) {
            const bd = parseInt(r.babyDays);
            const th = parseFloat(r.totalKmcHrs);
            kmcMap[r.mKey] = { babyDays: bd, totalHrs: th, avg: bd > 0 ? parseFloat((th / bd).toFixed(2)) : 0 };
        }

        const tmMap = {}, tsMap = {};
        for (const r of q4Rows) {
            const mc = parseInt(r.motherCnt);
            const sc = parseInt(r.surrogateCnt);
            const tt = parseInt(r.tpTotal);
            tmMap[r.mKey] = { count: mc, total: tt, pct: pct(mc, tt) };
            tsMap[r.mKey] = { count: sc, total: tt, pct: pct(sc, tt) };
        }

        res.json({
            months,
            admissions:        admMap,
            bwLt1800:          bwMap,
            ssc2h:             sscMap,
            bf1h:              bfMap,
            avgKmc:            kmcMap,
            kmcTransMother:    tmMap,
            kmcTransSurrogate: tsMap,
            discharges:        dcMap,
        });
    } catch (err) {
        console.error('Error in getSummaryTable:', err);
        res.status(500).json({ error: 'Server error fetching summary table' });
    }
};

// ── GENDER COMPOSITION ────────────────────────────────────────────────────────
exports.getGenderComposition = async (req, res) => {
    try {
        const { facilityIds: fParam, loungeIds: lParam } = req.query;
        const { startDate, endDate } = parseDateRange(req.query);
        if (!startDate || !endDate)
            return res.status(400).json({ error: 'startDate and endDate are required' });

        const facilityIds = parseIds(fParam);
        const loungeIds   = parseIds(lParam);

        const { clause: fClause, params: fParams } = buildFacilityClause(facilityIds);
        const { clause: dClause, params: dParams } = buildDateRangeClause('ba', startDate, endDate);
        let where = `${fClause} AND ba.status IN (1, 2) AND ${dClause}
                     AND br.babyGender IN ('Male', 'Female')
                     AND ba.typeOfBorn IN ('Inborn', 'Outborn')`;
        const params = [...fParams, ...dParams];
        const lClause = buildLoungeClause(loungeIds);
        if (lClause) { where += ` AND ${lClause.clause}`; params.push(...lClause.params); }

        const [rows] = await pool.query(
            `SELECT br.babyGender, ba.typeOfBorn, COUNT(*) AS count
             FROM babyAdmission ba
             JOIN loungeMaster   lm ON ba.loungeId = lm.loungeId
             JOIN babyRegistration br ON br.babyId  = ba.babyId
             WHERE ${where}
             GROUP BY br.babyGender, ba.typeOfBorn`,
            params
        );

        const acc = {
            male:   { inborn: 0, outborn: 0 },
            female: { inborn: 0, outborn: 0 },
        };
        for (const row of rows) {
            const key     = row.babyGender === 'Male' ? 'male' : 'female';
            const bornKey = row.typeOfBorn === 'Inborn' ? 'inborn' : 'outborn';
            acc[key][bornKey] = parseInt(row.count);
        }

        const pct = (part, total) => total > 0 ? parseFloat(((part / total) * 100).toFixed(1)) : 0;
        const maleTotal   = acc.male.inborn   + acc.male.outborn;
        const femaleTotal = acc.female.inborn + acc.female.outborn;
        const grandTotal  = maleTotal + femaleTotal;

        res.json({
            male:   { ...acc.male,   total: maleTotal,   pct: pct(maleTotal,   grandTotal) },
            female: { ...acc.female, total: femaleTotal,  pct: pct(femaleTotal, grandTotal) },
            total: grandTotal,
        });
    } catch (err) {
        console.error('Error in getGenderComposition:', err);
        res.status(500).json({ error: 'Server error fetching gender composition' });
    }
};

// ── STAY DURATION ANALYTICS ───────────────────────────────────────────────────
// GET /api/v1/admissions/stayDuration?facilityIds=228&startDate=...&endDate=...&loungeIds=222
// Null dateOfDischarge → uses NOW() as proxy (active admission).
// Negative durations are excluded (data integrity guard).
exports.getStayDuration = async (req, res) => {
    try {
        const { facilityIds: fParam, loungeIds: lParam } = req.query;
        const { startDate, endDate } = parseDateRange(req.query);
        if (!startDate || !endDate)
            return res.status(400).json({ error: 'startDate and endDate are required' });

        const facilityIds = parseIds(fParam);
        const loungeIds   = parseIds(lParam);

        const { clause: fClause, params: fParams } = buildFacilityClause(facilityIds);
        const { clause: dClause, params: dParams } = buildDateRangeClause('ba', startDate, endDate);
        let where = `${fClause} AND ba.status IN (1, 2) AND ${dClause}
                     AND ba.admissionDateTime IS NOT NULL`;
        const params = [...fParams, ...dParams];
        const lClause = buildLoungeClause(loungeIds);
        if (lClause) { where += ` AND ${lClause.clause}`; params.push(...lClause.params); }

        const [rows] = await pool.query(
            `SELECT
               CASE
                 WHEN stay_hours <= 24 THEN 'h0_24'
                 WHEN stay_hours <= 48 THEN 'h24_48'
                 WHEN stay_hours <= 72 THEN 'h48_72'
                 ELSE                       'h72plus'
               END AS category,
               COUNT(*) AS count
             FROM (
               SELECT TIMESTAMPDIFF(HOUR, ba.admissionDateTime,
                        COALESCE(ba.dateOfDischarge, NOW())) AS stay_hours
               FROM babyAdmission ba
               JOIN loungeMaster lm ON ba.loungeId = lm.loungeId
               WHERE ${where}
                 AND TIMESTAMPDIFF(HOUR, ba.admissionDateTime,
                       COALESCE(ba.dateOfDischarge, NOW())) >= 0
             ) t
             GROUP BY category`,
            params
        );

        const acc = { h0_24: 0, h24_48: 0, h48_72: 0, h72plus: 0 };
        for (const r of rows) {
            if (acc[r.category] !== undefined) acc[r.category] = parseInt(r.count);
        }
        const total = Object.values(acc).reduce((s, v) => s + v, 0);
        const pct   = (n) => total > 0 ? parseFloat(((n / total) * 100).toFixed(1)) : 0;

        res.json({
            categories: [
                { key: 'h0_24',   label: '0 – 24 Hours',      count: acc.h0_24,   pct: pct(acc.h0_24)   },
                { key: 'h24_48',  label: '24 – 48 Hours',      count: acc.h24_48,  pct: pct(acc.h24_48)  },
                { key: 'h48_72',  label: '48 – 72 Hours',      count: acc.h48_72,  pct: pct(acc.h48_72)  },
                { key: 'h72plus', label: 'More than 72 Hours', count: acc.h72plus, pct: pct(acc.h72plus) },
            ],
            total,
        });
    } catch (err) {
        console.error('Error in getStayDuration:', err);
        res.status(500).json({ error: 'Server error fetching stay duration' });
    }
};

// ── WEIGHT STABILITY ANALYTICS ────────────────────────────────────────────────
// GET /api/v1/admissions/weightStability?facilityIds=&startDate=&endDate=&loungeIds=
// Compares birth weight (weightType=1) vs discharge weight (weightType=4) per admission.
// Returns Gain (diff>0), Stable (diff=0), Loss (diff<0) — only babies with both weights.
exports.getWeightStability = async (req, res) => {
    try {
        const { facilityIds: fParam, loungeIds: lParam } = req.query;
        const { startDate, endDate } = parseDateRange(req.query);
        if (!startDate || !endDate)
            return res.status(400).json({ error: 'startDate and endDate are required' });

        const facilityIds = parseIds(fParam);
        const loungeIds   = parseIds(lParam);

        const { clause: fClause, params: fParams } = buildFacilityClause(facilityIds);
        const { clause: dClause, params: dParams } = buildDateRangeClause('ba', startDate, endDate);
        let where = `${fClause} AND ba.status IN (1, 2) AND ${dClause}`;
        const params = [...fParams, ...dParams];
        const lClause = buildLoungeClause(loungeIds);
        if (lClause) { where += ` AND ${lClause.clause}`; params.push(...lClause.params); }

        // Total admissions in range (denominator for coverage)
        const [totalRows] = await pool.query(
            `SELECT COUNT(*) AS total
             FROM babyAdmission ba JOIN loungeMaster lm ON ba.loungeId = lm.loungeId
             WHERE ${where}`,
            params
        );
        const totalAdmissions = parseInt(totalRows[0].total);

        // Weight stability: join birth weight (type=1) and discharge weight (type=4)
        const [rows] = await pool.query(
            `SELECT
               CASE
                 WHEN discharge_wt > birth_wt THEN 'gain'
                 WHEN discharge_wt < birth_wt THEN 'loss'
                 ELSE                               'stable'
               END AS category,
               COUNT(*) AS count
             FROM (
               SELECT
                 ba.id,
                 (SELECT bdw1.babyWeight FROM babyDailyWeight bdw1
                  WHERE bdw1.babyAdmissionId = ba.id AND bdw1.weightType = 1
                  ORDER BY bdw1.id LIMIT 1)                     AS birth_wt,
                 (SELECT bdw4.babyWeight FROM babyDailyWeight bdw4
                  WHERE bdw4.babyAdmissionId = ba.id AND bdw4.weightType = 4
                  ORDER BY bdw4.id DESC LIMIT 1)                AS discharge_wt
               FROM babyAdmission ba
               JOIN loungeMaster lm ON ba.loungeId = lm.loungeId
               WHERE ${where}
             ) t
             WHERE birth_wt IS NOT NULL AND discharge_wt IS NOT NULL
             GROUP BY category`,
            [...params]
        );

        const acc = { gain: 0, stable: 0, loss: 0 };
        for (const r of rows) {
            if (acc[r.category] !== undefined) acc[r.category] = parseInt(r.count);
        }
        const totalWithData = acc.gain + acc.stable + acc.loss;
        const pct = (n) => totalWithData > 0 ? parseFloat(((n / totalWithData) * 100).toFixed(1)) : 0;

        res.json({
            categories: [
                { key: 'gain',   label: 'Weight Gain',   count: acc.gain,   pct: pct(acc.gain)   },
                { key: 'stable', label: 'Weight Stable', count: acc.stable, pct: pct(acc.stable) },
                { key: 'loss',   label: 'Weight Loss',   count: acc.loss,   pct: pct(acc.loss)   },
            ],
            totalWithData,
            totalAdmissions,
            coverage: totalAdmissions > 0
                ? parseFloat(((totalWithData / totalAdmissions) * 100).toFixed(1))
                : 0,
        });
    } catch (err) {
        console.error('Error in getWeightStability:', err);
        res.status(500).json({ error: 'Server error fetching weight stability' });
    }
};

// ── BREASTFEEDING ANALYTICS ───────────────────────────────────────────────────
// GET /api/v1/admissions/breastfeeding?facilityIds=&startDate=&endDate=&loungeIds=
// Classifies each baby as Exclusive (only methods 1 or 2 across all records),
// Non-Exclusive (any other method found), or No Data (no nutrition records).
// breastFeedMethod stored as JSON array string e.g. ["2"] or ["6","2","4"]
exports.getBreastfeeding = async (req, res) => {
    try {
        const { facilityIds: fParam, loungeIds: lParam } = req.query;
        const { startDate, endDate } = parseDateRange(req.query);
        if (!startDate || !endDate)
            return res.status(400).json({ error: 'startDate and endDate are required' });

        const facilityIds = parseIds(fParam);
        const loungeIds   = parseIds(lParam);

        const { clause: fClause, params: fParams } = buildFacilityClause(facilityIds);
        const { clause: dClause, params: dParams } = buildDateRangeClause('ba', startDate, endDate);
        let where = `${fClause} AND ba.status IN (1, 2) AND ${dClause}`;
        const params = [...fParams, ...dParams];
        const lClause = buildLoungeClause(loungeIds);
        if (lClause) { where += ` AND ${lClause.clause}`; params.push(...lClause.params); }

        // Classify each baby:
        //   non_exclusive: any nutrition record has a method NOT in ("1","2")
        //   exclusive:     has records, all methods are only 1 or 2
        //   no_data:       no nutrition records with valid breastFeedMethod
        const [rows] = await pool.query(
            `SELECT
               CASE
                 WHEN non_excl_count > 0 THEN 'non_exclusive'
                 WHEN record_count   > 0 THEN 'exclusive'
                 ELSE                         'no_data'
               END AS category,
               COUNT(*) AS count
             FROM (
               SELECT
                 ba.id,
                 COUNT(bdn.id) AS record_count,
                 SUM(
                   CASE
                     WHEN bdn.breastFeedMethod IS NULL
                       OR bdn.breastFeedMethod IN ('null', '[]', '') THEN 0
                     WHEN JSON_OVERLAPS(
                       bdn.breastFeedMethod,
                       '["3","4","5","6","7","8","9","10","11","12","13","14","15"]'
                     ) THEN 1
                     ELSE 0
                   END
                 ) AS non_excl_count
               FROM babyAdmission ba
               JOIN loungeMaster lm ON ba.loungeId = lm.loungeId
               LEFT JOIN babyDailyNutrition bdn ON bdn.babyAdmissionId = ba.id
               WHERE ${where}
               GROUP BY ba.id
             ) t
             GROUP BY category`,
            params
        );

        const acc = { exclusive: 0, non_exclusive: 0, no_data: 0 };
        for (const r of rows) {
            if (acc[r.category] !== undefined) acc[r.category] = parseInt(r.count);
        }
        const totalAdmissions  = acc.exclusive + acc.non_exclusive + acc.no_data;
        const totalWithData    = acc.exclusive + acc.non_exclusive;
        const pctOf = (n, d) => d > 0 ? parseFloat(((n / d) * 100).toFixed(1)) : 0;

        res.json({
            categories: [
                { key: 'exclusive',     label: 'Exclusive BF',     count: acc.exclusive,     pct: pctOf(acc.exclusive,     totalWithData) },
                { key: 'non_exclusive', label: 'Non-Exclusive BF', count: acc.non_exclusive, pct: pctOf(acc.non_exclusive, totalWithData) },
                { key: 'no_data',       label: 'No Data',          count: acc.no_data,       pct: pctOf(acc.no_data,       totalAdmissions) },
            ],
            totalAdmissions,
            totalWithData,
            exclusivePct: pctOf(acc.exclusive, totalWithData),
        });
    } catch (err) {
        console.error('Error in getBreastfeeding:', err);
        res.status(500).json({ error: 'Server error fetching breastfeeding data' });
    }
};


// POST /api/v1/admissions/generateInsights
// Sends dashboard KPI summary to Gemini and returns Hindi insights
exports.generateInsights = async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your_google_gemini_api_key_here') {
      return res.status(503).json({ error: 'GEMINI_API_KEY not configured in .env' });
    }

    const { kpi, composition, discharge, birthWeight, earlyCare, stayDuration, period } = req.body;

    const prompt = `
आप एक iKMC (Kangaroo Mother Care) कार्यक्रम के स्वास्थ्य डेटा विश्लेषक हैं।

नीचे दिए गए डैशबोर्ड डेटा के आधार पर 6 महत्वपूर्ण अंतर्दृष्टि (insights) सरल हिंदी में तैयार करें।

समयावधि: ${period?.start || 'N/A'} से ${period?.end || 'N/A'}

भर्ती KPI:
- वर्तमान अवधि में बच्चे: ${kpi?.current ?? 'N/A'}
- पिछली अवधि में बच्चे: ${kpi?.previous ?? 'N/A'}
- परिवर्तन: ${kpi?.direction === 'up' ? '+' : '-'}${kpi?.percentChange ?? 0}%

बच्चों की संरचना:
- अस्पताल में जन्मे (Inborn): ${composition?.inborn ?? 0}
- बाहर से भेजे गए (Outborn): ${composition?.outborn ?? 0}
- कुल: ${composition?.total ?? 0}

छुट्टी परिणाम:
- सामान्य छुट्टी: ${discharge?.categories?.find(c => c.label?.toLowerCase().includes('normal'))?.pct ?? 0}%
- मृत्यु दर: ${discharge?.diedPct ?? 0}% (${discharge?.diedCount ?? 0} बच्चे)
- LAMA दर: ${discharge?.lamaPct ?? 0}% (${discharge?.lamaCount ?? 0} बच्चे)
- कुल छुट्टी: ${discharge?.totalDischarge ?? 0}

जन्म भार:
- VLBW (<1800g): ${birthWeight?.lt1800 ?? 0} बच्चे
- LBW (1800-2499g): ${birthWeight?.btw1800_2499 ?? 0} बच्चे
- सामान्य (≥2500g): ${birthWeight?.gte2500 ?? 0} बच्चे
- कुल: ${birthWeight?.total ?? 0}

प्रारंभिक देखभाल:
- KMC शुरुआत: ${earlyCare?.kmc?.overallPct ?? 0}% (Inborn: ${earlyCare?.kmc?.inbornPct ?? 0}%, Outborn: ${earlyCare?.kmc?.outbornPct ?? 0}%)
- स्तनपान शुरुआत: ${earlyCare?.bf?.overallPct ?? 0}% (Inborn: ${earlyCare?.bf?.inbornPct ?? 0}%, Outborn: ${earlyCare?.bf?.outbornPct ?? 0}%)

रहने की अवधि:
${(stayDuration?.categories || []).map(c => `- ${c.label}: ${c.count} बच्चे (${c.pct}%)`).join('\n')}

निर्देश:
- बिल्कुल 6 अंतर्दृष्टि दें।
- सरल, स्पष्ट हिंदी में लिखें जो स्वास्थ्य कर्मी आसानी से समझ सकें।
- संख्याओं का उपयोग करें जहाँ जरूरी हो।
- अच्छे प्रदर्शन की सराहना और सुधार के क्षेत्र दोनों शामिल करें।

केवल यह JSON array लौटाएं, कोई अन्य टेक्स्ट नहीं:
[
  {"type": "positive", "text": "हिंदी में अंतर्दृष्टि..."},
  {"type": "warning",  "text": "हिंदी में अंतर्दृष्टि..."},
  {"type": "critical", "text": "हिंदी में अंतर्दृष्टि..."},
  {"type": "info",     "text": "हिंदी में अंतर्दृष्टि..."},
  {"type": "positive", "text": "हिंदी में अंतर्दृष्टि..."},
  {"type": "info",     "text": "हिंदी में अंतर्दृष्टि..."}
]

type के मान: "positive" (अच्छा), "warning" (ध्यान दें), "critical" (गंभीर), "info" (जानकारी)
`;

    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const result = await model.generateContent(prompt);
    const raw    = result.response.text().trim();

    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('Gemini response did not contain a JSON array');

    const insights = JSON.parse(jsonMatch[0]);
    res.json({ insights });

  } catch (err) {
    console.error('generateInsights (dashboard) error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to generate insights' });
  }
};
