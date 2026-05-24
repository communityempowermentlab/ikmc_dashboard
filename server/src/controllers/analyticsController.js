const pool = require('../config/db');

// Helper to get previous month string 'YYYY-MM'
const getPreviousMonthStr = (monthStr) => {
    const [yearStr, mStr] = monthStr.split('-');
    let year = parseInt(yearStr, 10);
    let month = parseInt(mStr, 10);

    month -= 1;
    if (month === 0) {
        month = 12;
        year -= 1;
    }
    return `${year}-${String(month).padStart(2, '0')}`;
};

// Generate all months between start and end (inclusive)
const generateMonthRange = (startStr, endStr) => {
    if (!startStr || !endStr) return [];
    
    const [startYear, startMonth] = startStr.split('-').map(Number);
    const [endYear, endMonth] = endStr.split('-').map(Number);
    
    const months = [];
    let y = startYear;
    let m = startMonth;
    
    while (y < endYear || (y === endYear && m <= endMonth)) {
        months.push(`${y}-${String(m).padStart(2, '0')}`);
        m++;
        if (m > 12) {
            m = 1;
            y++;
        }
    }
    return months;
};

exports.getAdmissionsKpi = async (req, res) => {
    try {
        const { facilityId, month } = req.query; // month format: '2026-05'

        if (!facilityId || !month) {
            return res.status(400).json({ error: 'facilityId and month are required' });
        }

        const prevMonth = getPreviousMonthStr(month);

        const query = `
            SELECT 
                DATE_FORMAT(b.admissionDateTime, '%Y-%m') as monthStr,
                COUNT(b.id) as count
            FROM babyAdmission b
            JOIN loungeMaster l ON b.loungeId = l.loungeId
            WHERE l.facilityId = ? 
              AND b.status IN (1, 2)
              AND (DATE_FORMAT(b.admissionDateTime, '%Y-%m') = ? OR DATE_FORMAT(b.admissionDateTime, '%Y-%m') = ?)
            GROUP BY monthStr
        `;

        const [rows] = await pool.query(query, [facilityId, month, prevMonth]);

        let currentCount = 0;
        let prevCount = 0;

        rows.forEach(row => {
            if (row.monthStr === month) currentCount = row.count;
            if (row.monthStr === prevMonth) prevCount = row.count;
        });

        // Calculate % change
        let percentChange = 0;
        if (prevCount === 0) {
            percentChange = currentCount > 0 ? 100 : 0;
        } else {
            percentChange = ((currentCount - prevCount) / prevCount) * 100;
        }

        res.json({
            currentMonth: month,
            previousMonth: prevMonth,
            currentCount,
            previousCount: prevCount,
            percentChange: parseFloat(percentChange.toFixed(1)),
            trend: percentChange > 0 ? 'up' : (percentChange < 0 ? 'down' : 'neutral')
        });

    } catch (err) {
        console.error('Error fetching admissions KPI:', err);
        res.status(500).json({ error: 'Server error' });
    }
};

exports.getAdmissionsTrend = async (req, res) => {
    try {
        const { facilityId, month } = req.query; // End month

        if (!facilityId || !month) {
            return res.status(400).json({ error: 'facilityId and month are required' });
        }

        const query = `
            SELECT 
                DATE_FORMAT(b.admissionDateTime, '%Y-%m') as monthStr,
                COUNT(b.id) as count
            FROM babyAdmission b
            JOIN loungeMaster l ON b.loungeId = l.loungeId
            WHERE l.facilityId = ? 
              AND b.status IN (1, 2)
              AND DATE_FORMAT(b.admissionDateTime, '%Y-%m') <= ?
            GROUP BY monthStr
            ORDER BY monthStr ASC
        `;

        const [rows] = await pool.query(query, [facilityId, month]);

        if (rows.length === 0) {
            return res.json([]);
        }

        const startMonth = rows[0].monthStr;
        const allMonths = generateMonthRange(startMonth, month);

        const dataMap = {};
        rows.forEach(r => { dataMap[r.monthStr] = r.count; });

        const trendData = allMonths.map(m => ({
            month: m,
            count: dataMap[m] || 0
        }));

        res.json(trendData);

    } catch (err) {
        console.error('Error fetching admissions trend:', err);
        res.status(500).json({ error: 'Server error' });
    }
};
