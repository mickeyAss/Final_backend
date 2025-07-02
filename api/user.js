var express = require('express');
var router = express.Router();
var conn = require('../dbconnect')

module.exports = router;

//เส้น Api ดึงข้อมูลทั้งหมดจากเทเบิ้ล user
router.get("/get", (req, res) => {
    try {
        conn.query("SELECT * FROM user ORDER BY RAND()", (err, result) => {
            if (err) {
                console.log(err);
                return res.status(400).json({ error: 'Query error' });
            }
            if (result.length === 0) {
                return res.status(404).json({ error: 'No users found' });
            }
            res.status(200).json(result); // ส่งข้อมูลผู้ใช้ทั้งหมด แบบสุ่ม
        });
    } catch (err) {
        console.log(err);
        return res.status(500).json({ error: 'Server error' });
    }
});

//เส้น Api เข้าสู่ระบบ user
const bcrypt = require('bcrypt'); // ต้องติดตั้งก่อน: npm install bcrypt

router.post("/login", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
        conn.query("SELECT * FROM user WHERE email = ?", [email], async (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Database query error' });
            }

            if (result.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }

            const user = result[0];

            // ✅ เปรียบเทียบ password ที่กรอก กับ hash ที่เก็บไว้
            const isMatch = await bcrypt.compare(password, user.password);

            if (!isMatch) {
                return res.status(401).json({ error: 'Invalid password' });
            }

            // ล็อกอินสำเร็จ
            return res.status(200).json({ message: 'Login successful', user });
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Server error' });
    }
});

//เส้น Api สมัครสมาชิก user
router.post("/register", async (req, res) => {
    const {
        name, email, password,
        height, weight, shirt_size,
        chest, waist_circumference, hip
    } = req.body;

    const defaultProfileImage = 'https://i.pinimg.com/736x/b3/6a/cb/b36acb54b3b83e0f285829e004b0a916.jpg';

    if (!name || !email || !password) {
        return res.status(400).json({ error: 'กรุณากรอกชื่อ อีเมล และรหัสผ่านให้ครบถ้วน' });
    }

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
                chest, waist_circumference, hip,
                profile_image
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
            name, email, hashedPassword,
            height, weight, shirt_size,
            chest, waist_circumference, hip,
            defaultProfileImage
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
