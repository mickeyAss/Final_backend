var express = require('express');
var router = express.Router();
var conn = require('../dbconnect')

module.exports = router;

router.get("/get", (req, res) => {
    try {
        conn.query("SELECT * FROM user", (err, result) => {
            if (err) {
                console.log(err);
                return res.status(400).json({ error: 'Query error' });
            }
            if (result.length === 0) {
                return res.status(404).json({ error: 'No users found' });
            }
            res.status(200).json(result); // ส่งข้อมูลผู้ใช้ทั้งหมด
        });
    } catch (err) {
        console.log(err);
        return res.status(500).json({ error: 'Server error' });
    }
});

router.post("/login", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
        conn.query("SELECT * FROM user WHERE email = ?", [email], (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Database query error' });
            }

            // ตรวจสอบว่าพบผู้ใช้หรือไม่
            if (result.length === 0) {
                return res.status(404).json({ error: 'User not found' }); // อีเมลไม่ถูกต้อง
            }

            const user = result[0];

            if (password !== user.password) {
                return res.status(401).json({ error: 'Invalid password' }); // รหัสผ่านผิด
            }

            // ถ้า email และ password ถูกต้อง
            return res.status(200).json({ message: 'Login successful', user });
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Server error' });
    }
});

router.post("/register", (req, res) => {
    const {
        name, email, password,
        height, weight, shirt_size,
        chest, waist_circumference, hip
    } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email and password are required' });
    }

    const sql = `
        INSERT INTO user (
            name, email, password,
            height, weight, shirt_size,
            chest, waist_circumference, hip
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
        name, email, password,
        height, weight, shirt_size,
        chest, waist_circumference, hip
    ];

    try {
        conn.query(sql, values, (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Database insert error' });
            }

            return res.status(201).json({ message: 'User registered successfully', uid: result.insertId });
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Server error' });
    }
});
