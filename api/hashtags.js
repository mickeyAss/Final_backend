var express = require('express');
var router = express.Router();
var conn = require('../dbconnect')

module.exports = router;

router.get("/get", (req, res) => {
  try {
    const sql = `SELECT * FROM hashtags`;

    conn.query(sql, (err, results) => {
      if (err) {
        console.error("Hashtag query error:", err);
        return res.status(400).json({ error: "Hashtag query error" });
      }

      if (results.length === 0) {
        return res.status(404).json({ error: "No hashtags found" });
      }

      res.status(200).json(results);
    });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ค้นหา hashtag ด้วย query string q (ถ้าไม่ใส่คืนทั้งหมด)
router.get('/search', (req, res) => {
  try {
    const q = req.query.q?.trim();

    if (!q || q === '#') {
      const sqlAll = 'SELECT * FROM hashtags LIMIT 20'; // จำกัดจำนวนผลลัพธ์
      conn.query(sqlAll, (err, results) => {
        if (err) {
          console.error('Hashtag query error:', err);
          return res.status(400).json({ error: 'Hashtag query error' });
        }
        return res.status(200).json({ isNew: false, data: results });
      });
    } else {
      const sqlSearch = 'SELECT * FROM hashtags WHERE tag_name LIKE ? LIMIT 20';
      const searchTerm = `%${q}%`;
      conn.query(sqlSearch, [searchTerm], (err, results) => {
        if (err) {
          console.error('Hashtag search error:', err);
          return res.status(400).json({ error: 'Hashtag search error' });
        }

        return res.status(200).json({
          isNew: results.length === 0,
          data: results,
        });
      });
    }
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


router.post('/insert', (req, res) => {
  try {
    const { tag_name } = req.body;
    const q = tag_name?.trim();

    if (!q || q === '#') {
      return res.status(400).json({ error: 'คำไม่ถูกต้อง' });
    }

    const sqlSearch = 'SELECT * FROM hashtags WHERE tag_name = ?';
    conn.query(sqlSearch, [q], (err, results) => {
      if (err) {
        console.error('Hashtag search error:', err);
        return res.status(400).json({ error: 'Hashtag search error' });
      }

      if (results.length > 0) {
        return res.status(200).json({
          isNew: false,
          data: results,
          message: 'มีคำนี้อยู่แล้ว',
        });
      } else {
        const sqlInsert = 'INSERT INTO hashtags (tag_name) VALUES (?)';
        conn.query(sqlInsert, [q], (err, insertResult) => {
          if (err) {
            console.error('Hashtag insert error:', err);
            return res.status(400).json({ error: 'Hashtag insert error' });
          }

          const newId = insertResult.insertId;
          const sqlNew = 'SELECT * FROM hashtags WHERE tag_id = ?';
          conn.query(sqlNew, [newId], (err, newResults) => {
            if (err) {
              console.error('Hashtag query new error:', err);
              return res
                .status(400)
                .json({ error: 'Hashtag query new error' });
            }

            return res.status(200).json({
              isNew: true,
              data: newResults,
              message: 'เพิ่มคำใหม่เรียบร้อย',
            });
          });
        });
      }
    });
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


router.get("/hashtags-with-posts", (req, res) => {
  try {
    const hashtagSql = `SELECT * FROM hashtags`;
    conn.query(hashtagSql, (err, hashtags) => {
      if (err) return res.status(400).json({ error: 'Hashtag query error' });
      if (hashtags.length === 0) return res.status(404).json({ error: 'No hashtags found' });

      const postSql = `
        SELECT post.*, user.uid, user.name, user.email
        FROM post
        JOIN user ON post.post_fk_uid = user.uid
      `;
      conn.query(postSql, (err, posts) => {
        if (err) return res.status(400).json({ error: 'Post query error' });

        const postHashtagSql = `SELECT * FROM post_hashtags`;
        conn.query(postHashtagSql, (err, postHashtags) => {
          if (err) return res.status(400).json({ error: 'Post-Hashtag query error' });

          const imageSql = `SELECT * FROM image_post`;
          conn.query(imageSql, (err, images) => {
            if (err) return res.status(400).json({ error: 'Image query error' });

            // รวมข้อมูล: hashtag -> posts -> images
            const result = hashtags.map(tag => {
              const relatedPostIds = postHashtags
                .filter(ph => ph.hashtag_id_fk === tag.tag_id)
                .map(ph => ph.post_id_fk);

              const relatedPosts = posts
                .filter(p => relatedPostIds.includes(p.post_id))
                .map(p => {
                  const postImages = images
                    .filter(img => img.image_fk_postid === p.post_id)
                    .map(img => img.image);

                  return {
                    post_id: p.post_id,
                    post_topic: p.post_topic,
                    post_description: p.post_description,
                    post_fk_uid: p.post_fk_uid,
                    post_date: p.post_date,
                    user: {
                      uid: p.uid,
                      name: p.name,
                      email: p.email
                    },
                    images: postImages
                  };
                });

              return {
                tag_id: tag.tag_id,
                tag_name: tag.tag_name,
                usage_count: relatedPosts.length, // <-- จำนวนโพสต์ที่ใช้แฮชแท็กนี้
                posts: relatedPosts
              };
            });

            // เรียงจากมากไปน้อยตามจำนวนการใช้งาน
            result.sort((a, b) => b.usage_count - a.usage_count);

            res.status(200).json(result);
          });
        });
      });
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Server error' });
  }
});


// ค้นหาโพสต์ด้วย hashtag
router.get("/search-posts", (req, res) => {
  try {
    const q = req.query.q?.trim();
    if (!q) {
      return res.status(400).json({ error: "กรุณาใส่คำค้นหา" });
    }

    // 1. ค้นหาโพสต์จาก post_topic และ post_description
    const postSearchSql = `
      SELECT 
        post.*, 
        user.uid, user.name, user.email, user.profile_image
      FROM post
      JOIN user ON post.post_fk_uid = user.uid
      WHERE post.post_topic LIKE ? OR post.post_description LIKE ?
      ORDER BY post.post_date DESC
    `;

    const searchPattern = `%${q}%`;

    conn.query(postSearchSql, [searchPattern, searchPattern], (err, posts) => {
      if (err) {
        return res.status(400).json({ error: "Post query error" });
      }
      if (posts.length === 0) {
        return res.status(404).json({ error: "ไม่พบโพสต์ที่ค้นหา" });
      }

      const postIds = posts.map((p) => p.post_id);

      // 2. ดึงรูปภาพที่เกี่ยวข้องกับโพสต์
      const imageSql =
        "SELECT * FROM image_post WHERE image_fk_postid IN (?)";
      conn.query(imageSql, [postIds], (err, images) => {
        if (err) {
          return res.status(400).json({ error: "Image query error" });
        }

        const result = posts.map((p) => {
          const postImages = images
            .filter((img) => img.image_fk_postid === p.post_id)
            .map((img) => img.image);

          return {
            post_id: p.post_id,
            post_topic: p.post_topic,
            post_description: p.post_description,
            post_fk_uid: p.post_fk_uid,
            post_date: p.post_date,
            user: {
              uid: p.uid,
              name: p.name,
              email: p.email,
              profile_image: p.profile_image || null, // ✅ เพิ่มตรงนี้
            },
            images: postImages,
          };
        });

        res.status(200).json({
          total_posts: result.length,
          posts: result,
        });
      });
    });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Server error" });
  }
});


router.get("/hashtag-posts", (req, res) => {
  try {
    const tagId = parseInt(req.query.tag_id);
    if (!tagId) {
      return res.status(400).json({ error: "กรุณาส่ง tag_id" });
    }

    // 1. ตรวจสอบ hashtag
    const hashtagSql = "SELECT * FROM hashtags WHERE tag_id = ?";
    conn.query(hashtagSql, [tagId], (err, hashtagResults) => {
      if (err) return res.status(400).json({ error: "Hashtag query error" });
      if (hashtagResults.length === 0)
        return res.status(404).json({ error: "ไม่พบ hashtag นี้" });

      // 2. หาโพสต์ที่ผูกกับ tag นี้
      const postHashtagSql =
        "SELECT post_id_fk FROM post_hashtags WHERE hashtag_id_fk = ?";
      conn.query(postHashtagSql, [tagId], (err, postHashtags) => {
        if (err)
          return res.status(400).json({ error: "Post-Hashtag query error" });

        const postIds = postHashtags.map((ph) => ph.post_id_fk);
        if (postIds.length === 0)
          return res
            .status(404)
            .json({ error: "ไม่มีโพสต์ที่ใช้ hashtag นี้" });

        // 3. ดึงโพสต์ทั้งหมด พร้อมข้อมูล user (รวม profile_image)
        const postSql = `
          SELECT 
            p.post_id, p.post_topic, p.post_description, p.post_date, p.post_fk_uid,
            u.uid, u.name, u.email, u.profile_image
          FROM post p
          JOIN user u ON p.post_fk_uid = u.uid
          WHERE p.post_id IN (?)
          ORDER BY p.post_date DESC
        `;
        conn.query(postSql, [postIds], (err, posts) => {
          if (err) return res.status(400).json({ error: "Post query error" });

          // 4. ดึงรูปภาพทั้งหมดที่เกี่ยวข้อง
          const imageSql =
            "SELECT * FROM image_post WHERE image_fk_postid IN (?)";
          conn.query(imageSql, [postIds], (err, images) => {
            if (err)
              return res.status(400).json({ error: "Image query error" });

            // 5. รวมข้อมูลโพสต์ + รูป + user profile image
            const result = posts.map((p) => {
              const postImages = images
                .filter((img) => img.image_fk_postid === p.post_id)
                .map((img) => img.image);

              return {
                post_id: p.post_id,
                post_topic: p.post_topic,
                post_description: p.post_description,
                post_date: p.post_date,
                post_fk_uid: p.post_fk_uid,
                user: {
                  uid: p.uid,
                  name: p.name,
                  email: p.email,
                  profile_image: p.profile_image || null, // เพิ่มตรงนี้
                },
                images: postImages,
              };
            });

            res.status(200).json({
              hashtag: hashtagResults[0],
              total_posts: result.length,
              posts: result,
            });
          });
        });
      });
    });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/analysis-posts", (req, res) => {
  try {
    const q = req.query.q?.trim();
    if (!q) {
      return res.status(400).json({ error: "กรุณาใส่คำค้นหา" });
    }

    // 1. ค้นหา post_id จาก analysis_text
    const analysisSql = `
      SELECT post_id_fk, image_url, analysis_text 
      FROM post_image_analysis
      WHERE analysis_text LIKE ?
    `;
    const searchPattern = `%${q}%`;

    conn.query(analysisSql, [searchPattern], (err, analysisResults) => {
      if (err) return res.status(400).json({ error: "Analysis query error" });
      if (analysisResults.length === 0)
        return res.status(404).json({ error: "ไม่พบโพสต์ที่ค้นหา" });

      const postIds = [...new Set(analysisResults.map((a) => a.post_id_fk))];

      // 2. ดึงโพสต์ + user
      const postSql = `
        SELECT 
          p.post_id, p.post_topic, p.post_description, p.post_date, p.post_fk_uid,
          u.uid, u.name, u.email, u.profile_image
        FROM post p
        JOIN user u ON p.post_fk_uid = u.uid
        WHERE p.post_id IN (?)
        ORDER BY p.post_date DESC
      `;

      conn.query(postSql, [postIds], (err, posts) => {
        if (err) return res.status(400).json({ error: "Post query error" });

        // 3. ดึงรูปภาพทั้งหมดที่เกี่ยวข้อง
        const imageSql = "SELECT * FROM image_post WHERE image_fk_postid IN (?)";
        conn.query(imageSql, [postIds], (err, images) => {
          if (err) return res.status(400).json({ error: "Image query error" });

          // 4. รวมข้อมูลโพสต์ + รูป + user profile image + analysis_text
          const result = posts.map((p) => {
            const postImages = images
              .filter((img) => img.image_fk_postid === p.post_id)
              .map((img) => img.image);

            const postAnalysis = analysisResults
              .filter((a) => a.post_id_fk === p.post_id)
              .map((a) => ({
                image_url: a.image_url,
                analysis_text: a.analysis_text,
              }));

            return {
              post_id: p.post_id,
              post_topic: p.post_topic,
              post_description: p.post_description,
              post_date: p.post_date,
              post_fk_uid: p.post_fk_uid,
              user: {
                uid: p.uid,
                name: p.name,
                email: p.email,
                profile_image: p.profile_image || null,
              },
              images: postImages,
              analysis: postAnalysis, // ✅ เพิ่มตรงนี้
            };
          });

          res.status(200).json({
            total_posts: result.length,
            posts: result,
          });
        });
      });
    });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Server error" });
  }
});


router.post('/search-posts-by-text', (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "กรุณาส่งข้อความ" });

    // ค้นหาใน analysis_text ใช้ LIKE หรือ Full-Text Search
    const sql = `
      SELECT pia.post_id_fk, pia.image_url, pia.analysis_text,
             p.post_topic, p.post_description, p.post_fk_uid, p.post_date,
             u.uid, u.name, u.email, u.profile_image
      FROM post_image_analysis pia
      JOIN post p ON pia.post_id_fk = p.post_id
      JOIN user u ON p.post_fk_uid = u.uid
      WHERE pia.analysis_text LIKE ?
      ORDER BY p.post_date DESC
      LIMIT 20
    `;
    const searchPattern = `%${text}%`;

    conn.query(sql, [searchPattern], (err, results) => {
      if (err) return res.status(400).json({ error: "Query error" });
      if (results.length === 0) return res.status(404).json({ error: "ไม่พบโพสต์ที่เกี่ยวข้อง" });

      const posts = results.map(r => ({
        post_id: r.post_id_fk,
        post_topic: r.post_topic,
        post_description: r.post_description,
        post_date: r.post_date,
        post_fk_uid: r.post_fk_uid,
        user: {
          uid: r.uid,
          name: r.name,
          email: r.email,
          profile_image: r.profile_image
        },
        images: [{ image_url: r.image_url, analysis_text: r.analysis_text }]
      }));

      res.status(200).json({ total_posts: posts.length, posts });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});



