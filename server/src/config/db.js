const mysql = require('mysql2/promise');

const connectionConfig = process.env.DB_SOCKET
    ? { socketPath: process.env.DB_SOCKET }
    : { host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT) || 8889 };

const pool = mysql.createPool({
    ...connectionConfig,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'ikmc',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool;
