const pool = require('../config/db');

// ── Shared helpers ──────────────────────────────────────────────────────────

function parseIds(raw) {
    return (raw || '').split(',').map(s => s.trim()).filter(Boolean);
}

function parseDateRange(query) {
    return {
        startDate: (query.startDate || '').trim(),
        endDate:   (query.endDate   || '').trim(),
    };
}

// Build WHERE clause for facility + lounge filter via loungeMaster join
function buildNurseWhere(facilityIds, loungeIds, startDate, endDate) {
    const fPh = facilityIds.map(() => '?').join(',');
    let where  = `lm.facilityId IN (${fPh}) AND DATE(ndc.addDate) BETWEEN ? AND ? AND ndc.addDate IS NOT NULL AND ndc.status = 1`;
    const params = [...facilityIds, startDate, endDate];

    if (loungeIds.length) {
        const lPh = loungeIds.map(() => '?').join(',');
        where += ` AND ndc.loungeId IN (${lPh})`;
        params.push(...loungeIds);
    }
    return { where, params };
}

// ── NURSE LOUNGE PERFORMANCE ──────────────────────────────────────────────────
// GET /api/v1/nurses/loungePerformance?facilityIds=&startDate=&endDate=&loungeIds=
// Returns lounge-level daily attendance: a lounge is "operational" on a day if
// at least one nurse made a check-in (nurseDutyChange record) that day.
exports.getLoungePerformance = async (req, res) => {
    try {
        const { facilityIds: fParam, loungeIds: lParam } = req.query;
        const { startDate, endDate } = parseDateRange(req.query);
        if (!fParam || !startDate || !endDate)
            return res.status(400).json({ error: 'facilityIds, startDate, endDate are required' });

        const facilityIds = parseIds(fParam);
        const loungeIds   = parseIds(lParam);
        const { where, params } = buildNurseWhere(facilityIds, loungeIds, startDate, endDate);

        // Total calendar days in range
        const [[daysRow]] = await pool.query(
            'SELECT DATEDIFF(?, ?) + 1 AS totalDays',
            [endDate, startDate]
        );
        const totalDays = parseInt(daysRow.totalDays);

        // Daily trend — days with ≥1 check-in
        const [dailyRows] = await pool.query(
            `SELECT
               DATE_FORMAT(DATE(ndc.addDate), '%Y-%m-%d') AS dt,
               COUNT(DISTINCT ndc.nurseId)                AS nurseCount
             FROM nurseDutyChange ndc
             JOIN loungeMaster lm ON ndc.loungeId = lm.loungeId
             WHERE ${where}
             GROUP BY dt
             ORDER BY dt`,
            params
        );

        const checkinDays = dailyRows.length;
        const missedDays  = Math.max(0, totalDays - checkinDays);
        const pct = totalDays > 0 ? parseFloat(((checkinDays / totalDays) * 100).toFixed(1)) : 0;

        // Monthly trend
        const [monthlyRows] = await pool.query(
            `SELECT
               YEAR(ndc.addDate)  AS yr,
               MONTH(ndc.addDate) AS mo,
               COUNT(DISTINCT DATE_FORMAT(DATE(ndc.addDate), '%Y-%m-%d')) AS checkinDays
             FROM nurseDutyChange ndc
             JOIN loungeMaster lm ON ndc.loungeId = lm.loungeId
             WHERE ${where}
             GROUP BY yr, mo
             ORDER BY yr ASC, mo ASC`,
            params
        );

        // Compute effective days per month — pure ISO string comparison (no tz issues)
        const monthlyTrend = monthlyRows.map(r => {
            const mm      = String(r.mo).padStart(2, '0');
            const moFirst = `${r.yr}-${mm}-01`;
            const lastDay = new Date(Date.UTC(r.yr, r.mo, 0)).getUTCDate();
            const moLast  = `${r.yr}-${mm}-${String(lastDay).padStart(2, '0')}`;
            // Clamp to selected date range using string comparison (ISO YYYY-MM-DD sorts correctly)
            const effectStart = moFirst > startDate ? moFirst : startDate;
            const effectEnd   = moLast  < endDate   ? moLast  : endDate;
            const s = new Date(effectStart + 'T12:00:00Z');
            const e = new Date(effectEnd   + 'T12:00:00Z');
            const moDays = Math.round((e - s) / 86400000) + 1;
            const cd     = parseInt(r.checkinDays);
            const moPct  = moDays > 0 ? parseFloat(((cd / moDays) * 100).toFixed(1)) : 0;
            return {
                year:        r.yr,
                month:       r.mo,
                checkinDays: cd,
                totalDays:   moDays,
                missedDays:  Math.max(0, moDays - cd),
                pct:         moPct,
            };
        });

        res.json({
            kpi: { totalDays, checkinDays, missedDays, pct },
            dailyTrend: dailyRows.map(r => ({ date: r.dt, nurseCount: parseInt(r.nurseCount) })),
            monthlyTrend,
        });
    } catch (err) {
        console.error('Error in getLoungePerformance:', err);
        res.status(500).json({ error: 'Server error fetching lounge performance' });
    }
};

// ── NURSE ATTENDANCE MATRIX ───────────────────────────────────────────────────
// GET /api/v1/nurses/attendanceMatrix?facilityIds=&startDate=&endDate=&loungeIds=
// Returns nurse × date matrix: each nurse's check-in status per day.
// Present = at least one check-in in nurseDutyChange for that nurseId + date.
exports.getAttendanceMatrix = async (req, res) => {
    try {
        const { facilityIds: fParam, loungeIds: lParam } = req.query;
        const { startDate, endDate } = parseDateRange(req.query);
        if (!fParam || !startDate || !endDate)
            return res.status(400).json({ error: 'facilityIds, startDate, endDate are required' });

        const facilityIds = parseIds(fParam);
        const loungeIds   = parseIds(lParam);
        const { where, params } = buildNurseWhere(facilityIds, loungeIds, startDate, endDate);

        // Total calendar days
        const [[daysRow]] = await pool.query(
            'SELECT DATEDIFF(?, ?) + 1 AS totalDays', [endDate, startDate]
        );
        const totalDays = parseInt(daysRow.totalDays);

        // All check-in records: nurseId, name, date (deduplicated by nurse+day)
        const [rows] = await pool.query(
            `SELECT
               ndc.nurseId,
               sm.name,
               DATE_FORMAT(DATE(ndc.addDate), '%Y-%m-%d') AS dt
             FROM nurseDutyChange ndc
             JOIN loungeMaster lm ON ndc.loungeId = lm.loungeId
             JOIN staffMaster  sm ON sm.staffId   = ndc.nurseId
             WHERE ${where}
             GROUP BY ndc.nurseId, sm.name, dt
             ORDER BY sm.name ASC, dt ASC`,
            params
        );

        // Generate full date list for the range
        const dates = [];
        const cur = new Date(startDate + 'T00:00:00Z');
        const end = new Date(endDate   + 'T00:00:00Z');
        while (cur <= end) {
            dates.push(cur.toISOString().slice(0, 10));
            cur.setUTCDate(cur.getUTCDate() + 1);
        }

        // Build per-nurse map
        const nurseMap = new Map();
        for (const row of rows) {
            if (!nurseMap.has(row.nurseId)) {
                nurseMap.set(row.nurseId, { nurseId: row.nurseId, name: row.name, presentDates: new Set() });
            }
            nurseMap.get(row.nurseId).presentDates.add(row.dt);
        }

        const nurses = [...nurseMap.values()].map(n => {
            const presentCount = n.presentDates.size;
            const absentCount  = Math.max(0, totalDays - presentCount);
            return {
                nurseId:      n.nurseId,
                name:         n.name,
                presentDates: [...n.presentDates],
                presentCount,
                absentCount,
                pct: totalDays > 0 ? parseFloat(((presentCount / totalDays) * 100).toFixed(1)) : 0,
            };
        });

        // Sort by attendance % descending
        nurses.sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name));

        res.json({ dates, nurses, totalDays });
    } catch (err) {
        console.error('Error in getAttendanceMatrix:', err);
        res.status(500).json({ error: 'Server error fetching attendance matrix' });
    }
};
