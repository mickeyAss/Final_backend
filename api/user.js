var express = require('express');
var router = express.Router();
var conn = require('../dbconnect');

const admin = require('firebase-admin');
const serviceAccount = require('../final-project-2f65c-firebase-adminsdk-fbsvc-b7cc350036.json');

const bcrypt = require('bcrypt'); // ต้องติดตั้งก่อน: npm install bcrypt

// เริ่มต้น Firebase Admin SDK พร้อมระบุ databaseURL (สำคัญ)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://final-project-2f65c-default-rtdb.firebaseio.com" // แก้ให้ตรงกับ URL ของ Firebase Realtime Database ของคุณ
  });
}

module.exports = router;

/* ----------------------- API: ดึงข้อมูลผู้ใช้ ----------------------- */

// ดึงผู้ใช้ทั้งหมดแบบสุ่ม
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
      res.status(200).json(result);
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ดึงผู้ใช้ที่ไม่ใช่ตัวเอง และยังไม่ได้ follow
router.get("/users-except", (req, res) => {
  const loggedInUid = req.query.uid;

  if (!loggedInUid) {
    return res.status(400).json({ error: 'Missing uid parameter' });
  }

  try {
    const sql = `
      SELECT * FROM user 
      WHERE uid != ? 
        AND uid NOT IN (
          SELECT following_id 
          FROM user_followers 
          WHERE follower_id = ?
        )
      ORDER BY RAND()
    `;

    conn.query(sql, [loggedInUid, loggedInUid], (err, result) => {
      if (err) {
        console.log(err);
        return res.status(400).json({ error: 'Query error' });
      }
      if (result.length === 0) {
        return res.status(404).json({ error: 'No users found' });
      }
      res.status(200).json(result);
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: 'Server error' });
  }
});


// เข้าสู่ระบบ (Login) แบบปกติ
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // ค้นหา user ในฐานข้อมูล MySQL
    const results = await new Promise((resolve, reject) => {
      conn.query("SELECT * FROM user WHERE email = ?", [email], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    if (!results || results.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = results[0];

    // ตรวจสอบ password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid password" });
    }

    res.status(200).json({ message: "Login successful", user });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// เข้าสู่ระบบด้วย Google
router.post("/login-google", async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ error: "Missing idToken" });
  }

  try {
    // ตรวจสอบ Firebase ID Token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { email, name, picture } = decodedToken;

    if (!email) {
      return res.status(400).json({ error: "No email in Google account" });
    }

    // ตรวจสอบว่า user มีใน MySQL หรือยัง
    const results = await new Promise((resolve, reject) => {
      const sql = "SELECT * FROM user WHERE email = ?";
      conn.query(sql, [email], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    let user;

    if (results.length === 0) {
      // ถ้ายังไม่มี → insert ใหม่
      const insertResult = await new Promise((resolve, reject) => {
        const sql = `
          INSERT INTO user (email, name, profile_image) 
          VALUES (?, ?, ?)
        `;
        conn.query(sql, [email, name || "ไม่ระบุ", picture || null], (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });

      // ดึงข้อมูล user หลัง insert
      const [newUser] = await new Promise((resolve, reject) => {
        conn.query("SELECT * FROM user WHERE uid = ?", [insertResult.insertId], (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      });

      // แปลง field ให้ตรง Flutter
      user = {
        uid: newUser.uid,
        name: newUser.name,
        email: newUser.email,
        profile_image: newUser.profile_image,
        personal_description: newUser.personal_description,
        height: newUser.height,
        weight: newUser.weight,
        shirt_size: newUser.shirt_size,
        chest: newUser.chest,
        waist_circumference: newUser.waist_circumference,
        hip: newUser.hip,
      };

    } else {
      // ถ้ามีแล้ว → ใช้ข้อมูลเก่า + อัปเดตล่าสุดจาก Google
      await new Promise((resolve, reject) => {
        const sql = `
          UPDATE user
          SET name = ?, profile_image = ?
          WHERE email = ?
        `;
        conn.query(sql, [name || results[0].name, picture || results[0].profile_image, email], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // ดึงข้อมูลล่าสุด
      const [updatedUser] = await new Promise((resolve, reject) => {
        conn.query("SELECT * FROM user WHERE email = ?", [email], (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      });

      user = {
        uid: updatedUser.uid,
        name: updatedUser.name,
        email: updatedUser.email,
        profile_image: updatedUser.profile_image,
        personal_description: updatedUser.personal_description,
        height: updatedUser.height,
        weight: updatedUser.weight,
        shirt_size: updatedUser.shirt_size,
        chest: updatedUser.chest,
        waist_circumference: updatedUser.waist_circumference,
        hip: updatedUser.hip,
      };
    }

    res.status(200).json({ message: "Google login successful", user });

  } catch (err) {
    console.error("Google login error:", err);
    res.status(401).json({ error: "Invalid Firebase token" });
  }
});



// สมัครสมาชิก (Register) + บันทึกหมวดหมู่ที่เลือก
router.post("/register", async (req, res) => {
  const {
    name, email, password,
    personal_description,
    category_ids, // เป็น array เช่น [1, 2, 3]
    height, weight, shirt_size,
    chest, waist_circumference, hip
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
        personal_description, profile_image,
        height, weight, shirt_size,
        chest, waist_circumference, hip
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const userValues = [
      name, email, hashedPassword,
      personal_description,
      defaultProfileImage,
      height || null,
      weight || null,
      shirt_size || null,
      chest || null,
      waist_circumference || null,
      hip || null
    ];

    conn.query(sqlInsertUser, userValues, (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการบันทึกข้อมูลผู้ใช้' });
      }

      const userId = result.insertId;

      if (Array.isArray(category_ids) && category_ids.length > 0) {
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
        return res.status(201).json({ message: 'สมัครสมาชิกเรียบร้อยแล้ว', uid: userId });
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
  }
});


// ดึงข้อมูลผู้ใช้ตาม uid
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

      return res.status(200).json(result[0]);
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

/* ----------------------- API: ระบบติดตาม (Follow) ----------------------- */

// follow ผู้ใช้ + สร้างการแจ้งเตือนทั้งใน MySQL และ Firebase
router.post("/follow", (req, res) => {
  const { follower_id, following_id } = req.body;

  if (!follower_id || !following_id) {
    console.log('[Follow] Missing follower_id or following_id');
    return res.status(400).json({ error: "follower_id and following_id are required" });
  }

  if (follower_id == following_id) {
    console.log('[Follow] Cannot follow yourself');
    return res.status(400).json({ error: "Cannot follow yourself" });
  }

  // เช็คว่าติดตามแล้วหรือยัง
  const checkSql = 'SELECT * FROM user_followers WHERE follower_id = ? AND following_id = ?';
  conn.query(checkSql, [follower_id, following_id], (err, results) => {
    if (err) {
      console.log('[Follow] Check failed:', err);
      return res.status(500).json({ error: 'Check failed' });
    }

    if (results.length > 0) {
      console.log(`[Follow] User ${follower_id} already follows ${following_id}`);
      return res.status(400).json({ error: 'Already followed' });
    }

    // บันทึกการติดตาม
    const insertSql = 'INSERT INTO user_followers (follower_id, following_id) VALUES (?, ?)';
    conn.query(insertSql, [follower_id, following_id], (err2) => {
      if (err2) {
        console.log('[Follow] Follow insert failed:', err2);
        return res.status(500).json({ error: 'Follow insert failed' });
      }

      // ไม่ต้องแจ้งเตือนถ้าติดตามตัวเอง (กันไว้รอบสอง)
      if (following_id !== follower_id) {
        const notifSql = `
          INSERT INTO notifications (sender_uid, receiver_uid, type, message)
          VALUES (?, ?, 'follow', ?)
        `;
        const message = 'ได้ติดตามคุณ';
        conn.query(notifSql, [follower_id, following_id, message], (err3) => {
          if (err3) {
            console.log('[Follow] Notification insert failed:', err3);
            // ไม่ return error เพราะไม่อยากให้การติดตามพัง
          }
        });

        // เพิ่ม notification ลง Firebase Realtime Database
        const notifData = {
          sender_uid: follower_id,
          receiver_uid: following_id,
          type: 'follow',
          message: message,
          is_read: false,
          created_at: admin.database.ServerValue.TIMESTAMP
        };

        const db = admin.database();
        const notifRef = db.ref('notifications').push(); // สร้าง id อัตโนมัติ
        notifRef.set(notifData)
          .then(() => {
            console.log('[Follow] Notification added to Firebase');
          })
          .catch((firebaseErr) => {
            console.log('[Follow] Firebase notification insert failed:', firebaseErr);
          });
      }

      console.log(`[Follow] User ${follower_id} followed ${following_id} successfully`);
      res.status(200).json({ message: 'Followed' });
    });
  });
});

// unfollow ผู้ใช้
router.delete("/unfollow", (req, res) => {
  const { follower_id, following_id } = req.body;

  if (!follower_id || !following_id || follower_id == following_id) {
    return res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง" });
  }

  const sql = `
    DELETE FROM user_followers WHERE follower_id = ? AND following_id = ?
  `;

  conn.query(sql, [follower_id, following_id], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "เกิดข้อผิดพลาดในการเลิกติดตาม" });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "ไม่พบข้อมูลการติดตาม" });
    }

    return res.status(200).json({ message: "เลิกติดตามสำเร็จ" });
  });
});

// ตรวจสอบว่ากำลังติดตามอยู่หรือไม่
router.get("/is-following", (req, res) => {
  const { follower_id, following_id } = req.query;

  if (!follower_id || !following_id) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  const sql = `
    SELECT * FROM user_followers
    WHERE follower_id = ? AND following_id = ?
  `;

  conn.query(sql, [follower_id, following_id], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Server error" });
    }

    const isFollowing = result.length > 0;
    return res.status(200).json({ isFollowing });
  });
});

// นับจำนวน followers ของ user
router.get("/followers-count/:uid", (req, res) => {
  const uid = req.params.uid;

  const sql = `
    SELECT COUNT(*) AS followers FROM user_followers
    WHERE following_id = ?
  `;

  conn.query(sql, [uid], (err, result) => {
    if (err) return res.status(500).json({ error: "Error" });
    res.status(200).json(result[0]);
  });
});

// นับจำนวน following ของ user
router.get("/following-count/:uid", (req, res) => {
  const uid = req.params.uid;

  const sql = `
    SELECT COUNT(*) AS following FROM user_followers
    WHERE follower_id = ?
  `;

  conn.query(sql, [uid], (err, result) => {
    if (err) return res.status(500).json({ error: "Error" });
    res.status(200).json(result[0]);
  });
});

/* ----------------------- API: การแจ้งเตือน (Notifications) ----------------------- */

// ดึงรายการแจ้งเตือน พร้อมข้อมูลผู้ส่ง และข้อมูลโพสต์ (ถ้ามี)
router.get('/notifications/:uid', (req, res) => {
  const receiver_uid = req.params.uid;

  if (!receiver_uid) {
    return res.status(400).json({ error: 'receiver_uid is required' });
  }

  const sql = `
    SELECT
      n.notification_id,
      n.sender_uid,
      n.receiver_uid,
      n.post_id,
      n.type,
      n.message,
      n.is_read,
      n.created_at,
      u.uid AS sender_uid_value,
      u.name AS sender_name,
      u.profile_image AS sender_profile_image,
      p.post_topic,
      p.post_description,
      p.post_date,
      p.post_fk_uid,
      p.amount_of_save,
      p.amount_of_comment
    FROM notifications n
    LEFT JOIN user u ON n.sender_uid = u.uid
    LEFT JOIN post p ON n.post_id = p.post_id
    WHERE n.receiver_uid = ?
    ORDER BY n.created_at DESC
  `;

  conn.query(sql, [receiver_uid], (err, notificationResults) => {
    if (err) {
      console.error('[Get Notifications] DB error:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (notificationResults.length === 0) {
      return res.status(200).json({ notifications: [] });
    }

    const postIds = notificationResults
      .map(notification => notification.post_id)
      .filter(post_id => post_id !== null && post_id !== undefined);

    if (postIds.length === 0) {
      // ไม่มีโพสต์ที่ต้องดึงรูปภาพ
      const formattedNotifications = notificationResults.map(notification => ({
        notification_id: notification.notification_id,
        sender_uid: notification.sender_uid,
        receiver_uid: notification.receiver_uid,
        post_id: notification.post_id,
        type: notification.type,
        message: notification.message,
        is_read: notification.is_read,
        created_at: notification.created_at,
        sender: {
          uid: notification.sender_uid_value,
          name: notification.sender_name,
          profile_image: notification.sender_profile_image
        },
        post: notification.post_id ? {
          post_id: notification.post_id,
          post_topic: notification.post_topic,
          post_description: notification.post_description,
          post_date: notification.post_date,
          post_fk_uid: notification.post_fk_uid,
          amount_of_save: notification.amount_of_save,
          amount_of_comment: notification.amount_of_comment,
          images: []
        } : null
      }));

      return res.status(200).json({ notifications: formattedNotifications });
    }

    // ดึงรูปภาพของโพสต์ทั้งหมด
    const imageSql = `
      SELECT * FROM image_post 
      WHERE image_fk_postid IN (${postIds.map(() => '?').join(',')})
    `;

    conn.query(imageSql, postIds, (err, imageResults) => {
      if (err) {
        console.error('[Get Notifications Images] DB error:', err);
        return res.status(500).json({ error: 'Image query error' });
      }

      const formattedNotifications = notificationResults.map(notification => {
        const postImages = imageResults.filter(img => img.image_fk_postid === notification.post_id);

        return {
          notification_id: notification.notification_id,
          sender_uid: notification.sender_uid,
          receiver_uid: notification.receiver_uid,
          post_id: notification.post_id,
          type: notification.type,
          message: notification.message,
          is_read: notification.is_read,
          created_at: notification.created_at,
          sender: {
            uid: notification.sender_uid_value,
            name: notification.sender_name,
            profile_image: notification.sender_profile_image
          },
          post: notification.post_id ? {
            post_id: notification.post_id,
            post_topic: notification.post_topic,
            post_description: notification.post_description,
            post_date: notification.post_date,
            post_fk_uid: notification.post_fk_uid,
            amount_of_save: notification.amount_of_save,
            amount_of_comment: notification.amount_of_comment,
            images: postImages
          } : null
        };
      });

      return res.status(200).json({ notifications: formattedNotifications });
    });
  });
});

// 🔍 Search user by name (ทั้งบางส่วนและเต็ม)
router.get("/search-user", (req, res) => {
  const { name, uid } = req.query;  // 👈 ดึง uid มาด้วย

  if (!name || name.trim() === "") {
    return res.status(400).json({ error: "Search query is required" });
  }
  if (!uid) {
    return res.status(400).json({ error: "User uid is required" });
  }

  try {
    const sql = `
      SELECT uid, name, email, profile_image, personal_description
      FROM user
      WHERE (name LIKE ? OR name = ?)
        AND uid != ?   -- 👈 กรองไม่เอาตัวเอง
      ORDER BY name ASC
    `;
    const searchValue = `%${name}%`;

    conn.query(sql, [searchValue, name, uid], (err, results) => {
      if (err) {
        console.error("[Search User] DB error:", err);
        return res.status(500).json({ error: "Database query error" });
      }

      // ส่ง [] แทน error เวลาไม่เจอ
      return res.status(200).json(results);
    });
  } catch (err) {
    console.error("[Search User] Server error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});


// อัปเดตข้อมูลผู้ใช้ (name, personal_description, profile_image)
router.put("/update-profile", (req, res) => {
  const { uid, name, personal_description, profile_image } = req.body;

  if (!uid) {
    return res.status(400).json({ error: "User uid is required" });
  }

  // เตรียม field ที่ต้องการอัปเดต
  const fields = [];
  const values = [];

  if (name !== undefined) {
    fields.push("name = ?");
    values.push(name);
  }
  if (personal_description !== undefined) {
    fields.push("personal_description = ?");
    values.push(personal_description);
  }
  if (profile_image !== undefined) {
    fields.push("profile_image = ?");
    values.push(profile_image);
  }

  if (fields.length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  values.push(uid); // สำหรับ WHERE uid = ?

  const sql = `
    UPDATE user
    SET ${fields.join(", ")}
    WHERE uid = ?
  `;

  conn.query(sql, values, (err, result) => {
    if (err) {
      console.error("[Update Profile] DB error:", err);
      return res.status(500).json({ error: "Database update error" });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.status(200).json({ message: "Profile updated successfully" });
  });
});
