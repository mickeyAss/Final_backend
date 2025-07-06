var express = require('express');
var router = express.Router();
var conn = require('../dbconnect')

module.exports = router;

//เส้น Api ดึงข้อมูลทั้งหมดจากเทเบิ้ล post และเทเบิ้ล image และ user
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

            // ✅ ดึงจำนวนไลก์จาก post_likes
            const likeSql = `
              SELECT post_id_fk AS post_id, COUNT(*) AS like_count 
              FROM post_likes 
              GROUP BY post_id_fk
            `;
            conn.query(likeSql, (err, likeResults) => {
              if (err) return res.status(400).json({ error: 'Like count query error' });

              const likeMap = {};
              likeResults.forEach(item => {
                likeMap[item.post_id] = item.like_count;
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
                    amount_of_like: likeMap[post.post_id] || 0, // ✅ เพิ่มจำนวนไลก์
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





router.post('/like', (req, res) => {
  const { user_id, post_id } = req.body;

  if (!user_id || !post_id) {
    return res.status(400).json({ error: 'user_id and post_id are required' });
  }

  const checkSql = 'SELECT * FROM post_likes WHERE user_id_fk = ? AND post_id_fk = ?';
  conn.query(checkSql, [user_id, post_id], (err, results) => {
    if (err) return res.status(500).json({ error: 'Check failed' });

    if (results.length > 0) {
      return res.status(400).json({ error: 'Already liked' });
    }

    // บันทึกการไลก์
    const insertSql = 'INSERT INTO post_likes (user_id_fk, post_id_fk) VALUES (?, ?)';
    conn.query(insertSql, [user_id, post_id], (err2) => {
      if (err2) return res.status(500).json({ error: 'Like insert failed' });

      // เพิ่มจำนวนไลก์ใน post table
      const updatePostSql = 'UPDATE post SET amount_of_like = amount_of_like + 1 WHERE post_id = ?';
      conn.query(updatePostSql, [post_id], (err3) => {
        if (err3) return res.status(500).json({ error: 'Post update failed' });
        res.status(200).json({ message: 'Liked' });
      });
    });
  });
});


router.post('/unlike', (req, res) => {
  const { user_id, post_id } = req.body;

  if (!user_id || !post_id) {
    return res.status(400).json({ error: 'user_id and post_id are required' });
  }

  const deleteSql = 'DELETE FROM post_likes WHERE user_id_fk = ? AND post_id_fk = ?';
  conn.query(deleteSql, [user_id, post_id], (err, result) => {
    if (err) return res.status(500).json({ error: 'Unlike failed' });

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Like not found' });
    }

    const updatePostSql = 'UPDATE post SET amount_of_like = GREATEST(amount_of_like - 1, 0) WHERE post_id = ?';
    conn.query(updatePostSql, [post_id], (err2) => {
      if (err2) return res.status(500).json({ error: 'Post update failed' });
      res.status(200).json({ message: 'Unliked' });
    });
  });
});

router.get('/liked-posts/:user_id', (req, res) => {
  const { user_id } = req.params;
  const sql = 'SELECT post_id_fk FROM post_likes WHERE user_id_fk = ?';

  conn.query(sql, [user_id], (err, results) => {
    if (err) return res.status(500).json({ error: 'Query failed' });
    const likedPostIds = results.map(row => row.post_id_fk);
    res.status(200).json({ likedPostIds });
  });
});




// API เพิ่มโพสต์พร้อมรูปภาพ
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

  conn.query(insertPostSql, [post_topic, post_description, post_fk_uid], (err, postResult) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to insert post' });
    }

    const insertedPostId = postResult.insertId;

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

    // ฟังก์ชันนี้รับ hashtags เป็น array ของ tag_id (number)
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

    Promise.all([insertImages(), insertCategories(), insertPostHashtags()])
      .then(() => {
        res.status(201).json({
          message: 'Post, images, categories, and hashtags inserted successfully',
          post_id: insertedPostId,
          images_count: images.length,
          categories_count: Array.isArray(category_id_fk) ? category_id_fk.length : 0,
          hashtags_count: Array.isArray(hashtags) ? hashtags.length : 0,
        });
      })
      .catch((err) => {
        console.error(err);
        res.status(500).json({ error: 'Failed to insert images, categories, or hashtags' });
      });
  });
});


// ดึงโพสต์ทั้งหมดของ user ตาม uid
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

  if (!cid) {
    return res.status(400).json({ error: 'Missing category id (cid)' });
  }

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

  conn.query(postSql, [cid], (err, postResults) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Post query error' });
    }

    if (postResults.length === 0) {
      return res.status(404).json({ error: 'No posts found for this category' });
    }

    const postIds = postResults.map(post => post.post_id);

    // ดึงรูปภาพทั้งหมด
    const imageSql = `SELECT * FROM image_post WHERE image_fk_postid IN (?)`;
    conn.query(imageSql, [postIds], (err, imageResults) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Image query error' });
      }

      // ✅ ดึงหมวดหมู่ทั้งหมดของโพสต์ที่ match cid
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

        res.status(200).json(postsWithData);
      });
    });
  });
});

















