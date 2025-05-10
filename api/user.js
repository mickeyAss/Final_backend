var express = require('express');
var router = express.Router();
var conn = require('../dbconnect')

module.exports = router;

//เส้น Api ดึงข้อมูลทั้งหมดจากเทเบิ้ล user
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

//เส้น Api เข้าสู่ระบบ user
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

const bcrypt = require('bcrypt'); // ต้องติดตั้งก่อน: npm install bcrypt
//เส้น Api สมัครสมาชิก user
router.post("/register", async (req, res) => {
    const {
        name, email, password,
        height, weight, shirt_size,
        chest, waist_circumference, hip
    } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: 'กรุณากรอกชื่อ อีเมล และรหัสผ่านให้ครบถ้วน' });
    }

    // ตรวจสอบรหัสผ่าน (ไม่รวมอักขระพิเศษ)
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(password)) {
        return res.status(400).json({
            error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร และประกอบด้วยตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก และตัวเลข'
        });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const sql = `
            INSERT INTO user (
                name, email, password,
                height, weight, shirt_size,
                chest, waist_circumference, hip
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
            name, email, hashedPassword,
            height, weight, shirt_size,
            chest, waist_circumference, hip
        ];

        conn.query(sql, values, (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการบันทึกข้อมูลผู้ใช้' });
            }

            return res.status(201).json({ message: 'สมัครสมาชิกเรียบร้อยแล้ว', uid: result.insertId });
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
    }
});

//เส้น Api ดึงข้อมูลทั้งหมดของ user ตาม uid
router.get("/get/:uid", (req, res) => {
    const uid = req.params.uid;

    if (!uid) {
        return res.status(400).json({ error: 'User ID is required' });
    }

    try {
        conn.query("SELECT * FROM user WHERE uid = ?", [uid], (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Database query error' });
            }

            if (result.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }

            return res.status(200).json(result[0]); // ส่งข้อมูลผู้ใช้ที่เจอ
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Server error' });
    }
});
