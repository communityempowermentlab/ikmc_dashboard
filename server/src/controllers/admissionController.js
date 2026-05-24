const pool = require('../config/db');

// ── Shared helpers ──────────────────────────────────────────────────────────

/** Parse "2026-01,2026-02" → ["2026-01","2026-02"] */
function parseMonths(raw) {
    return (raw || '').split(',').map(s => s.trim()).filter(Boolean);
}

/** Parse "228,229" → ["228","229"] */
function parseIds(raw) {
    return (raw || '').split(',').map(s => s.trim()).filter(Boolean);
}

/** Build CONCAT(YEAR…MONTH…) IN (?,?…) clause */
function buildMonthClause(months, tableAlias = 'ba') {
    const placeholders = months.map(() => '?').join(',');
    return {
        clause: `CONCAT(YEAR(${tableAlias}.admissionDateTime), '-', LPAD(MONTH(${tableAlias}.admissionDateTime), 2, '0')) IN (${placeholders})`,
        params: months
    };
}

/** Build lm.facilityId IN (?,?…) clause */
function buildFacilityClause(facilityIds) {
    const ph = facilityIds.map(() => '?').join(',');
    return { clause: `lm.facilityId IN (${ph})`, params: facilityIds };
}

/** Build ba.loungeId IN (?,?…) clause — returns null when empty */
function buildLoungeClause(loungeIds) {
    if (!loungeIds.length) return null;
    const ph = loungeIds.map(() => '?').join(',');
    return { clause: `ba.loungeId IN (${ph})`, params: loungeIds };
}

/**
 * Given N selected months (sorted), return the N months immediately before.
 * E.g. ["2026-01","2026-02"] → ["2025-11","2025-12"]
 */
function getPrecedingMonths(months) {
    const sorted = [...months].sort();
    const [yr, mo] = sorted[0].split('-').map(Number);
    const n = sorted.length;
    const preceding = [];
    for (let i = n; i >= 1; i--) {
        let m = mo - i;
        let y = yr;
        while (m < 1) { m += 12; y--; }
        preceding.push(`${y}-${String(m).padStart(2, '0')}`);
    }
    return preceding;
}

// ── KPI ──────────────────────────────────────────────────────────────────────
// GET /api/v1/admissions/kpi?facilityIds=228&months=2026-05&loungeIds=222
exports.getAdmissionKpi = async (req, res) => {
    try {
        const { facilityIds: fParam, months: mParam, loungeIds: lParam } = req.query;
        if (!fParam || !mParam) return res.status(400).json({ error: 'facilityIds and months are required' });

        const facilityIds  = parseIds(fParam);
        const months       = parseMonths(mParam);
        const loungeIds    = parseIds(lParam);
        const prevMonths   = getPrecedingMonths(months);

        const buildQuery = (mths) => {
            const { clause: fClause, params: fParams } = buildFacilityClause(facilityIds);
            const { clause: mClause, params: mParams } = buildMonthClause(mths);
            let where = `${fClause} AND ba.status IN (1, 2) AND ${mClause}`;
            const p = [...fParams, ...mParams];
            const lClause = buildLoungeClause(loungeIds);
            if (lClause) { where += ` AND ${lClause.clause}`; p.push(...lClause.params); }
            return { where, p };
        };

        const curr = buildQuery(months);
        const prev = buildQuery(prevMonths);

        const [[currRows], [prevRows]] = await Promise.all([
            pool.query(`SELECT COUNT(*) AS count FROM babyAdmission ba JOIN loungeMaster lm ON ba.loungeId = lm.loungeId WHERE ${curr.where}`, curr.p),
            pool.query(`SELECT COUNT(*) AS count FROM babyAdmission ba JOIN loungeMaster lm ON ba.loungeId = lm.loungeId WHERE ${prev.where}`, prev.p)
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
            currentPeriods: months,
            previousPeriods: prevMonths
        });
    } catch (err) {
        console.error('Error in getAdmissionKpi:', err);
        res.status(500).json({ error: 'Server error fetching admission KPI' });
    }
};

// ── TREND ─────────────────────────────────────────────────────────────────────
// GET /api/v1/admissions/trend?facilityIds=228&months=2026-01,2026-02&loungeIds=222
exports.getAdmissionTrend = async (req, res) => {
    try {
        const { facilityIds: fParam, months: mParam, loungeIds: lParam } = req.query;
        if (!fParam || !mParam) return res.status(400).json({ error: 'facilityIds and months are required' });

        const facilityIds = parseIds(fParam);
        const months      = parseMonths(mParam);
        const loungeIds   = parseIds(lParam);

        const { clause: fClause, params: fParams } = buildFacilityClause(facilityIds);
        const { clause: mClause, params: mParams } = buildMonthClause(months);
        let where = `${fClause} AND ba.status IN (1, 2) AND ${mClause}`;
        const params = [...fParams, ...mParams];
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
// GET /api/v1/admissions/composition?facilityIds=228&months=2026-05&loungeIds=222
exports.getAdmissionComposition = async (req, res) => {
    try {
        const { facilityIds: fParam, months: mParam, loungeIds: lParam } = req.query;
        if (!fParam || !mParam) return res.status(400).json({ error: 'facilityIds and months are required' });

        const facilityIds = parseIds(fParam);
        const months      = parseMonths(mParam);
        const loungeIds   = parseIds(lParam);

        const { clause: fClause, params: fParams } = buildFacilityClause(facilityIds);
        const { clause: mClause, params: mParams } = buildMonthClause(months);
        let where = `${fClause} AND ba.status IN (1, 2) AND ${mClause} AND ba.typeOfBorn IN ('Inborn','Outborn')`;
        const params = [...fParams, ...mParams];
        const lClause = buildLoungeClause(loungeIds);
        if (lClause) { where += ` AND ${lClause.clause}`; params.push(...lClause.params); }

        const [rows] = await pool.query(
            `SELECT ba.typeOfBorn, COUNT(*) AS count
             FROM babyAdmission ba JOIN loungeMaster lm ON ba.loungeId = lm.loungeId
             WHERE ${where}
             GROUP BY ba.typeOfBorn`,
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
// GET /api/v1/admissions/discharge?facilityIds=228&months=2026-01&loungeIds=222
// Returns each discharge category split by Inborn/Outborn, plus total + LAMA/Died KPIs.
exports.getAdmissionDischarge = async (req, res) => {
    try {
        const { facilityIds: fParam, months: mParam, loungeIds: lParam } = req.query;
        if (!fParam || !mParam) return res.status(400).json({ error: 'facilityIds and months are required' });

        const facilityIds = parseIds(fParam);
        const months      = parseMonths(mParam);
        const loungeIds   = parseIds(lParam);

        const { clause: fClause, params: fParams } = buildFacilityClause(facilityIds);
        const { clause: mClause, params: mParams } = buildMonthClause(months);
        let where = `${fClause} AND ba.status IN (1, 2) AND ${mClause}
                     AND ba.typeOfDischarge IS NOT NULL AND ba.typeOfDischarge != ''`;
        const params = [...fParams, ...mParams];
        const lClause = buildLoungeClause(loungeIds);
        if (lClause) { where += ` AND ${lClause.clause}`; params.push(...lClause.params); }

        const [rows] = await pool.query(
            `SELECT ba.typeOfDischarge, ba.typeOfBorn, COUNT(*) AS count
             FROM babyAdmission ba
             JOIN loungeMaster lm ON ba.loungeId = lm.loungeId
             WHERE ${where}
             GROUP BY ba.typeOfDischarge, ba.typeOfBorn
             ORDER BY ba.typeOfDischarge`,
            params
        );

        // Aggregate into category map
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
            categories,
            totalDischarge,
            lamaCount: lamaRow?.total  || 0,
            lamaPct:   lamaRow ? parseFloat(((lamaRow.total  / (totalDischarge || 1)) * 100).toFixed(1)) : 0,
            diedCount: diedRow?.total  || 0,
            diedPct:   diedRow ? parseFloat(((diedRow.total  / (totalDischarge || 1)) * 100).toFixed(1)) : 0,
        });
    } catch (err) {
        console.error('Error in getAdmissionDischarge:', err);
        res.status(500).json({ error: 'Server error fetching discharge data' });
    }
};

// ── BIRTH WEIGHT ──────────────────────────────────────────────────────────────
// GET /api/v1/admissions/birthweight?facilityIds=228&months=2026-01,2026-02&loungeIds=222
//
// Source: babyDailyWeight (weightType=1) LEFT JOINed to babyAdmission.
// All admitted babies are counted; those without a weightType=1 record = "Not available".
exports.getAdmissionBirthWeight = async (req, res) => {
    try {
        const { facilityIds: fParam, months: mParam, loungeIds: lParam } = req.query;
        if (!fParam || !mParam) return res.status(400).json({ error: 'facilityIds and months are required' });

        const facilityIds = parseIds(fParam);
        const months      = parseMonths(mParam);
        const loungeIds   = parseIds(lParam);

        const { clause: fClause, params: fParams } = buildFacilityClause(facilityIds);
        const { clause: mClause, params: mParams } = buildMonthClause(months);
        let where = `${fClause} AND ba.status IN (1, 2) AND ${mClause}`;
        const params = [...fParams, ...mParams];
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
             LEFT JOIN babyDailyWeight bdw
               ON bdw.babyAdmissionId = ba.id AND bdw.weightType = 1
             WHERE ${where}
             GROUP BY category`,
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
// GET /api/v1/admissions/earlyCare?facilityIds=228&months=2026-01&loungeIds=222
// Returns KMC-within-2h and BF-within-1h compliance split by Inborn/Outborn.
// Source: babyRegistration joined to babyAdmission (11=Yes, 12=No).
exports.getEarlyCareKpi = async (req, res) => {
    try {
        const { facilityIds: fParam, months: mParam, loungeIds: lParam } = req.query;
        if (!fParam || !mParam) return res.status(400).json({ error: 'facilityIds and months are required' });

        const facilityIds = parseIds(fParam);
        const months      = parseMonths(mParam);
        const loungeIds   = parseIds(lParam);

        const { clause: fClause, params: fParams } = buildFacilityClause(facilityIds);
        const { clause: mClause, params: mParams } = buildMonthClause(months);
        let where = `${fClause} AND ba.status IN (1, 2) AND ${mClause}
                     AND ba.typeOfBorn IN ('Inborn','Outborn')
                     AND br.kmcInitiated2Hour IN (11, 12)
                     AND br.breastfeedInitiated1Hour IN (11, 12)`;
        const params = [...fParams, ...mParams];
        const lClause = buildLoungeClause(loungeIds);
        if (lClause) { where += ` AND ${lClause.clause}`; params.push(...lClause.params); }

        const [rows] = await pool.query(
            `SELECT ba.typeOfBorn,
                    br.kmcInitiated2Hour,
                    br.breastfeedInitiated1Hour,
                    COUNT(*) AS cnt
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
            const n       = parseInt(row.cnt);
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
