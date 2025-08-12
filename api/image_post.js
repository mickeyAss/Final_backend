var express = require('express');
var router = express.Router();
var conn = require('../dbconnect')


module.exports = router;

// --------------------------------------------
// API GET /get
// ดึงโพสต์ทั้งหมด พร้อมข้อมูลผู้ใช้ รูปภาพ หมวดหมู่ แฮชแท็ก และจำนวนไลก์
// --------------------------------------------
router.get("/get", (req, res) => {
  try {
    const postSql = `
      SELECT 
        post.*, 
        user.uid, user.name, user.email, 
        user.personal_description, user.profile_image
      FROM post
      JOIN user ON post.post_fk_uid = user.uid
      ORDER BY DATE(post.post_date) DESC, TIME(post.post_date) DESC
    `;

    conn.query(postSql, (err, postResults) => {
      if (err) return res.status(400).json({ error: 'Post query error' });

      if (postResults.length === 0)
        return res.status(404).json({ error: 'No posts found' });

      // ดึงรูปภาพทั้งหมดจากตาราง image_post
      const imageSql = `SELECT * FROM image_post`;
      conn.query(imageSql, (err, imageResults) => {
        if (err) return res.status(400).json({ error: 'Image query error' });

        // ดึงหมวดหมู่ของโพสต์จากตาราง post_category และ category
        const categorySql = `
          SELECT pc.post_id_fk, c.cid, c.cname, c.cimage, c.ctype
          FROM post_category pc
          JOIN category c ON pc.category_id_fk = c.cid
        `;
        conn.query(categorySql, (err, categoryResults) => {
          if (err) return res.status(400).json({ error: 'Category query error' });

          // ดึงแฮชแท็กของโพสต์จาก post_hashtags และ hashtags
          const hashtagSql = `
            SELECT ph.post_id_fk, h.tag_id, h.tag_name 
            FROM post_hashtags ph
            JOIN hashtags h ON ph.hashtag_id_fk = h.tag_id
          `;
          conn.query(hashtagSql, (err, hashtagResults) => {
            if (err) return res.status(400).json({ error: 'Hashtag query error' });

            // ดึงจำนวนไลก์แต่ละโพสต์จากตาราง post_likes
            const likeSql = `
              SELECT post_id_fk AS post_id, COUNT(*) AS like_count 
              FROM post_likes 
              GROUP BY post_id_fk
            `;
            conn.query(likeSql, (err, likeResults) => {
              if (err) return res.status(400).json({ error: 'Like count query error' });

              // สร้างแผนที่จำนวนไลก์สำหรับแต่ละโพสต์
              const likeMap = {};
              likeResults.forEach(item => {
                likeMap[item.post_id] = item.like_count;
              });

              // รวมข้อมูลโพสต์, ผู้ใช้, รูปภาพ, หมวดหมู่, แฮชแท็ก, และจำนวนไลก์
              const postsWithData = postResults.map(post => {
                const images = imageResults.filter(img => img.image_fk_postid === post.post_id);
                const categories = categoryResults
                  .filter(cat => cat.post_id_fk === post.post_id)
                  .map(cat => ({
                    cid: cat.cid,
                    cname: cat.cname,
                    cimage: cat.cimage,
                    ctype: cat.ctype
                  }));

                const hashtags = hashtagResults
                  .filter(ht => ht.post_id_fk === post.post_id)
                  .map(ht => ({
                    tag_id: ht.tag_id,
                    tag_name: ht.tag_name
                  }));

                return {
                  post: {
                    post_id: post.post_id,
                    post_topic: post.post_topic,
                    post_description: post.post_description,
                    post_date: post.post_date,
                    post_fk_cid: post.post_fk_cid,
                    post_fk_uid: post.post_fk_uid,
                    post_status: post.post_status,
                    amount_of_like: likeMap[post.post_id] || 0,
                    amount_of_save: post.amount_of_save || 0,
                    amount_of_comment: post.amount_of_comment || 0,
                  },
                  user: {
                    uid: post.uid,
                    name: post.name,
                    email: post.email,
                    personal_description: post.personal_description,
                    profile_image: post.profile_image
                  },
                  images,
                  categories,
                  hashtags
                };
              });

              // ส่งข้อมูลโพสต์ทั้งหมดกลับไป
              res.status(200).json(postsWithData);
            });
          });
        });
      });
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: 'Server error' });
  }
});




const admin = require('firebase-admin');
// ต้องตั้งค่า Firebase Admin SDK ก่อน (โหลด service account json)
const serviceAccount = require('../final-project-2f65c-firebase-adminsdk-fbsvc-b7cc350036.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://final-project-2f65c-default-rtdb.firebaseio.com"  // แก้เป็น URL ของ Firebase Realtime Database คุณ
  });
}

// --------------------------------------------
// API POST /like
// เพิ่มไลก์ของผู้ใช้ให้โพสต์
// --------------------------------------------
router.post('/like', (req, res) => {
  const { user_id, post_id } = req.body;

  if (!user_id || !post_id) {
    console.log('[Like] Missing user_id or post_id');
    return res.status(400).json({ error: 'user_id and post_id are required' });
  }

  // เช็คว่าผู้ใช้กดไลก์โพสต์นี้แล้วหรือยัง
  const checkSql = 'SELECT * FROM post_likes WHERE user_id_fk = ? AND post_id_fk = ?';
  conn.query(checkSql, [user_id, post_id], (err, results) => {
    if (err) {
      console.log('[Like] Check failed:', err);
      return res.status(500).json({ error: 'Check failed' });
    }

    if (results.length > 0) {
      console.log(`[Like] User ${user_id} already liked post ${post_id}`);
      return res.status(400).json({ error: 'Already liked' });
    }

    // บันทึกการไลก์ในฐานข้อมูล
    const insertSql = 'INSERT INTO post_likes (user_id_fk, post_id_fk) VALUES (?, ?)';
    conn.query(insertSql, [user_id, post_id], (err2) => {
      if (err2) {
        console.log('[Like] Like insert failed:', err2);
        return res.status(500).json({ error: 'Like insert failed' });
      }

      // อัพเดตจำนวนไลก์ในตารางโพสต์
      const updatePostSql = 'UPDATE post SET amount_of_like = amount_of_like + 1 WHERE post_id = ?';
      conn.query(updatePostSql, [post_id], (err3) => {
        if (err3) {
          console.log('[Like] Post update failed:', err3);
          return res.status(500).json({ error: 'Post update failed' });
        }

        // หาว่าเจ้าของโพสต์เป็นใคร
        const ownerSql = 'SELECT post_fk_uid FROM post WHERE post_id = ?';
        conn.query(ownerSql, [post_id], (err4, ownerResult) => {
          if (err4) {
            console.log('[Like] Get post owner failed:', err4);
            return res.status(500).json({ error: 'Get post owner failed' });
          }

          if (ownerResult.length > 0) {
            const receiver_uid = ownerResult[0].post_fk_uid;

            // ไม่ต้องแจ้งเตือนถ้าเจ้าของโพสต์กดไลก์โพสต์ตัวเอง
            if (receiver_uid !== user_id) {
              const notifSql = `
                INSERT INTO notifications (sender_uid, receiver_uid, post_id, type, message)
                VALUES (?, ?, ?, 'like', ?)
              `;
              const message = 'ได้กดถูกใจโพสต์ของคุณ';
              conn.query(notifSql, [user_id, receiver_uid, post_id, message], (err5) => {
                if (err5) {
                  console.log('[Like] Notification insert failed:', err5);
                  // ไม่ return error เพราะไม่อยากให้การกดไลก์พัง
                }
              });

              // เพิ่ม notification ลง Firebase Realtime Database
              const notifData = {
                sender_uid: user_id,
                receiver_uid: receiver_uid,
                post_id: post_id,
                type: 'like',
                message: message,
                is_read: false,
                created_at: admin.database.ServerValue.TIMESTAMP
              };

              const db = admin.database();
              const notifRef = db.ref('notifications').push(); // สร้าง id อัตโนมัติ
              notifRef.set(notifData)
                .then(() => {
                  console.log('[Like] Notification added to Firebase');
                })
                .catch((firebaseErr) => {
                  console.log('[Like] Firebase notification insert failed:', firebaseErr);
                });
            }
          }

          console.log(`[Like] User ${user_id} liked post ${post_id} successfully`);
          res.status(200).json({ message: 'Liked' });
        });
      });
    });
  });
});



// --------------------------------------------
// API POST /unlike
// ลบไลก์ของผู้ใช้ในโพสต์
// --------------------------------------------
router.post('/unlike', (req, res) => {
  const { user_id, post_id } = req.body;

  if (!user_id || !post_id) {
    console.log('[Unlike] Missing user_id or post_id');
    return res.status(400).json({ error: 'user_id and post_id are required' });
  }

  // ลบไลก์ของผู้ใช้ในโพสต์
  const deleteSql = 'DELETE FROM post_likes WHERE user_id_fk = ? AND post_id_fk = ?';
  conn.query(deleteSql, [user_id, post_id], (err, result) => {
    if (err) {
      console.log('[Unlike] Unlike failed:', err);
      return res.status(500).json({ error: 'Unlike failed' });
    }

    if (result.affectedRows === 0) {
      console.log(`[Unlike] Like not found for user ${user_id} and post ${post_id}`);
      return res.status(404).json({ error: 'Like not found' });
    }

    // ลดจำนวนไลก์ในตารางโพสต์ (อย่างน้อยต้องเป็น 0)
    const updatePostSql = 'UPDATE post SET amount_of_like = GREATEST(amount_of_like - 1, 0) WHERE post_id = ?';
    conn.query(updatePostSql, [post_id], (err2) => {
      if (err2) {
        console.log('[Unlike] Post update failed:', err2);
        return res.status(500).json({ error: 'Post update failed' });
      }
      console.log(`[Unlike] User ${user_id} unliked post ${post_id} successfully`);
      res.status(200).json({ message: 'Unliked' });
    });
  });
});

// --------------------------------------------
// API GET /liked-posts/:user_id
// ดึงโพสต์ที่ผู้ใช้กดไลก์ทั้งหมด (แค่ post_id)
// --------------------------------------------
router.get('/liked-posts/:user_id', (req, res) => {
  const { user_id } = req.params;
  const sql = 'SELECT post_id_fk FROM post_likes WHERE user_id_fk = ?';

  conn.query(sql, [user_id], (err, results) => {
    if (err) return res.status(500).json({ error: 'Query failed' });
    const likedPostIds = results.map(row => row.post_id_fk);
    res.status(200).json({ likedPostIds });
  });
});

// ดึงจำนวนไลก์ของโพสต์
router.get('/:post_id/likes', (req, res) => {
  const postId = req.params.post_id;

  const sql = 'SELECT amount_of_like FROM post WHERE post_id = ?';
  conn.query(sql, [postId], (err, results) => {
    if (err) {
      console.log('[Get Like Count] Error:', err);
      return res.status(500).json({ error: 'Query failed' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.status(200).json({ likeCount: results[0].amount_of_like });
  });
});

// --------------------------------------------
// API POST /save
// บันทึกโพสต์ของผู้ใช้
// --------------------------------------------
router.post('/save', (req, res) => {
  const { user_id, post_id } = req.body;

  if (!user_id || !post_id) {
    console.log('[Save] Missing user_id or post_id');
    return res.status(400).json({ error: 'user_id and post_id are required' });
  }

  // เช็คว่าผู้ใช้บันทึกโพสต์นี้แล้วหรือยัง
  const checkSql = 'SELECT * FROM post_saves WHERE user_id_fk = ? AND post_id_fk = ?';
  conn.query(checkSql, [user_id, post_id], (err, results) => {
    if (err) {
      console.log('[Save] Check failed:', err);
      return res.status(500).json({ error: 'Check failed' });
    }

    if (results.length > 0) {
      console.log(`[Save] User ${user_id} already saved post ${post_id}`);
      return res.status(400).json({ error: 'Already saved' });
    }

    // บันทึกการเซฟโพสต์
    const insertSql = 'INSERT INTO post_saves (user_id_fk, post_id_fk) VALUES (?, ?)';
    conn.query(insertSql, [user_id, post_id], (err2) => {
      if (err2) {
        console.log('[Save] Save insert failed:', err2);
        return res.status(500).json({ error: 'Save insert failed' });
      }
      console.log(`[Save] User ${user_id} saved post ${post_id} successfully`);
      res.status(200).json({ message: 'Saved' });
    });
  });
});

// --------------------------------------------
// API POST /unsave
// ลบโพสต์ที่ผู้ใช้บันทึกไว้
// --------------------------------------------
router.post('/unsave', (req, res) => {
  const { user_id, post_id } = req.body;

  if (!user_id || !post_id) {
    console.log('[Unsave] Missing user_id or post_id');
    return res.status(400).json({ error: 'user_id and post_id are required' });
  }

  const deleteSql = 'DELETE FROM post_saves WHERE user_id_fk = ? AND post_id_fk = ?';
  conn.query(deleteSql, [user_id, post_id], (err, result) => {
    if (err) {
      console.log('[Unsave] Unsave failed:', err);
      return res.status(500).json({ error: 'Unsave failed' });
    }

    if (result.affectedRows === 0) {
      console.log(`[Unsave] Save not found for user ${user_id} and post ${post_id}`);
      return res.status(404).json({ error: 'Save not found' });
    }

    console.log(`[Unsave] User ${user_id} unsaved post ${post_id} successfully`);
    res.status(200).json({ message: 'Unsaved' });
  });
});

// --------------------------------------------
// API GET /saved-posts/:user_id
// ดึงโพสต์ที่ผู้ใช้บันทึกทั้งหมด (แค่ post_id)
// --------------------------------------------
router.get('/saved-posts/:user_id', (req, res) => {
  const { user_id } = req.params;
  const sql = 'SELECT post_id_fk FROM post_saves WHERE user_id_fk = ?';

  conn.query(sql, [user_id], (err, results) => {
    if (err) return res.status(500).json({ error: 'Query failed' });
    const savedPostIds = results.map(row => row.post_id_fk);
    res.status(200).json({ savedPostIds });
  });
});

// --------------------------------------------
// API POST /post/add
// เพิ่มโพสต์พร้อมรูปภาพ, หมวดหมู่ และแฮชแท็ก
// --------------------------------------------

const vision = require('@google-cloud/vision');
const { Translate } = require('@google-cloud/translate').v2;

// สร้าง client ของ Google Vision
const visionClient = new vision.ImageAnnotatorClient({
  keyFilename: 'D:/Project Appication/final_project_backend/practical-now-465814-r5-fc7948fa14db.json',
});
const translateClient = new Translate({
  keyFilename: 'D:/Project Appication/final_project_backend/practical-now-465814-r5-2d95bf6ba8d7.json', // ใส่ path ให้ถูกต้อง
  projectId: 'practical-now-465814-r5',
});

router.post('/post/add', async (req, res) => {
  try {
    let { post_topic, post_description, post_fk_uid, images, category_id_fk, hashtags, post_status } = req.body;

    post_topic = post_topic?.trim() === '' ? null : post_topic;
    post_description = post_description?.trim() === '' ? null : post_description;
    post_status = (typeof post_status === 'string' && post_status.trim().toLowerCase() === 'friends') ? 'friends' : 'public';

    if (!post_fk_uid || !Array.isArray(images)) {
      return res.status(400).json({ error: 'Missing required fields: post_fk_uid or images' });
    }

    // Insert post
    const insertPostSql = `
      INSERT INTO post (post_topic, post_description, post_date, post_fk_uid, post_status)
      VALUES (?, ?, NOW(), ?, ?)
    `;

    const postResult = await new Promise((resolve, reject) => {
      conn.query(insertPostSql, [post_topic, post_description, post_fk_uid, post_status], (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    const insertedPostId = postResult.insertId;

    // Insert images
    const insertImages = () => {
      if (!images.length) return Promise.resolve();
      const insertImageSql = `INSERT INTO image_post (image, image_fk_postid) VALUES ?`;
      const imageValues = images.map(url => [url, insertedPostId]);
      return new Promise((resolve, reject) => {
        conn.query(insertImageSql, [imageValues], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    };

    // Analyze images
    const analyzeImages = async () => {
      for (const imgUrl of images) {
        try {
          const [result] = await visionClient.labelDetection(imgUrl);
          const labels = result.labelAnnotations;
          let detectedLabels = labels.length ? labels.map(label => label.description).join(', ') : '';

          let translatedText = detectedLabels;
          if (detectedLabels.trim()) {
            const [translation] = await translateClient.translate(detectedLabels, 'th');
            translatedText = translation;
          }

          const sql = `
            INSERT INTO post_image_analysis (post_id_fk, image_url, analysis_text, created_at)
            VALUES (?, ?, ?, NOW())
          `;

          await new Promise((res, rej) => {
            conn.query(sql, [insertedPostId, imgUrl, translatedText], (err) => {
              if (err) rej(err);
              else res();
            });
          });
        } catch (error) {
          console.error(`Error analyzing image ${imgUrl}:`, error);
        }
      }
    };

    // Insert categories
    const insertCategories = () => {
      if (!Array.isArray(category_id_fk) || category_id_fk.length === 0) return Promise.resolve();
      const insertCategorySql = `INSERT INTO post_category (category_id_fk, post_id_fk) VALUES ?`;
      const categoryValues = category_id_fk.map(catId => [catId, insertedPostId]);
      return new Promise((resolve, reject) => {
        conn.query(insertCategorySql, [categoryValues], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    };

    // Insert hashtags
    const insertPostHashtags = () => {
      if (!Array.isArray(hashtags) || hashtags.length === 0) return Promise.resolve();
      const insertPostHashtagSql = `INSERT INTO post_hashtags (post_id_fk, hashtag_id_fk) VALUES ?`;
      const values = hashtags.map(tagId => [insertedPostId, tagId]);
      return new Promise((resolve, reject) => {
        conn.query(insertPostHashtagSql, [values], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    };

    // รันทุกงานพร้อมกัน
    await Promise.all([
      insertImages(),
      insertCategories(),
      insertPostHashtags(),
      analyzeImages(),
    ]);

    return res.status(201).json({
      message: 'Post and related data inserted successfully',
      post_id: insertedPostId,
      post_status,
    });
  } catch (error) {
    console.error('Error in /post/add:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});




// --------------------------------------------
// API GET /by-user/:uid
// ดึงโพสต์ทั้งหมดของผู้ใช้คนหนึ่ง พร้อมรูปภาพและหมวดหมู่
// --------------------------------------------
router.get("/by-user/:uid", (req, res) => {
  const { uid } = req.params;

  if (!uid) {
    return res.status(400).json({ error: "Missing uid in path" });
  }

  const postSql = `
    SELECT post.* 
    FROM post
    JOIN user ON post.post_fk_uid = user.uid
    WHERE user.uid = ?
    ORDER BY post.post_date DESC
  `;

  conn.query(postSql, [uid], (err, postResults) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Post query error" });
    }

    if (postResults.length === 0) {
      return res.status(404).json({ error: "No posts found for this user" });
    }

    const imageSql = `SELECT * FROM image_post`;
    conn.query(imageSql, (err, imageResults) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Image query error" });
      }

      const categorySql = `
        SELECT 
          pc.post_id_fk, 
          c.cid, c.cname, c.cimage, c.ctype
        FROM post_category pc
        JOIN category c ON pc.category_id_fk = c.cid
      `;

      conn.query(categorySql, (err, categoryResults) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: "Category query error" });
        }

        const postsWithData = postResults.map((post) => {
          const images = imageResults.filter(img => img.image_fk_postid === post.post_id);
          const categories = categoryResults
            .filter(cat => cat.post_id_fk === post.post_id)
            .map(cat => ({
              cid: cat.cid,
              cname: cat.cname,
              cimage: cat.cimage,
              ctype: cat.ctype
            }));

          return {
            post: {
              post_id: post.post_id,
              post_topic: post.post_topic,
              post_description: post.post_description,
              amount_of_like: post.amount_of_like,
              amount_of_save: post.amount_of_save,
              amount_of_comment: post.amount_of_comment,
              post_date: post.post_date,
              post_fk_cid: post.post_fk_cid,
              post_fk_uid: post.post_fk_uid,
            },
            images,
            categories
          };
        });

        res.status(200).json(postsWithData);
      });
    });
  });
});

router.get("/by-post/:post_id", (req, res) => {
  let post_id = req.params.post_id;

  if (!post_id) {
    return res.status(400).json({ error: "Missing post_id in path" });
  }

  // แปลงเป็นเลขจำนวนเต็ม
  post_id = parseInt(post_id, 10);
  if (isNaN(post_id)) {
    return res.status(400).json({ error: "Invalid post_id" });
  }

  try {
    const postSql = `
      SELECT 
        post.*, 
        user.uid, user.name, user.email, user.height, user.weight, 
        user.shirt_size, user.chest, user.waist_circumference, 
        user.hip, user.personal_description, user.profile_image
      FROM post
      JOIN user ON post.post_fk_uid = user.uid
      WHERE post.post_id = ?
    `;

    conn.query(postSql, [post_id], (err, postResults) => {
      if (err) return res.status(400).json({ error: "Post query error" });

      if (postResults.length === 0)
        return res.status(404).json({ error: "Post not found" });

      const post = postResults[0];

      const imageSql = `SELECT * FROM image_post WHERE image_fk_postid = ?`;
      conn.query(imageSql, [post_id], (err, imageResults) => {
        if (err) return res.status(400).json({ error: "Image query error" });

        const categorySql = `
          SELECT pc.post_id_fk, c.cid, c.cname, c.cimage, c.ctype
          FROM post_category pc
          JOIN category c ON pc.category_id_fk = c.cid
          WHERE pc.post_id_fk = ?
        `;
        conn.query(categorySql, [post_id], (err, categoryResults) => {
          if (err) return res.status(400).json({ error: "Category query error" });

          const hashtagSql = `
            SELECT ph.post_id_fk, h.tag_id, h.tag_name 
            FROM post_hashtags ph
            JOIN hashtags h ON ph.hashtag_id_fk = h.tag_id
            WHERE ph.post_id_fk = ?
          `;
          conn.query(hashtagSql, [post_id], (err, hashtagResults) => {
            if (err) return res.status(400).json({ error: "Hashtag query error" });

            const likeSql = `
              SELECT COUNT(*) AS like_count 
              FROM post_likes 
              WHERE post_id_fk = ?
            `;
            conn.query(likeSql, [post_id], (err, likeResults) => {
              if (err) return res.status(400).json({ error: "Like count query error" });

              const likeCount = likeResults[0]?.like_count || 0;

              const postWithDetails = {
                post: {
                  post_id: post.post_id,
                  post_topic: post.post_topic,
                  post_description: post.post_description,
                  post_date: post.post_date,
                  post_fk_cid: post.post_fk_cid,
                  post_fk_uid: post.post_fk_uid,
                  amount_of_like: likeCount,
                  amount_of_save: post.amount_of_save,
                  amount_of_comment: post.amount_of_comment,
                },
                user: {
                  uid: post.uid,
                  name: post.name,
                  email: post.email,
                  height: post.height,
                  weight: post.weight,
                  shirt_size: post.shirt_size,
                  chest: post.chest,
                  waist_circumference: post.waist_circumference,
                  hip: post.hip,
                  personal_description: post.personal_description,
                  profile_image: post.profile_image,
                },
                images: imageResults,
                categories: categoryResults.map(cat => ({
                  cid: cat.cid,
                  cname: cat.cname,
                  cimage: cat.cimage,
                  ctype: cat.ctype,
                })),
                hashtags: hashtagResults.map(ht => ({
                  tag_id: ht.tag_id,
                  tag_name: ht.tag_name,
                })),
              };

              return res.status(200).json(postWithDetails);
            });
          });
        });
      });
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});



// API ดึงโพสต์ทั้งหมดที่มี category cid ตรงกับ param cid
router.get('/by-category/:cid', (req, res) => {
  const { cid } = req.params;

  // ตรวจสอบว่าได้รับค่า cid หรือไม่
  if (!cid) {
    return res.status(400).json({ error: 'Missing category id (cid)' });
  }

  // ดึงข้อมูลโพสต์ที่มี category ตรงกับ cid พร้อมข้อมูล user เจ้าของโพสต์
  const postSql = `
    SELECT 
      post.*, 
      user.uid, user.name, user.email, user.height, user.weight, 
      user.shirt_size, user.chest, user.waist_circumference, 
      user.hip, user.personal_description, user.profile_image
    FROM post
    JOIN user ON post.post_fk_uid = user.uid
    JOIN post_category pc ON post.post_id = pc.post_id_fk
    WHERE pc.category_id_fk = ?
    ORDER BY post.post_date DESC
  `;

  // เรียก query เพื่อดึงโพสต์ตาม category
  conn.query(postSql, [cid], (err, postResults) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Post query error' });
    }

    // กรณีไม่มีโพสต์ใน category นี้
    if (postResults.length === 0) {
      return res.status(404).json({ error: 'No posts found for this category' });
    }

    // ดึง post_id ทั้งหมดเพื่อนำไปใช้ query รูปภาพและหมวดหมู่ต่อ
    const postIds = postResults.map(post => post.post_id);

    // ดึงรูปภาพทั้งหมดของโพสต์ที่ match post_id
    const imageSql = `SELECT * FROM image_post WHERE image_fk_postid IN (?)`;
    conn.query(imageSql, [postIds], (err, imageResults) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Image query error' });
      }

      // ดึงหมวดหมู่ทั้งหมดของโพสต์ที่ match post_id
      const categorySql = `
        SELECT 
          pc.post_id_fk, 
          c.cid, c.cname, c.cimage, c.ctype
        FROM post_category pc
        JOIN category c ON pc.category_id_fk = c.cid
        WHERE pc.post_id_fk IN (?)
      `;

      // เรียก query หมวดหมู่
      conn.query(categorySql, [postIds], (err, categoryResults) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: 'Category query error' });
        }

        // รวมข้อมูลโพสต์, user, รูปภาพ, หมวดหมู่ เป็นอ็อบเจกต์เดียวกัน
        const postsWithData = postResults.map(post => {
          const images = imageResults.filter(img => img.image_fk_postid === post.post_id);
          const categories = categoryResults
            .filter(cat => cat.post_id_fk === post.post_id)
            .map(cat => ({
              cid: cat.cid,
              cname: cat.cname,
              cimage: cat.cimage,
              ctype: cat.ctype
            }));

          return {
            post: {
              post_id: post.post_id,
              post_topic: post.post_topic,
              post_description: post.post_description,
              amount_of_like: post.amount_of_like,
              amount_of_save: post.amount_of_save,
              amount_of_comment: post.amount_of_comment,
              post_date: post.post_date,
              post_fk_cid: post.post_fk_cid,
              post_fk_uid: post.post_fk_uid,
            },
            user: {
              uid: post.uid,
              name: post.name,
              email: post.email,
              height: post.height,
              weight: post.weight,
              shirt_size: post.shirt_size,
              chest: post.chest,
              waist_circumference: post.waist_circumference,
              hip: post.hip,
              personal_description: post.personal_description,
              profile_image: post.profile_image,
            },
            images,
            categories
          };
        });

        // ส่งข้อมูลโพสต์ทั้งหมดกลับไปใน response
        res.status(200).json(postsWithData);
      });
    });
  });
});


// API ดึงโพสต์ทั้งหมดที่ user กดไลก์ พร้อมข้อมูลครบถ้วนของโพสต์นั้น ๆ
router.get('/liked-posts/full/:user_id', (req, res) => {
  const { user_id } = req.params;

  // Query ดึงโพสต์ที่ user กดไลก์ พร้อมข้อมูล user เจ้าของโพสต์ และเวลาที่กดไลก์
  const likedPostSql = `
  SELECT 
    p.*, 
    u.uid, u.name, u.email, u.height, u.weight, 
    u.shirt_size, u.chest, u.waist_circumference, 
    u.hip, u.personal_description, u.profile_image,
    pl.created_at AS liked_at
  FROM post_likes pl
  JOIN post p ON pl.post_id_fk = p.post_id
  JOIN user u ON p.post_fk_uid = u.uid
  WHERE pl.user_id_fk = ?
  ORDER BY pl.created_at DESC
`;

  // เรียก query ดึงโพสต์ที่ถูกไลก์ทั้งหมดของ user นี้
  conn.query(likedPostSql, [user_id], (err, postResults) => {
    if (err) return res.status(500).json({ error: 'Post query failed' });

    // กรณี user นี้ยังไม่ได้กดไลก์โพสต์ใดเลย
    if (postResults.length === 0) {
      return res.status(404).json({ error: 'No liked posts found for this user' });
    }

    // ดึง post_id ทั้งหมดเพื่อ query รูปภาพ, หมวดหมู่, แฮชแท็ก และจำนวนไลก์
    const postIds = postResults.map(post => post.post_id);

    // ดึงรูปภาพของโพสต์ทั้งหมดที่ถูกไลก์
    const imageSql = `SELECT * FROM image_post WHERE image_fk_postid IN (?)`;
    conn.query(imageSql, [postIds], (err, imageResults) => {
      if (err) return res.status(500).json({ error: 'Image query failed' });

      // ดึงหมวดหมู่ทั้งหมดของโพสต์ที่ถูกไลก์
      const categorySql = `
        SELECT pc.post_id_fk, c.cid, c.cname, c.cimage, c.ctype
        FROM post_category pc
        JOIN category c ON pc.category_id_fk = c.cid
        WHERE pc.post_id_fk IN (?)
      `;
      conn.query(categorySql, [postIds], (err, categoryResults) => {
        if (err) return res.status(500).json({ error: 'Category query failed' });

        // ดึงแฮชแท็กทั้งหมดของโพสต์ที่ถูกไลก์
        const hashtagSql = `
          SELECT ph.post_id_fk, h.tag_id, h.tag_name
          FROM post_hashtags ph
          JOIN hashtags h ON ph.hashtag_id_fk = h.tag_id
          WHERE ph.post_id_fk IN (?)
        `;
        conn.query(hashtagSql, [postIds], (err, hashtagResults) => {
          if (err) return res.status(500).json({ error: 'Hashtag query failed' });

          // ดึงจำนวนไลก์ทั้งหมดของแต่ละโพสต์
          const likeSql = `
            SELECT post_id_fk AS post_id, COUNT(*) AS like_count
            FROM post_likes
            GROUP BY post_id_fk
          `;
          conn.query(likeSql, (err, likeResults) => {
            if (err) return res.status(500).json({ error: 'Like count query failed' });

            // สร้าง map สำหรับเก็บจำนวนไลก์ของแต่ละโพสต์
            const likeMap = {};
            likeResults.forEach(l => {
              likeMap[l.post_id] = l.like_count;
            });

            // รวมข้อมูลโพสต์, user, รูปภาพ, หมวดหมู่, แฮชแท็ก และจำนวนไลก์ เป็นอ็อบเจกต์เดียวกัน
            const postsWithData = postResults.map(post => {
              const images = imageResults.filter(img => img.image_fk_postid === post.post_id);
              const categories = categoryResults
                .filter(cat => cat.post_id_fk === post.post_id)
                .map(cat => ({
                  cid: cat.cid,
                  cname: cat.cname,
                  cimage: cat.cimage,
                  ctype: cat.ctype
                }));
              const hashtags = hashtagResults
                .filter(ht => ht.post_id_fk === post.post_id)
                .map(ht => ({
                  tag_id: ht.tag_id,
                  tag_name: ht.tag_name
                }));

              return {
                post: {
                  post_id: post.post_id,
                  post_topic: post.post_topic,
                  post_description: post.post_description,
                  post_date: post.post_date,
                  post_fk_cid: post.post_fk_cid,
                  post_fk_uid: post.post_fk_uid,
                  amount_of_like: likeMap[post.post_id] || 0,
                  amount_of_save: post.amount_of_save,
                  amount_of_comment: post.amount_of_comment
                },
                user: {
                  uid: post.uid,
                  name: post.name,
                  email: post.email,
                  height: post.height,
                  weight: post.weight,
                  shirt_size: post.shirt_size,
                  chest: post.chest,
                  waist_circumference: post.waist_circumference,
                  hip: post.hip,
                  personal_description: post.personal_description,
                  profile_image: post.profile_image
                },
                images,
                categories,
                hashtags
              };
            });

            // ส่งข้อมูลโพสต์ทั้งหมดที่ user กดไลก์กลับไป
            res.status(200).json(postsWithData);
          });
        });
      });
    });
  });
});

// API GET /saved-posts/full/:user_id
router.get('/saved-posts/full/:user_id', (req, res) => {
  const { user_id } = req.params;

  // Query ดึงโพสต์ที่ user กด save พร้อมข้อมูล user เจ้าของโพสต์ และเวลาที่กด save
  const savedPostSql = `
    SELECT 
      p.*, 
      u.uid, u.name, u.email, u.height, u.weight, 
      u.shirt_size, u.chest, u.waist_circumference, 
      u.hip, u.personal_description, u.profile_image,
      ps.created_at AS saved_at
    FROM post_saves ps
    JOIN post p ON ps.post_id_fk = p.post_id
    JOIN user u ON p.post_fk_uid = u.uid
    WHERE ps.user_id_fk = ?
    ORDER BY ps.created_at DESC
  `;

  // เรียก query ดึงโพสต์ที่ถูกบันทึกทั้งหมดของ user นี้
  conn.query(savedPostSql, [user_id], (err, postResults) => {
    if (err) return res.status(500).json({ error: 'Post query failed' });

    // กรณี user นี้ยังไม่ได้บันทึกโพสต์ใดเลย
    if (postResults.length === 0) {
      return res.status(404).json({ error: 'No saved posts found for this user' });
    }

    const postIds = postResults.map(post => post.post_id);

    // ดึงรูปภาพของโพสต์ทั้งหมดที่ถูกบันทึก
    const imageSql = `SELECT * FROM image_post WHERE image_fk_postid IN (?)`;
    conn.query(imageSql, [postIds], (err, imageResults) => {
      if (err) return res.status(500).json({ error: 'Image query failed' });

      // ดึงหมวดหมู่ทั้งหมดของโพสต์ที่ถูกบันทึก
      const categorySql = `
        SELECT pc.post_id_fk, c.cid, c.cname, c.cimage, c.ctype
        FROM post_category pc
        JOIN category c ON pc.category_id_fk = c.cid
        WHERE pc.post_id_fk IN (?)
      `;
      conn.query(categorySql, [postIds], (err, categoryResults) => {
        if (err) return res.status(500).json({ error: 'Category query failed' });

        // ดึงแฮชแท็กทั้งหมดของโพสต์ที่ถูกบันทึก
        const hashtagSql = `
          SELECT ph.post_id_fk, h.tag_id, h.tag_name
          FROM post_hashtags ph
          JOIN hashtags h ON ph.hashtag_id_fk = h.tag_id
          WHERE ph.post_id_fk IN (?)
        `;
        conn.query(hashtagSql, [postIds], (err, hashtagResults) => {
          if (err) return res.status(500).json({ error: 'Hashtag query failed' });

          // ดึงจำนวนไลก์ทั้งหมดของแต่ละโพสต์
          const likeSql = `
            SELECT post_id_fk AS post_id, COUNT(*) AS like_count
            FROM post_likes
            GROUP BY post_id_fk
          `;
          conn.query(likeSql, (err, likeResults) => {
            if (err) return res.status(500).json({ error: 'Like count query failed' });

            // สร้าง map สำหรับเก็บจำนวนไลก์ของแต่ละโพสต์
            const likeMap = {};
            likeResults.forEach(l => {
              likeMap[l.post_id] = l.like_count;
            });

            // รวมข้อมูลโพสต์, user, รูปภาพ, หมวดหมู่, แฮชแท็ก, จำนวนไลก์ และเวลาที่ save เป็นอ็อบเจกต์เดียวกัน
            const postsWithData = postResults.map(post => {
              const images = imageResults.filter(img => img.image_fk_postid === post.post_id);
              const categories = categoryResults
                .filter(cat => cat.post_id_fk === post.post_id)
                .map(cat => ({
                  cid: cat.cid,
                  cname: cat.cname,
                  cimage: cat.cimage,
                  ctype: cat.ctype
                }));
              const hashtags = hashtagResults
                .filter(ht => ht.post_id_fk === post.post_id)
                .map(ht => ({
                  tag_id: ht.tag_id,
                  tag_name: ht.tag_name
                }));

              return {
                post: {
                  post_id: post.post_id,
                  post_topic: post.post_topic,
                  post_description: post.post_description,
                  post_date: post.post_date,
                  post_fk_cid: post.post_fk_cid,
                  post_fk_uid: post.post_fk_uid,
                  amount_of_like: likeMap[post.post_id] || 0,
                  amount_of_save: post.amount_of_save,
                  amount_of_comment: post.amount_of_comment,
                },
                user: {
                  uid: post.uid,
                  name: post.name,
                  email: post.email,
                  height: post.height,
                  weight: post.weight,
                  shirt_size: post.shirt_size,
                  chest: post.chest,
                  waist_circumference: post.waist_circumference,
                  hip: post.hip,
                  personal_description: post.personal_description,
                  profile_image: post.profile_image,
                },
                images,
                categories,
                hashtags,
                saved_at: post.saved_at  // เพิ่มเวลาที่ save เข้ามาด้วย
              };
            });

            // ส่งข้อมูลโพสต์ทั้งหมดที่ user บันทึกกลับไป
            res.status(200).json(postsWithData);
          });
        });
      });
    });
  });
});


// --------------------------------------------
// API GET /following-posts/:user_id
// ดึงโพสต์ทั้งหมดของคนที่ user กำลังติดตาม พร้อมข้อมูลครบถ้วน
// (ทำแบบเดียวกับ API /get แต่แสดงเฉพาะโพสต์ของคนที่ติดตาม)
// --------------------------------------------
router.get('/following-posts/:user_id', (req, res) => {
  const { user_id } = req.params;

  if (!user_id) {
    return res.status(400).json({ error: 'Missing user_id parameter' });
  }

  try {
    // Query ดึงโพสต์ของคนที่เรากำลังติดตาม พร้อมข้อมูลผู้ใช้
    const postSql = `
      SELECT 
        post.*, 
        user.uid, user.name, user.email, user.height, user.weight, 
        user.shirt_size, user.chest, user.waist_circumference, 
        user.hip, user.personal_description, user.profile_image
      FROM post
      JOIN user ON post.post_fk_uid = user.uid
      JOIN user_followers uf ON user.uid = uf.following_id
      WHERE uf.follower_id = ?
      ORDER BY DATE(post.post_date) DESC, TIME(post.post_date) DESC
    `;

    conn.query(postSql, [user_id], (err, postResults) => {
      if (err) return res.status(400).json({ error: 'Post query error' });

      if (postResults.length === 0)
        return res.status(404).json({ error: 'No posts found from people you follow' });

      // ดึงรูปภาพทั้งหมดจากตาราง image_post
      const imageSql = `SELECT * FROM image_post`;
      conn.query(imageSql, (err, imageResults) => {
        if (err) return res.status(400).json({ error: 'Image query error' });

        // ดึงหมวดหมู่ของโพสต์จากตาราง post_category และ category
        const categorySql = `
          SELECT pc.post_id_fk, c.cid, c.cname, c.cimage, c.ctype
          FROM post_category pc
          JOIN category c ON pc.category_id_fk = c.cid
        `;
        conn.query(categorySql, (err, categoryResults) => {
          if (err) return res.status(400).json({ error: 'Category query error' });

          // ดึงแฮชแท็กของโพสต์จาก post_hashtags และ hashtags
          const hashtagSql = `
            SELECT ph.post_id_fk, h.tag_id, h.tag_name 
            FROM post_hashtags ph
            JOIN hashtags h ON ph.hashtag_id_fk = h.tag_id
          `;
          conn.query(hashtagSql, (err, hashtagResults) => {
            if (err) return res.status(400).json({ error: 'Hashtag query error' });

            // ดึงจำนวนไลก์แต่ละโพสต์จากตาราง post_likes
            const likeSql = `
              SELECT post_id_fk AS post_id, COUNT(*) AS like_count 
              FROM post_likes 
              GROUP BY post_id_fk
            `;
            conn.query(likeSql, (err, likeResults) => {
              if (err) return res.status(400).json({ error: 'Like count query error' });

              // สร้างแผนที่จำนวนไลก์สำหรับแต่ละโพสต์
              const likeMap = {};
              likeResults.forEach(item => {
                likeMap[item.post_id] = item.like_count;
              });

              // รวมข้อมูลโพสต์, ผู้ใช้, รูปภาพ, หมวดหมู่, แฮชแท็ก, และจำนวนไลก์
              const postsWithData = postResults.map(post => {
                const images = imageResults.filter(img => img.image_fk_postid === post.post_id);
                const categories = categoryResults
                  .filter(cat => cat.post_id_fk === post.post_id)
                  .map(cat => ({
                    cid: cat.cid,
                    cname: cat.cname,
                    cimage: cat.cimage,
                    ctype: cat.ctype
                  }));

                const hashtags = hashtagResults
                  .filter(ht => ht.post_id_fk === post.post_id)
                  .map(ht => ({
                    tag_id: ht.tag_id,
                    tag_name: ht.tag_name
                  }));

                return {
                  post: {
                    post_id: post.post_id,
                    post_topic: post.post_topic,
                    post_description: post.post_description,
                    post_date: post.post_date,
                    post_fk_uid: post.post_fk_uid,
                    amount_of_like: likeMap[post.post_id] || 0, // จำนวนไลก์
                    amount_of_save: post.amount_of_save,
                    amount_of_comment: post.amount_of_comment,
                  },
                  user: {
                    uid: post.uid,
                    name: post.name,
                    email: post.email,
                    height: post.height,
                    weight: post.weight,
                    shirt_size: post.shirt_size,
                    chest: post.chest,
                    waist_circumference: post.waist_circumference,
                    hip: post.hip,
                    personal_description: post.personal_description,
                    profile_image: post.profile_image
                  },
                  images,
                  categories,
                  hashtags
                };
              });

              // ส่งข้อมูลโพสต์ทั้งหมดของคนที่ติดตามกลับไป
              res.status(200).json(postsWithData);
            });
          });
        });
      });
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PUT หรือ PATCH สำหรับอัพเดตสถานะอ่าน notification
// API อัปเดต is_read ของ notification
router.put('/notification/read/:notification_id', (req, res) => {
  const notificationId = req.params.notification_id;
  const userId = req.body.userId; // userId ของผู้รับ notification (จำเป็นสำหรับ Firebase path)

  if (!notificationId || !userId) {
    return res.status(400).json({ error: 'notification_id and userId are required' });
  }

  // อัปเดตสถานะ is_read ใน MySQL
  const sql = 'UPDATE notifications SET is_read = 1 WHERE notification_id = ?';
  conn.query(sql, [notificationId], (err, result) => {
    if (err) {
      console.error('MySQL update error:', err);
      return res.status(500).json({ error: 'Database update error' });
    }

    // อัปเดตสถานะ is_read ใน Firebase Realtime Database
    const db = admin.database();
    const ref = db.ref(`notifications/${userId}/${notificationId}`);

    ref.update({ is_read: 1 })
      .then(() => {
        res.json({ message: 'Notification marked as read in MySQL and Firebase' });
      })
      .catch((firebaseError) => {
        console.error('Firebase update error:', firebaseError);
        res.status(500).json({ error: 'Firebase update error' });
      });
  });
});




















