var express = require('express');
var router = express.Router();
var conn = require('../dbconnect')


module.exports = router;
// --------------------------------------------
// API GET /get
// ดึงโพสต์ทั้งหมด พร้อมข้อมูลผู้ใช้ รูปภาพ หมวดหมู่ แฮชแท็ก และจำนวนไลก์
// เรียง feed: โพสต์คนอื่นใกล้เคียงสลับกับโพสต์ล่าสุด
// --------------------------------------------
router.get("/get", (req, res) => {
  try {
    const targetUid = req.query.uid;

    if (!targetUid) {
      return res.status(400).json({ error: "Target uid is required" });
    }

    const userSql = `SELECT * FROM user WHERE uid = ?`;
    conn.query(userSql, [targetUid], (err, targetResults) => {
      if (err) return res.status(400).json({ error: 'Target user query error' });
      if (targetResults.length === 0) return res.status(404).json({ error: 'Target user not found' });

      const targetUser = targetResults[0];

      const postSql = `
        SELECT 
          post.*, 
          user.uid, user.name, user.email, 
          user.personal_description, user.profile_image,
          user.height, user.weight, user.shirt_size, 
          user.chest, user.waist_circumference, user.hip,
          CASE WHEN user.uid = ? THEN 1 ELSE 0 END as is_own_post
        FROM post
        JOIN user ON post.post_fk_uid = user.uid
      `;

      conn.query(postSql, [targetUid], (err, postResults) => {
        if (err) return res.status(400).json({ error: 'Post query error' });
        if (postResults.length === 0) return res.status(404).json({ error: 'No posts found' });

        const imageSql = `SELECT * FROM image_post`;
        conn.query(imageSql, (err, imageResults) => {
          if (err) return res.status(400).json({ error: 'Image query error' });

          const categorySql = `
            SELECT pc.post_id_fk, c.cid, c.cname, c.cimage, c.ctype
            FROM post_category pc
            JOIN category c ON pc.category_id_fk = c.cid
          `;
          conn.query(categorySql, (err, categoryResults) => {
            if (err) return res.status(400).json({ error: 'Category query error' });

            const hashtagSql = `
              SELECT ph.post_id_fk, h.tag_id, h.tag_name 
              FROM post_hashtags ph
              JOIN hashtags h ON ph.hashtag_id_fk = h.tag_id
            `;
            conn.query(hashtagSql, (err, hashtagResults) => {
              if (err) return res.status(400).json({ error: 'Hashtag query error' });

              const likeSql = `
                SELECT post_id_fk AS post_id, COUNT(*) AS like_count 
                FROM post_likes 
                GROUP BY post_id_fk
              `;
              conn.query(likeSql, (err, likeResults) => {
                if (err) return res.status(400).json({ error: 'Like count query error' });

                const likeMap = {};
                likeResults.forEach(item => likeMap[item.post_id] = item.like_count);

                const sizeMap = { XS: 1, S: 2, M: 3, L: 4, XL: 5, XXL: 6 };
                function calcDistance(u1, u2) {
                  const shirt1 = sizeMap[u1.shirt_size] || 0;
                  const shirt2 = sizeMap[u2.shirt_size] || 0;

                  return Math.sqrt(
                    Math.pow((u1.height || 0) - (u2.height || 0), 2) +
                    Math.pow((u1.weight || 0) - (u2.weight || 0), 2) +
                    Math.pow((u1.chest || 0) - (u2.chest || 0), 2) +
                    Math.pow((u1.waist_circumference || 0) - (u2.waist_circumference || 0), 2) +
                    Math.pow((u1.hip || 0) - (u2.hip || 0), 2) +
                    Math.pow(shirt1 - shirt2, 2)
                  );
                }

                const postsWithData = postResults.map(post => {
                  const images = imageResults.filter(img => img.image_fk_postid === post.post_id);
                  const categories = categoryResults
                    .filter(cat => cat.post_id_fk === post.post_id)
                    .map(cat => ({ cid: cat.cid, cname: cat.cname, cimage: cat.cimage, ctype: cat.ctype }));
                  const hashtags = hashtagResults
                    .filter(ht => ht.post_id_fk === post.post_id)
                    .map(ht => ({ tag_id: ht.tag_id, tag_name: ht.tag_name }));

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
                      profile_image: post.profile_image,
                      height: post.height,
                      weight: post.weight,
                      shirt_size: post.shirt_size,
                      chest: post.chest,
                      waist_circumference: post.waist_circumference,
                      hip: post.hip
                    },
                    images,
                    categories,
                    hashtags,
                    similarity_distance: post.is_own_post ? -1 : calcDistance(post, targetUser),
                    is_own_post: post.is_own_post
                  };
                });

                // -----------------------------------
                // แยกโพสต์คนอื่น
                // -----------------------------------
                const otherPostsClose = postsWithData
                  .filter(p => !p.is_own_post && p.similarity_distance <= 10)
                  .sort((a, b) => a.similarity_distance - b.similarity_distance);

                const otherPostsFar = postsWithData
                  .filter(p => !p.is_own_post && p.similarity_distance > 10)
                  .sort((a, b) => new Date(b.post.post_date) - new Date(a.post.post_date));

                // สลับโพสต์ใกล้เคียงกับโพสต์ล่าสุด
                function interleavePosts(arr1, arr2) {
                  const result = [];
                  const maxLength = Math.max(arr1.length, arr2.length);
                  for (let i = 0; i < maxLength; i++) {
                    if (i < arr1.length) result.push(arr1[i]);
                    if (i < arr2.length) result.push(arr2[i]);
                  }
                  return result;
                }

                const finalPosts = interleavePosts(otherPostsClose, otherPostsFar);

                // ส่งผลลัพธ์
                res.status(200).json(finalPosts);
              });
            });
          });
        });
      });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
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


router.post('/post/add', async (req, res) => {
  try {
    let { post_topic, post_description, post_fk_uid, images, category_id_fk, hashtags, post_status, analysis } = req.body;
    post_topic = post_topic?.trim() || null;
    post_description = post_description?.trim() || null;
    post_status = (post_status?.toLowerCase() === 'friends') ? 'friends' : 'public';

    if (!post_fk_uid || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Insert post
    const postResult = await new Promise((resolve, reject) => {
      const sql = `INSERT INTO post (post_topic, post_description, post_date, post_fk_uid, post_status) 
                   VALUES (?, ?, NOW(), ?, ?)`;
      conn.query(sql, [post_topic, post_description, post_fk_uid, post_status],
        (err, result) => err ? reject(err) : resolve(result)
      );
    });

    const insertedPostId = postResult.insertId;

    // Insert images
    if (images.length > 0) {
      const sql = `INSERT INTO image_post (image, image_fk_postid) VALUES ?`;
      const values = images.map(img => [img, insertedPostId]);
      await new Promise((resolve, reject) =>
        conn.query(sql, [values], (err) => err ? reject(err) : resolve())
      );
    }

    // Insert analysis (จาก Flutter Vision API)
    if (Array.isArray(analysis) && analysis.length > 0) {
      for (const item of analysis) {
        const { image_url, analysis_text } = item;
        if (!image_url || !analysis_text) continue;

        const analysisSql = `
          INSERT INTO post_image_analysis (post_id_fk, image_url, analysis_text, created_at)
          VALUES (?, ?, ?, NOW())
        `;
        await new Promise((resolve, reject) =>
          conn.query(analysisSql, [insertedPostId, image_url, analysis_text], (err) =>
            err ? reject(err) : resolve()
          )
        );
      }
    }

    // Insert categories
    if (Array.isArray(category_id_fk) && category_id_fk.length > 0) {
      const sql = `INSERT INTO post_category (category_id_fk, post_id_fk) VALUES ?`;
      const values = category_id_fk.map(cid => [cid, insertedPostId]);
      await new Promise((resolve, reject) =>
        conn.query(sql, [values], (err) => err ? reject(err) : resolve())
      );
    }

    // Insert hashtags
    if (Array.isArray(hashtags) && hashtags.length > 0) {
      const sql = `INSERT INTO post_hashtags (post_id_fk, hashtag_id_fk) VALUES ?`;
      const values = hashtags.map(tagId => [insertedPostId, tagId]);
      await new Promise((resolve, reject) =>
        conn.query(sql, [values], (err) => err ? reject(err) : resolve())
      );
    }

    // Response data (ตัดมาเฉพาะ post + images + analysis)
    const postData = await new Promise((resolve, reject) => {
      const sql = `SELECT * FROM post WHERE post_id = ?`;
      conn.query(sql, [insertedPostId], (err, results) => err ? reject(err) : resolve(results[0]));
    });

    const imageResults = await new Promise((resolve, reject) =>
      conn.query(`SELECT * FROM image_post WHERE image_fk_postid = ?`, [insertedPostId], (err, results) => err ? reject(err) : resolve(results))
    );

    const analysisResults = await new Promise((resolve, reject) =>
      conn.query(`SELECT * FROM post_image_analysis WHERE post_id_fk = ?`, [insertedPostId],
        (err, results) => err ? reject(err) : resolve(results)
      )
    );

    res.status(201).json({
      message: 'Post created',
      post: postData,
      images: imageResults,
      analysis: analysisResults
    });

  } catch (error) {
    console.error('❌ Post creation failed', error);
    res.status(500).json({ error: 'Internal server error' });
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

  post_id = parseInt(post_id, 10);
  if (isNaN(post_id)) {
    return res.status(400).json({ error: "Invalid post_id" });
  }

  try {
    const postSql = `
      SELECT 
        post.*, 
        user.uid, user.name, user.email, 
        user.personal_description, user.profile_image
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

  if (!cid) {
    return res.status(400).json({ error: 'Missing category id (cid)' });
  }

  const postSql = `
    SELECT 
      post.*, 
      user.uid, user.name, user.email, 
      user.personal_description, user.profile_image
    FROM post
    JOIN user ON post.post_fk_uid = user.uid
    JOIN post_category pc ON post.post_id = pc.post_id_fk
    WHERE pc.category_id_fk = ?
    ORDER BY post.post_date DESC
  `;

  conn.query(postSql, [cid], (err, postResults) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Post query error' });
    }

    if (postResults.length === 0) {
      return res.status(404).json({ error: 'No posts found for this category' });
    }

    const postIds = postResults.map(post => post.post_id);

    const imageSql = `SELECT * FROM image_post WHERE image_fk_postid IN (?)`;
    conn.query(imageSql, [postIds], (err, imageResults) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Image query error' });
      }

      const categorySql = `
        SELECT 
          pc.post_id_fk, 
          c.cid, c.cname, c.cimage, c.ctype
        FROM post_category pc
        JOIN category c ON pc.category_id_fk = c.cid
        WHERE pc.post_id_fk IN (?)
      `;

      conn.query(categorySql, [postIds], (err, categoryResults) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: 'Category query error' });
        }

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
              personal_description: post.personal_description,
              profile_image: post.profile_image,
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


// API ดึงโพสต์ทั้งหมดที่ user กดไลก์ พร้อมข้อมูลครบถ้วนของโพสต์นั้น ๆ
router.get('/liked-posts/full/:user_id', (req, res) => {
  const { user_id } = req.params;

  const likedPostSql = `
  SELECT 
    p.*, 
    u.uid, u.name, u.email, 
    u.personal_description, u.profile_image,
    pl.created_at AS liked_at
  FROM post_likes pl
  JOIN post p ON pl.post_id_fk = p.post_id
  JOIN \`user\` u ON p.post_fk_uid = u.uid
  WHERE pl.user_id_fk = ?
  ORDER BY pl.created_at DESC
  `;

  conn.query(likedPostSql, [user_id], (err, postResults) => {
    if (err) return res.status(500).json({ error: 'Post query failed' });

    if (postResults.length === 0) {
      return res.status(404).json({ error: 'No liked posts found for this user' });
    }

    const postIds = postResults.map(post => post.post_id);

    const imageSql = `SELECT * FROM image_post WHERE image_fk_postid IN (?)`;
    conn.query(imageSql, [postIds], (err, imageResults) => {
      if (err) return res.status(500).json({ error: 'Image query failed' });

      const categorySql = `
        SELECT pc.post_id_fk, c.cid, c.cname, c.cimage, c.ctype
        FROM post_category pc
        JOIN category c ON pc.category_id_fk = c.cid
        WHERE pc.post_id_fk IN (?)
      `;
      conn.query(categorySql, [postIds], (err, categoryResults) => {
        if (err) return res.status(500).json({ error: 'Category query failed' });

        const hashtagSql = `
          SELECT ph.post_id_fk, h.tag_id, h.tag_name
          FROM post_hashtags ph
          JOIN hashtags h ON ph.hashtag_id_fk = h.tag_id
          WHERE ph.post_id_fk IN (?)
        `;
        conn.query(hashtagSql, [postIds], (err, hashtagResults) => {
          if (err) return res.status(500).json({ error: 'Hashtag query failed' });

          const likeSql = `
            SELECT post_id_fk AS post_id, COUNT(*) AS like_count
            FROM post_likes
            GROUP BY post_id_fk
          `;
          conn.query(likeSql, (err, likeResults) => {
            if (err) return res.status(500).json({ error: 'Like count query failed' });

            const likeMap = {};
            likeResults.forEach(l => {
              likeMap[l.post_id] = l.like_count;
            });

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
                  personal_description: post.personal_description,
                  profile_image: post.profile_image
                },
                images,
                categories,
                hashtags
              };
            });

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

  const savedPostSql = `
    SELECT 
      p.*, 
      u.uid, u.name, u.email, 
      u.personal_description, u.profile_image,
      ps.created_at AS saved_at
    FROM post_saves ps
    JOIN post p ON ps.post_id_fk = p.post_id
    JOIN user u ON p.post_fk_uid = u.uid
    WHERE ps.user_id_fk = ?
    ORDER BY ps.created_at DESC
  `;

  conn.query(savedPostSql, [user_id], (err, postResults) => {
    if (err) return res.status(500).json({ error: 'Post query failed' });

    if (postResults.length === 0) {
      return res.status(404).json({ error: 'No saved posts found for this user' });
    }

    const postIds = postResults.map(post => post.post_id);

    const imageSql = `SELECT * FROM image_post WHERE image_fk_postid IN (?)`;
    conn.query(imageSql, [postIds], (err, imageResults) => {
      if (err) return res.status(500).json({ error: 'Image query failed' });

      const categorySql = `
        SELECT pc.post_id_fk, c.cid, c.cname, c.cimage, c.ctype
        FROM post_category pc
        JOIN category c ON pc.category_id_fk = c.cid
        WHERE pc.post_id_fk IN (?)
      `;
      conn.query(categorySql, [postIds], (err, categoryResults) => {
        if (err) return res.status(500).json({ error: 'Category query failed' });

        const hashtagSql = `
          SELECT ph.post_id_fk, h.tag_id, h.tag_name
          FROM post_hashtags ph
          JOIN hashtags h ON ph.hashtag_id_fk = h.tag_id
          WHERE ph.post_id_fk IN (?)
        `;
        conn.query(hashtagSql, [postIds], (err, hashtagResults) => {
          if (err) return res.status(500).json({ error: 'Hashtag query failed' });

          const likeSql = `
            SELECT post_id_fk AS post_id, COUNT(*) AS like_count
            FROM post_likes
            GROUP BY post_id_fk
          `;
          conn.query(likeSql, (err, likeResults) => {
            if (err) return res.status(500).json({ error: 'Like count query failed' });

            const likeMap = {};
            likeResults.forEach(l => {
              likeMap[l.post_id] = l.like_count;
            });

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
                  personal_description: post.personal_description,
                  profile_image: post.profile_image,
                },
                images,
                categories,
                hashtags,
                saved_at: post.saved_at
              };
            });

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
    // Query ดึงโพสต์ของคนที่เรากำลังติดตาม พร้อมข้อมูลผู้ใช้ (ตัดข้อมูลส่วนสูง น้ำหนัก และขนาดต่างๆ ออก)
    const postSql = `
      SELECT 
        post.*, 
        user.uid, user.name, user.email, 
        user.personal_description, user.profile_image
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
                    amount_of_like: likeMap[post.post_id] || 0,
                    amount_of_save: post.amount_of_save,
                    amount_of_comment: post.amount_of_comment,
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

// --------------------------------------------
// API POST /comment
// เพิ่ม comment ลงโพสต์
// --------------------------------------------
// POST /comment
router.post('/comment', (req, res) => {
  const { user_id, post_id, comment_text } = req.body;

  console.log('[Comment] Request body:', req.body);

  if (!user_id || !post_id || !comment_text) {
    console.log('[Comment] Missing user_id, post_id, or comment_text');
    return res.status(400).json({ error: 'user_id, post_id, and comment_text are required' });
  }

  // 1️⃣ Insert comment ลงฐานข้อมูล
  const insertSql = `
      INSERT INTO post_comments (user_id_fk, post_id_fk, comment_text)
      VALUES (?, ?, ?)
    `;

  conn.query(insertSql, [user_id, post_id, comment_text], (err, result) => {
    if (err) {
      console.log('[Comment] Insert comment failed:', err);
      return res.status(500).json({ error: 'Comment insert failed' });
    }

    const comment_id = result.insertId;
    console.log(`[Comment] User ${user_id} commented on post ${post_id} (comment_id: ${comment_id})`);

    // 2️⃣ หาว่าเจ้าของโพสต์เป็นใคร
    const ownerSql = 'SELECT post_fk_uid FROM post WHERE post_id = ?';

    console.log('[Comment] Querying post owner for post_id:', post_id);

    conn.query(ownerSql, [post_id], (err2, ownerResult) => {
      if (err2) {
        console.log('[Comment] Get post owner failed:', err2);
        return res.status(500).json({ error: 'Get post owner failed' });
      }

      console.log('[Comment] Post owner query result:', ownerResult);

      if (ownerResult.length > 0) {
        const receiver_uid = ownerResult[0].post_fk_uid;

        console.log('[Comment] Post owner (receiver_uid):', receiver_uid);
        console.log('[Comment] Comment author (user_id):', user_id);
        console.log('[Comment] Should create notification?', receiver_uid !== user_id);

        // ไม่ส่ง notification ถ้าเจ้าของโพสต์คอมเมนต์ตัวเอง
        if (receiver_uid !== user_id) {
          const message = 'ได้คอมเมนต์โพสต์ของคุณ';

          console.log('[Comment] Creating notification...');

          // 🔹 Insert notification ลง MySQL
          const notifSql = `
              INSERT INTO notifications (sender_uid, receiver_uid, post_id, type, message, is_read)
              VALUES (?, ?, ?, 'comment', ?, 0)
            `;

          const notifValues = [user_id, receiver_uid, post_id, message];
          console.log('[Comment] Notification SQL:', notifSql);
          console.log('[Comment] Notification values:', notifValues);

          conn.query(notifSql, notifValues, (err3, result3) => {
            if (err3) {
              console.log('[Comment] Notification insert failed (MySQL):', err3);
              console.log('[Comment] Error details:', {
                code: err3.code,
                errno: err3.errno,
                sqlMessage: err3.sqlMessage,
                sqlState: err3.sqlState
              });
            } else {
              console.log('[Comment] ✅ Notification inserted in MySQL with ID:', result3.insertId);
              console.log('[Comment] Insert result:', result3);
            }
          });

          // 🔹 Insert notification ลง Firebase Realtime Database
          const notifData = {
            sender_uid: user_id,
            receiver_uid: receiver_uid,
            post_id: post_id,
            type: 'comment',
            message: message,
            is_read: false,
            created_at: admin.database.ServerValue.TIMESTAMP
          };

          const db = admin.database();
          const notifRef = db.ref('notifications').push();

          notifRef.set(notifData)
            .then(() => {
              console.log('[Comment] ✅ Notification added to Firebase with key:', notifRef.key);
            })
            .catch((firebaseErr) => {
              console.log('[Comment] Firebase notification insert failed:', firebaseErr);
            });

        } else {
          console.log('[Comment] 🚫 Skipping notification - user commented on own post');
        }
      } else {
        console.log('[Comment] ⚠️  No post found with post_id:', post_id);
      }

      // ส่ง response กลับ
      console.log('[Comment] Sending response...');
      res.status(200).json({
        message: 'Comment added',
        comment_id: comment_id,
        debug: {
          user_id,
          post_id,
          owner_found: ownerResult.length > 0,
          owner_uid: ownerResult.length > 0 ? ownerResult[0].post_fk_uid : null,
          should_notify: ownerResult.length > 0 && ownerResult[0].post_fk_uid !== user_id
        }
      });
    });
  });
});



// --------------------------------------------
// API POST /delete-comment
// ลบ comment
// --------------------------------------------
router.post('/delete-comment', (req, res) => {
  const { comment_id, user_id, post_id } = req.body;

  if (!comment_id || !user_id || !post_id) {
    return res.status(400).json({ error: 'comment_id, user_id, และ post_id จำเป็น' });
  }

  const checkCommentSql = `
      SELECT 
        pc.comment_id,
        pc.user_id_fk AS comment_user_id,
        p.post_fk_uid AS post_user_id
      FROM post_comments pc
      JOIN post p ON pc.post_id_fk = p.post_id
      WHERE pc.comment_id = ? AND pc.post_id_fk = ?
    `;

  conn.query(checkCommentSql, [comment_id, post_id], (err, results) => {
    if (err) {
      console.log('[Delete Comment] SQL Error:', err);
      return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการตรวจสอบ' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'Comment not found or not yours' });
    }

    const { comment_user_id, post_user_id } = results[0];
    const isCommentOwner = user_id.toString() === comment_user_id.toString();
    const isPostOwner = user_id.toString() === post_user_id.toString();

    if (!isCommentOwner && !isPostOwner) {
      return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ลบความคิดเห็นนี้' });
    }

    const deleteSql = 'DELETE FROM post_comments WHERE comment_id = ?';
    conn.query(deleteSql, [comment_id], (err, result) => {
      if (err || result.affectedRows === 0) {
        console.log('[Delete Comment] Delete Error:', err);
        return res.status(500).json({ error: 'ลบความคิดเห็นไม่สำเร็จ' });
      }

      const deletedBy = isCommentOwner ? 'เจ้าของความคิดเห็น' : 'เจ้าของโพสต์';
      console.log(`[Delete Comment] Comment ${comment_id} deleted by User ${user_id} (${deletedBy})`);

      return res.status(200).json({
        message: 'ลบความคิดเห็นสำเร็จ',
        deletedCommentId: comment_id,
        deletedBy: deletedBy
      });
    });
  });
});

router.put('/edit-comment/:comment_id', (req, res) => {
  const { comment_id } = req.params;
  const { user_id, post_id, comment_text } = req.body;

  // ตรวจสอบ parameter
  if (!comment_id || !user_id || !post_id || !comment_text) {
    console.log('[Edit Comment] Missing required fields');
    return res.status(400).json({
      error: 'comment_id, user_id, post_id, และ comment_text จำเป็น'
    });
  }

  // ตรวจสอบความยาวของข้อความ
  const trimmedText = comment_text.trim();
  if (trimmedText.length === 0) {
    return res.status(400).json({
      error: 'ข้อความความคิดเห็นไม่สามารถว่างได้'
    });
  }

  if (trimmedText.length > 1000) {
    return res.status(400).json({
      error: 'ข้อความความคิดเห็นต้องไม่เกิน 1000 ตัวอักษร'
    });
  }

  // Step 1: ตรวจสอบว่าความคิดเห็นนี้เป็นของผู้ใช้หรือไม่
  const checkCommentSql = `
      SELECT 
        pc.comment_id,
        pc.user_id_fk AS comment_user_id,
        pc.post_id_fk,
        p.post_fk_uid AS post_user_id
      FROM post_comments pc
      JOIN post p ON pc.post_id_fk = p.post_id
      WHERE pc.comment_id = ? AND pc.post_id_fk = ?
    `;

  conn.query(checkCommentSql, [comment_id, post_id], (err, results) => {
    if (err) {
      console.log('[Edit Comment] Query Error:', err);
      return res.status(500).json({
        error: 'เกิดข้อผิดพลาดในการตรวจสอบ'
      });
    }

    // ไม่พบ comment
    if (results.length === 0) {
      console.log(
        `[Edit Comment] Comment ${comment_id} not found in post ${post_id}`
      );
      return res.status(404).json({
        error: 'ไม่พบความคิดเห็น'
      });
    }

    const { comment_user_id, post_user_id } = results[0];

    // Step 2: ตรวจสอบสิทธิ์
    // ต้องเป็นเจ้าของความคิดเห็น หรือ เจ้าของโพสต์
    const isCommentOwner = parseInt(user_id) === parseInt(comment_user_id);
    const isPostOwner = parseInt(user_id) === parseInt(post_user_id);

    if (!isCommentOwner && !isPostOwner) {
      console.log(
        `[Edit Comment] User ${user_id} ไม่มีสิทธิ์แก้ไข (Comment owner: ${comment_user_id}, Post owner: ${post_user_id})`
      );
      return res.status(403).json({
        error: 'คุณไม่มีสิทธิ์แก้ไขความคิดเห็นนี้'
      });
    }

    // Step 3: อัปเดตความคิดเห็น
    const updateSql = `
    UPDATE post_comments 
    SET comment_text = ?
    WHERE comment_id = ?
  `;

    conn.query(updateSql, [trimmedText, comment_id], (err, result) => {
      if (err) {
        console.log('[Edit Comment] Update Error:', err);
        return res.status(500).json({ error: 'แก้ไขความคิดเห็นไม่สำเร็จ' });
      }

      if (result.affectedRows === 0) {
        return res.status(500).json({ error: 'แก้ไขความคิดเห็นไม่สำเร็จ' });
      }

      const editedBy = isCommentOwner ? 'เจ้าของความคิดเห็น' : 'เจ้าของโพสต์';
      console.log(`[Edit Comment] Comment ${comment_id} edited by User ${user_id} (${editedBy})`);

      res.status(200).json({
        message: 'แก้ไขความคิดเห็นสำเร็จ',
        editedCommentId: comment_id,
        editedBy: editedBy
      });
    });
  });
});


router.post("/like-comment", (req, res) => {
  const { user_id, comment_id } = req.body;

  if (!user_id || !comment_id) {
    return res.status(400).json({ error: "user_id และ comment_id จำเป็น" });
  }

  // 1️⃣ ตรวจสอบว่าคอมเมนต์มีอยู่จริงไหม
  const checkCommentSql = `
    SELECT c.comment_id, c.user_id_fk AS comment_owner, p.post_id, p.post_fk_uid
    FROM post_comments c
    JOIN post p ON c.post_id_fk = p.post_id
    WHERE c.comment_id = ?
  `;

  conn.query(checkCommentSql, [comment_id], (err, commentResult) => {
    if (err) {
      console.log("[Like Comment] Check comment error:", err);
      return res.status(500).json({ error: "ตรวจสอบคอมเมนต์ไม่สำเร็จ" });
    }

    if (commentResult.length === 0) {
      return res.status(404).json({ error: "ไม่พบคอมเมนต์นี้" });
    }

    const commentOwner = commentResult[0].comment_owner;
    const postId = commentResult[0].post_id;

    // 2️⃣ ตรวจสอบว่าผู้ใช้เคยไลก์แล้วหรือยัง
    const checkLikeSql = `
      SELECT * FROM comment_likes WHERE user_id_fk = ? AND comment_id_fk = ?
    `;

    conn.query(checkLikeSql, [user_id, comment_id], (err2, likeResult) => {
      if (err2) {
        console.log("[Like Comment] Check like error:", err2);
        return res.status(500).json({ error: "ตรวจสอบการไลก์ไม่สำเร็จ" });
      }

      // 🔹 ถ้าเคยไลก์แล้ว → ยกเลิกไลก์
      if (likeResult.length > 0) {
        const deleteSql = `
          DELETE FROM comment_likes WHERE user_id_fk = ? AND comment_id_fk = ?
        `;
        conn.query(deleteSql, [user_id, comment_id], (err3) => {
          if (err3) {
            console.log("[Like Comment] Unlike error:", err3);
            return res.status(500).json({ error: "ยกเลิกไลก์ไม่สำเร็จ" });
          }

          // นับจำนวนไลก์ใหม่
          const countSql = `SELECT COUNT(*) AS like_count FROM comment_likes WHERE comment_id_fk = ?`;
          conn.query(countSql, [comment_id], (err4, countResult) => {
            const likeCount = countResult ? countResult[0].like_count : 0;
            return res.status(200).json({
              message: "ยกเลิกไลก์สำเร็จ",
              liked: false,
              like_count: likeCount,
            });
          });
        });
      } else {
        // 🔹 ถ้ายังไม่เคยไลก์ → เพิ่มไลก์ใหม่
        const insertSql = `
          INSERT INTO comment_likes (user_id_fk, comment_id_fk)
          VALUES (?, ?)
        `;
        conn.query(insertSql, [user_id, comment_id], (err3, result3) => {
          if (err3) {
            console.log("[Like Comment] Insert like error:", err3);
            return res.status(500).json({ error: "เพิ่มไลก์ไม่สำเร็จ" });
          }

          // ✅ ถ้าเจ้าของคอมเมนต์ไม่ใช่คนเดียวกับคนกดไลก์ → สร้าง Notification
          if (commentOwner !== user_id) {
            const message = "ได้กดถูกใจความคิดเห็นของคุณ";
            const notifSql = `
              INSERT INTO notifications (sender_uid, receiver_uid, post_id, type, message, is_read)
              VALUES (?, ?, ?, 'comment_like', ?, 0)
            `;
            conn.query(notifSql, [user_id, commentOwner, postId, message], (err4) => {
              if (err4) {
                console.log("[Like Comment] Notification insert failed (MySQL):", err4);
              }
            });

            // 🔹 เพิ่ม notification ใน Firebase Realtime Database
            const notifData = {
              sender_uid: user_id,
              receiver_uid: commentOwner,
              post_id: postId,
              type: "comment_like",
              message: message,
              is_read: false,
              created_at: admin.database.ServerValue.TIMESTAMP,
            };

            const db = admin.database();
            const notifRef = db.ref("notifications").push();
            notifRef
              .set(notifData)
              .then(() => console.log("[Like Comment] ✅ Firebase notification sent"))
              .catch((firebaseErr) =>
                console.log("[Like Comment] Firebase insert error:", firebaseErr)
              );
          }

          // นับจำนวนไลก์ใหม่
          const countSql = `SELECT COUNT(*) AS like_count FROM comment_likes WHERE comment_id_fk = ?`;
          conn.query(countSql, [comment_id], (err5, countResult) => {
            const likeCount = countResult ? countResult[0].like_count : 0;
            return res.status(200).json({
              message: "ไลก์ความคิดเห็นสำเร็จ",
              liked: true,
              like_count: likeCount,
            });
          });
        });
      }
    });
  });
});

// --------------------------------------------
// API POST /unlike-comment
// ยกเลิกไลก์คอมเมนต์
// --------------------------------------------
router.post("/unlike-comment", (req, res) => {
  const { user_id, comment_id } = req.body;

  if (!user_id || !comment_id) {
    return res.status(400).json({ error: "user_id และ comment_id จำเป็น" });
  }

  const checkSql = `
    SELECT * FROM comment_likes WHERE user_id_fk = ? AND comment_id_fk = ?
  `;

  conn.query(checkSql, [user_id, comment_id], (err, result) => {
    if (err) {
      console.log("[Unlike Comment] Check error:", err);
      return res.status(500).json({ error: "ตรวจสอบข้อมูลไม่สำเร็จ" });
    }

    if (result.length === 0) {
      return res.status(404).json({ error: "ยังไม่ได้กดถูกใจคอมเมนต์นี้" });
    }

    const deleteSql = `
      DELETE FROM comment_likes WHERE user_id_fk = ? AND comment_id_fk = ?
    `;

    conn.query(deleteSql, [user_id, comment_id], (err2, result2) => {
      if (err2) {
        console.log("[Unlike Comment] Delete error:", err2);
        return res.status(500).json({ error: "ยกเลิกไลก์ไม่สำเร็จ" });
      }

      // นับจำนวนไลก์ใหม่หลังจากยกเลิก
      const countSql = `SELECT COUNT(*) AS like_count FROM comment_likes WHERE comment_id_fk = ?`;
      conn.query(countSql, [comment_id], (err3, countResult) => {
        if (err3) {
          console.log("[Unlike Comment] Count error:", err3);
          return res.status(500).json({ error: "นับจำนวนไลก์ไม่สำเร็จ" });
        }

        const likeCount = countResult[0].like_count;
        res.status(200).json({
          message: "ยกเลิกไลก์สำเร็จ",
          liked: false,
          like_count: likeCount,
        });
      });
    });
  });
});

// --------------------------------------------
// API GET /is-comment-liked
// ตรวจสอบว่าผู้ใช้เคยกดถูกใจคอมเมนต์นี้ไหม
// --------------------------------------------
router.get("/is-comment-liked", (req, res) => {
  const { user_id, comment_id } = req.query;

  if (!user_id || !comment_id) {
    return res.status(400).json({ error: "กรุณาระบุ user_id และ comment_id" });
  }

  const sql = `
    SELECT * FROM comment_likes WHERE user_id_fk = ? AND comment_id_fk = ?
  `;

  conn.query(sql, [user_id, comment_id], (err, result) => {
    if (err) {
      console.log("[Is Comment Liked] Error:", err);
      return res.status(500).json({ error: "ตรวจสอบไม่สำเร็จ" });
    }

    res.status(200).json({
      liked: result.length > 0,
    });
  });
});

// --------------------------------------------
// API GET /comment-like-count/:comment_id
// ดึงจำนวนไลก์ของคอมเมนต์
// --------------------------------------------
router.get("/comment-like-count/:comment_id", (req, res) => {
  const { comment_id } = req.params;

  if (!comment_id) {
    return res.status(400).json({ error: "กรุณาระบุ comment_id" });
  }

  const countSql = `
    SELECT COUNT(*) AS like_count FROM comment_likes WHERE comment_id_fk = ?
  `;

  conn.query(countSql, [comment_id], (err, result) => {
    if (err) {
      console.log("[Get Comment Like Count] Error:", err);
      return res.status(500).json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูล" });
    }

    res.status(200).json({
      comment_id: comment_id,
      like_count: result[0].like_count,
    });
  });
});



// --------------------------------------------
// API GET /comments/:post_id
// ดึง comment ของโพสต์
// --------------------------------------------
router.get('/comments/:post_id', (req, res) => {
  const { post_id } = req.params;

  const sql = `
    SELECT 
      c.comment_id, 
      c.comment_text, 
      c.created_at, 
      u.uid, 
      u.name,
      u.profile_image 
    FROM post_comments c
    JOIN user u ON c.user_id_fk = u.uid
    WHERE c.post_id_fk = ?
    ORDER BY c.created_at ASC
  `;

  conn.query(sql, [post_id], (err, results) => {
    if (err) {
      console.log('[Get Comments] Query failed:', err);
      return res.status(500).json({ error: 'Query failed' });
    }

    res.status(200).json({ comments: results });
  });
});

router.post("/report-posts", (req, res) => {
  const { post_id, reporter_id, reason } = req.body;

  if (!post_id || !reporter_id || !reason) {
    return res.status(400).json({ message: "ข้อมูลไม่ครบ" });
  }

  // ตรวจสอบว่า user นี้รายงานโพสต์นี้ไปแล้วหรือยัง
  const checkSql = `SELECT * FROM reports WHERE post_id = ? AND reporter_id = ?`;
  conn.query(checkSql, [post_id, reporter_id], (err, existingReports) => {
    if (err) {
      console.error("Report Error:", err);
      return res.status(500).json({ message: "เกิดข้อผิดพลาด" });
    }

    if (existingReports.length > 0) {
      return res.status(400).json({ message: "คุณได้รายงานโพสต์นี้ไปแล้ว" });
    }

    // Insert รายงานลง MySQL
    const insertReportSql = `INSERT INTO reports (post_id, reporter_id, reason) VALUES (?, ?, ?)`;
    conn.query(insertReportSql, [post_id, reporter_id, reason], (err2) => {
      if (err2) {
        console.error("Report Insert Error:", err2);
        return res.status(500).json({ message: "เกิดข้อผิดพลาด" });
      }

      // หาว่าเจ้าของโพสต์เป็นใคร
      const ownerSql = `SELECT post_fk_uid FROM post WHERE post_id = ?`;
      conn.query(ownerSql, [post_id], (err3, ownerResult) => {
        if (err3) {
          console.error("Owner Query Error:", err3);
          return res.status(500).json({ message: "เกิดข้อผิดพลาด" });
        }

        if (ownerResult.length > 0) {
          const receiver_uid = ownerResult[0].post_fk_uid;

          // ไม่ส่ง notification ถ้าเจ้าของโพสต์รายงานตัวเอง
          if (receiver_uid !== reporter_id) {
            const notifMessage = `${reason}`;

            // Insert notification ลง MySQL
            const notifSql = `
                INSERT INTO notifications (sender_uid, receiver_uid, post_id, type, message)
                VALUES (?, ?, ?, 'report', ?)
              `;
            conn.query(notifSql, [reporter_id, receiver_uid, post_id, notifMessage], (err4) => {
              if (err4) console.log('[Report] Notification insert failed:', err4);
            });

            // เพิ่ม notification ลง Firebase
            const notifData = {
              sender_uid: reporter_id,
              receiver_uid,
              post_id,
              type: 'report',
              message: notifMessage,
              reason,
              is_read: false,
              created_at: admin.database.ServerValue.TIMESTAMP
            };

            const db = admin.database();
            db.ref('notifications').push().set(notifData)
              .then(() => console.log('[Report] Notification added to Firebase'))
              .catch((firebaseErr) => console.log('[Report] Firebase notification failed:', firebaseErr));
          }
        }

        res.status(200).json({ message: "รายงานโพสต์สำเร็จ" });
      });
    });
  });
});


// 📌 2) ดึงรายงานทั้งหมด (สำหรับ Admin)
// 📌 Admin ดูรายงานโพสต์ + จำนวนคนที่รายงาน
router.get("/admin/post-reports", (req, res) => {
  const sql = `
    SELECT 
      p.post_id,
      p.post_topic,
      p.post_description,
      p.post_date,
      p.post_status,
      post_user.name AS post_owner_name,
      post_user.profile_image AS post_owner_profile_image,
      COUNT(r.id) AS report_count,
      JSON_ARRAYAGG(ip.image) AS post_images,
      JSON_ARRAYAGG(
        JSON_OBJECT(
          'report_id', r.id,
          'reporter_id', reporter.uid,
          'reporter_name', reporter.name,
          'reason', r.reason,
          'created_at', r.created_at
        )
      ) AS reports
    FROM post p
    LEFT JOIN reports r ON r.post_id = p.post_id
    LEFT JOIN user AS post_user ON p.post_fk_uid = post_user.uid
    LEFT JOIN user AS reporter ON r.reporter_id = reporter.uid
    LEFT JOIN image_post ip ON p.post_id = ip.image_fk_postid
    GROUP BY p.post_id
    HAVING report_count > 0
    ORDER BY report_count DESC
  `;

  conn.query(sql, (err, rows) => {
    if (err) {
      console.error("Fetch Post Reports Error:", err);
      return res.status(500).json({ message: "เกิดข้อผิดพลาด" });
    }

    const postReports = rows.map(row => ({
      postId: row.post_id,
      topic: row.post_topic,
      description: row.post_description,
      date: row.post_date,
      status: row.post_status,
      owner: {
        name: row.post_owner_name,
        profileImage: row.post_owner_profile_image,
      },
      reportCount: row.report_count,
      images: row.post_images ? JSON.parse(row.post_images) : [],
      reports: row.reports ? JSON.parse(row.reports) : [],
    }));

    res.status(200).json(postReports);
  });
});

router.get("/admin/user-reports", (req, res) => {
  const sql = `
    SELECT 
      ur.report_id,
      ur.reporter_id,
      ur.reported_id,
      ur.reason,
      ur.created_at,
      COALESCE(reporter.name, 'Unknown') as reporter_name,
      COALESCE(reported.name, 'Unknown') as reported_name,
      COALESCE(reported.is_banned, 0) as is_banned  -- ✅ ป้องกัน NULL จาก LEFT JOIN
    FROM user_reports ur
    LEFT JOIN user reporter ON ur.reporter_id = reporter.uid
    LEFT JOIN user reported ON ur.reported_id = reported.uid
    ORDER BY ur.created_at DESC
  `;

  conn.query(sql, (err, results) => {
    if (err) {
      console.error("[User Reports] Error:", err);
      return res.status(500).json({ error: "Failed to fetch user reports" });
    }

    // แปลง is_banned เป็น boolean ให้แน่ใจ
    const processedResults = results.map(row => ({
      ...row,
      is_banned: row.is_banned === 1 || row.is_banned === true ? 1 : 0
    }));

    console.log("✅ Processed Results:", processedResults);
    res.json(processedResults);
  });
});


router.delete("/delete-post/:post_id", async (req, res) => {
  const { post_id } = req.params;

  try {
    const sql = "DELETE FROM post WHERE post_id = ?";
    conn.query(sql, [post_id], (err, result) => {
      if (err) {
        console.error("Delete Post Error:", err);
        return res.status(500).json({ message: "เกิดข้อผิดพลาดในการลบโพสต์" });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "ไม่พบโพสต์ที่ต้องการลบ" });
      }

      res.status(200).json({ message: "ลบโพสต์และข้อมูลที่เกี่ยวข้องสำเร็จ (ON DELETE CASCADE)" });
    });
  } catch (err) {
    console.error("Delete Post Error:", err);
    res.status(500).json({ message: "เกิดข้อผิดพลาดในการลบโพสต์" });
  }
});


router.post("/report-user", (req, res) => {
  const { reporter_id, reported_id, reason } = req.body;

  if (!reporter_id || !reported_id || !reason) {
    return res.status(400).json({ message: "ข้อมูลไม่ครบ" });
  }

  // 1. ตรวจสอบว่ามีการรายงานไปแล้วหรือยัง
  const checkSql = "SELECT * FROM user_reports WHERE reporter_id = ? AND reported_id = ?";
  conn.query(checkSql, [reporter_id, reported_id], (err, checkResult) => {
    if (err) {
      console.error("❌ Check report error:", err);
      return res.status(500).json({ message: "เกิดข้อผิดพลาด" });
    }

    if (checkResult.length > 0) {
      return res.status(400).json({ message: "คุณได้รายงานผู้ใช้นี้ไปแล้ว" });
    }

    // 2. Insert user_reports
    const insertReportSql = `
      INSERT INTO user_reports (reporter_id, reported_id, reason, created_at) 
      VALUES (?, ?, ?, NOW())
    `;
    conn.query(insertReportSql, [reporter_id, reported_id, reason], (err2) => {
      if (err2) {
        console.error("❌ Insert report error:", err2);
        return res.status(500).json({ message: "เกิดข้อผิดพลาด" });
      }

      // 3. Insert notifications (MySQL)
      const notifSql = `
        INSERT INTO notifications (sender_uid, receiver_uid, type, message, reason, is_read, created_at) 
        VALUES (?, ?, 'report_user', ?, ?, false, NOW())
      `;
      const notifMessage = "มีการรายงานผู้ใช้ของคุณ";
      conn.query(notifSql, [reporter_id, reported_id, notifMessage, reason], (err3) => {
        if (err3) {
          console.error("❌ Insert notification error:", err3);
          // ไม่ return เพราะไม่อยากให้ report พัง
        }
      });

      // 4. Push Firebase
      const notifData = {
        sender_uid: reporter_id,
        receiver_uid: reported_id,
        type: "report_user",
        message: "มีการรายงานผู้ใช้ของคุณ",
        reason: reason,
        is_read: false,
        created_at: admin.database.ServerValue.TIMESTAMP,
      };

      const db = admin.database();
      db.ref("notifications").push().set(notifData)
        .then(() => console.log("📌 Firebase notification inserted"))
        .catch((firebaseErr) => console.error("❌ Firebase insert error:", firebaseErr));

      res.status(200).json({ message: "รายงานผู้ใช้สำเร็จ" });
    });
  });
});


// --------------------------------------------
// API PUT /post/edit/:post_id
// แก้ไขโพสต์ (เฉพาะ topic, description และ hashtags)
// --------------------------------------------
router.put('/post/edit/:post_id', async (req, res) => {
  try {
    const { post_id } = req.params;
    let { post_topic, post_description, hashtags, user_id } = req.body;

    // Validate required fields
    if (!post_id || !user_id) {
      return res.status(400).json({ error: 'Missing post_id or user_id' });
    }

    // Sanitize inputs
    post_topic = post_topic?.trim() || null;
    post_description = post_description?.trim() || null;

    // Helper function for promisified queries
    const query = (sql, params) =>
      new Promise((resolve, reject) => {
        conn.query(sql, params, (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });

    // 1. ตรวจสอบว่าโพสต์นี้เป็นของ user หรือไม่
    const checkOwnerSql = 'SELECT post_fk_uid FROM post WHERE post_id = ?';
    const ownerResult = await query(checkOwnerSql, [post_id]);

    if (ownerResult.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (ownerResult[0].post_fk_uid !== user_id) {
      return res.status(403).json({ error: 'Unauthorized: You can only edit your own posts' });
    }

    // 2. อัปเดตข้อมูลโพสต์หลัก (เฉพาะ topic และ description)
    const updatePostSql = `
      UPDATE post 
      SET post_topic = ?, post_description = ?
      WHERE post_id = ?
    `;
    await query(updatePostSql, [post_topic, post_description, post_id]);

    // 3. อัปเดต hashtags (ลบของเก่า แล้วเพิ่มใหม่)
    await query('DELETE FROM post_hashtags WHERE post_id_fk = ?', [post_id]);

    if (Array.isArray(hashtags) && hashtags.length > 0) {
      const hashtagValues = hashtags.map(tagId => [post_id, tagId]);
      const insertHashtagSql = 'INSERT INTO post_hashtags (post_id_fk, hashtag_id_fk) VALUES ?';
      await query(insertHashtagSql, [hashtagValues]);
    }

    // 4. ดึงข้อมูลโพสต์ที่อัปเดตแล้วพร้อม related data
    const postData = await query('SELECT * FROM post WHERE post_id = ?', [post_id]);

    const imageResults = await query(
      'SELECT * FROM image_post WHERE image_fk_postid = ?',
      [post_id]
    );

    const categoryResults = await query(`
      SELECT pc.post_id_fk, c.cid, c.cname, c.cimage, c.ctype
      FROM post_category pc
      JOIN category c ON pc.category_id_fk = c.cid
      WHERE pc.post_id_fk = ?
    `, [post_id]);

    const hashtagResults = await query(`
      SELECT ph.post_id_fk, h.tag_id, h.tag_name
      FROM post_hashtags ph
      JOIN hashtags h ON ph.hashtag_id_fk = h.tag_id
      WHERE ph.post_id_fk = ?
    `, [post_id]);

    const analysisResults = await query(
      'SELECT * FROM post_image_analysis WHERE post_id_fk = ?',
      [post_id]
    );

    res.status(200).json({
      message: 'Post updated successfully',
      post: postData[0],
      images: imageResults,
      categories: categoryResults.map(cat => ({
        cid: cat.cid,
        cname: cat.cname,
        cimage: cat.cimage,
        ctype: cat.ctype
      })),
      hashtags: hashtagResults.map(ht => ({
        tag_id: ht.tag_id,
        tag_name: ht.tag_name
      })),
      analysis: analysisResults
    });

  } catch (error) {
    console.error('❌ Post update failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post("/searchByImageLabels", (req, res) => {
  const { labels } = req.body;
  if (!labels || labels.length === 0) {
    return res.status(400).json({ error: "No labels provided" });
  }

  // สร้าง LIKE clause สำหรับ analysis_text
  const likeClauses = labels.map(label => `a.analysis_text LIKE ?`).join(" OR ");
  const sql = `
    SELECT p.*, u.name, u.profile_image, a.image_url, a.analysis_text
    FROM post_image_analysis a
    JOIN post p ON a.post_id_fk = p.post_id
    JOIN \`user\` u ON p.post_fk_uid = u.uid
    WHERE ${likeClauses}
    ORDER BY a.created_at DESC
  `;

  const values = labels.map(label => `%${label}%`);

  conn.query(sql, values, (err, results) => {
    if (err) {
      console.error("Image label search error:", err);
      return res.status(500).json({ error: "Database query error" });
    }
    res.json({ posts: results });
  });
});




















