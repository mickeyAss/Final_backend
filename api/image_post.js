var express = require('express');
var router = express.Router();
var conn = require('../dbconnect')

// โหลด Google Cloud Vision API client สำหรับวิเคราะห์ภาพ
const vision = require('@google-cloud/vision');
const client = new vision.ImageAnnotatorClient({
  keyFilename: 'final-project-465814-1278faeb06a3.json' // ไฟล์ service account ของ Google Cloud Vision
});

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
        user.uid, user.name, user.email, user.height, user.weight, 
        user.shirt_size, user.chest, user.waist_circumference, 
        user.hip, user.personal_description, user.profile_image
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
        console.log(`[Like] User ${user_id} liked post ${post_id} successfully`);
        res.status(200).json({ message: 'Liked' });
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
// ฟังก์ชันวิเคราะห์ภาพด้วย Google Vision AI
// --------------------------------------------
const analyzeImageWithVision = async (imageUrl) => {
  try {
    const [result] = await client.labelDetection(imageUrl);
    const labels = result.labelAnnotations || [];
    console.log(`🔍 Vision AI วิเคราะห์ภาพ: ${imageUrl}`);
    labels.forEach(label => {
      console.log(`- ${label.description} (score: ${label.score.toFixed(2)})`);
    });
    return labels;
  } catch (err) {
    console.error('❌ Vision AI Error:', err);
    return [];
  }
};

// --------------------------------------------
// API POST /post/add
// เพิ่มโพสต์พร้อมรูปภาพ, หมวดหมู่ และแฮชแท็ก
// --------------------------------------------
router.post('/post/add', (req, res) => {
  let { post_topic, post_description, post_fk_uid, images, category_id_fk, hashtags } = req.body;

  post_topic = post_topic?.trim() === '' ? null : post_topic;
  post_description = post_description?.trim() === '' ? null : post_description;

  if (!post_fk_uid || !Array.isArray(images)) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const insertPostSql = `
    INSERT INTO post (post_topic, post_description, post_date, post_fk_uid)
    VALUES (?, ?, NOW(), ?)
  `;

  conn.query(insertPostSql, [post_topic, post_description, post_fk_uid], async (err, postResult) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to insert post' });
    }

    const insertedPostId = postResult.insertId;

    // ฟังก์ชันเพิ่มรูปภาพ
    const insertImages = () => {
      if (!images.length) return Promise.resolve();
      const insertImageSql = `INSERT INTO image_post (image, image_fk_postid) VALUES ?`;
      const imageValues = images.map((url) => [url, insertedPostId]);
      return new Promise((resolve, reject) => {
        conn.query(insertImageSql, [imageValues], (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    };

    // ฟังก์ชันเพิ่มหมวดหมู่
    const insertCategories = () => {
      if (!Array.isArray(category_id_fk) || category_id_fk.length === 0) return Promise.resolve();
      const insertCategorySql = `INSERT INTO post_category (category_id_fk, post_id_fk) VALUES ?`;
      const categoryValues = category_id_fk.map((catId) => [catId, insertedPostId]);
      return new Promise((resolve, reject) => {
        conn.query(insertCategorySql, [categoryValues], (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    };

    // ฟังก์ชันเพิ่มแฮชแท็ก
    const insertPostHashtags = () => {
      if (!Array.isArray(hashtags) || hashtags.length === 0) return Promise.resolve();
      const insertPostHashtagSql = `INSERT INTO post_hashtags (post_id_fk, hashtag_id_fk) VALUES ?`;
      const values = hashtags.map(tagId => [insertedPostId, tagId]);
      return new Promise((resolve, reject) => {
        conn.query(insertPostHashtagSql, [values], (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    };

    // เรียก Promise พร้อมกัน
    Promise.all([insertImages(), insertCategories(), insertPostHashtags()])
      .then(async () => {
        // วิเคราะห์ภาพด้วย Vision AI แล้วเก็บ labels
        const visionResults = [];
        if (images && images.length > 0) {
          console.log('🧠 เริ่มวิเคราะห์ภาพด้วย Vision AI...');
          for (const imgUrl of images) {
            const labels = await analyzeImageWithVision(imgUrl);
            visionResults.push({
              image: imgUrl,
              labels: labels.map(l => l.description) // เอาเฉพาะชื่อ label
            });
          }
        }

        res.status(201).json({
          message: 'Post, images, categories, and hashtags inserted successfully',
          post_id: insertedPostId,
          images_count: images.length,
          categories_count: Array.isArray(category_id_fk) ? category_id_fk.length : 0,
          hashtags_count: Array.isArray(hashtags) ? hashtags.length : 0,
          vision: visionResults
        });
      })
      .catch((err) => {
        console.error(err);
        res.status(500).json({ error: 'Failed to insert images, categories, or hashtags' });
      });
  });
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




















