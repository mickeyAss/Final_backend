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

router.post("/login", async (req, res) => {
  const { email, password, isGoogleLogin, name, profile_image } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    // 🔍 ตรวจสอบว่า user มีอยู่หรือยัง
    const results = await new Promise((resolve, reject) => {
      conn.query("SELECT * FROM user WHERE email = ?", [email], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    // 🆕 ถ้ายังไม่มี user
    if (!results || results.length === 0) {
      if (isGoogleLogin) {
        // ➕ สร้าง user ใหม่จาก Google login
        const insertResult = await new Promise((resolve, reject) => {
          const sqlInsert = `
            INSERT INTO user (
              name, email, password, profile_image,
              height, weight, shirt_size, chest,
              waist_circumference, hip, personal_description
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;
          conn.query(sqlInsert, [
            name || '',
            email,
            '',                      // password ว่าง
            profile_image || '',
            '0', '0', '', '0', '0', '0', ''
          ], (err, result) => {
            if (err) reject(err);
            else resolve(result);
          });
        });

        // 📥 ดึงข้อมูล user ใหม่ที่เพิ่งสร้าง
        const newUserResults = await new Promise((resolve, reject) => {
          conn.query("SELECT * FROM user WHERE id = ?", [insertResult.insertId], (err, results) => {
            if (err) reject(err);
            else resolve(results);
          });
        });

        const newUser = newUserResults[0];

        return res.status(200).json({
          message: 'Login successful (new user)',
          user: newUser,
        });
      } else {
        return res.status(404).json({ error: 'User not found' });
      }
    } else {
      // 👤 ถ้ามี user อยู่แล้ว
      const user = results[0];

      if (isGoogleLogin) {
        return res.status(200).json({
          message: 'Login successful (Google)',
          user,
        });
      }

      // 🛡️ เช็ค password สำหรับ login ปกติ
      if (!password) {
        return res.status(400).json({ error: 'Password is required' });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ error: 'Invalid password' });
      }

      return res.status(200).json({
        message: 'Login successful',
        user,
      });
    }
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});




//เส้น Api สมัครสมาชิก user
router.post("/register", async (req, res) => {
  const {
    name, email, password,
    height, weight, shirt_size,
    chest, waist_circumference, hip,
    personal_description,
    category_ids // สมมติรับมาจาก request body เป็น array เช่น [1, 2, 3]
  } = req.body;

  const defaultProfileImage = 'https://firebasestorage.googleapis.com/v0/b/final-project-2f65c.firebasestorage.app/o/final_image%2Favatar.png?alt=media&token=8c81feb3-eeaa-44c5-bbfa-342d40a92333';

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

    const sqlInsertUser = `
            INSERT INTO user (
                name, email, password,
                height, weight, shirt_size,
                chest, waist_circumference, hip,
                personal_description, profile_image
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

    const userValues = [
      name, email, hashedPassword,
      height, weight, shirt_size,
      chest, waist_circumference, hip,
      personal_description,
      defaultProfileImage
    ];

    conn.query(sqlInsertUser, userValues, (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการบันทึกข้อมูลผู้ใช้' });
      }

      const userId = result.insertId;

      // ถ้ามี category_ids ส่งมา และเป็น array
      if (Array.isArray(category_ids) && category_ids.length > 0) {
        // เตรียมข้อมูลที่จะ insert
        const userCategoryValues = category_ids.map(catId => [userId, catId]);

        const sqlInsertUserCategory = `
                    INSERT INTO user_category (user_id_fk, category_id_fk)
                    VALUES ?
                `;

        conn.query(sqlInsertUserCategory, [userCategoryValues], (err2) => {
          if (err2) {
            console.error(err2);
            return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล user_category' });
          }

          return res.status(201).json({ message: 'สมัครสมาชิกเรียบร้อยแล้ว', uid: userId });
        });
      } else {
        // ถ้าไม่มี category_ids ส่งมา ก็ส่ง response ปกติ
        return res.status(201).json({ message: 'สมัครสมาชิกเรียบร้อยแล้ว', uid: userId });
      }
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
