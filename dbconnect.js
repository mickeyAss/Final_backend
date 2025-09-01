const mysql = require('mysql');

// ใช้ createPool แทน createConnection เพื่อให้จัดการ connection อัตโนมัติ
const conn = mysql.createPool({
    connectionLimit: 10, // จำกัดจำนวน connection สูงสุด
    host: 'mysqladmin.comsciproject.net',
    user: 'u528477660_micearn',
    password: 'Ysp1o@TQ',
    database: 'u528477660_micearn'
});

// ทดสอบการเชื่อมต่อ
conn.getConnection((err, connection) => {
    if (err) {
        console.error('Error connecting to MySQL database:', err);
        return;
    }
    console.log('MySQL successfully connected!');
    connection.release(); // ปล่อย connection กลับ pool
});

// จับ error ที่เกิดจาก connection pool
conn.on('error', (err) => {
    console.error('🔥 MySQL pool error:', err);
});

module.exports = conn;
