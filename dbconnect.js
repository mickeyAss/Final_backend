const mysql = require('mysql2/promise');

// ใช้ createPool พร้อม promise
const pool = mysql.createPool({
    host: 'mysqladmin.comsciproject.net',
    user: 'u528477660_micearn',
    password: 'Ysp1o@TQ',
    database: 'u528477660_micearn',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// ทดสอบ connection
(async () => {
    try {
        const conn = await pool.getConnection();
        console.log('MySQL successfully connected!');
        conn.release();
    } catch (err) {
        console.error('Error connecting to MySQL database:', err);
    }
})();

module.exports = pool;
