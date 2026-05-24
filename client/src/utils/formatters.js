/**
 * Convert a string to Title Case.
 * "UTTAR PRADESH" → "Uttar Pradesh"
 * "madhya pradesh" → "Madhya Pradesh"
 */
export const toTitleCase = (str) => {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

/**
 * Generate month options from a start date to the current month.
 * Returns array of { value: "2026-01", label: "January 2026" }
 */
export const generateMonthOptions = (startYear = 2026, startMonth = 1) => {
  const months = [];
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-indexed

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  let year = startYear;
  let month = startMonth;

  while (year < currentYear || (year === currentYear && month <= currentMonth)) {
    const value = `${year}-${String(month).padStart(2, '0')}`;
    const label = `${monthNames[month - 1]} ${year}`;
    months.push({ id: value, name: label });

    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }

  return months;
};
