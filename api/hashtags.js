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
    // ดึงทุกแฮชแท็ก
    const hashtagSql = `SELECT * FROM hashtags`;
    conn.query(hashtagSql, (err, hashtags) => {
      if (err) return res.status(400).json({ error: 'Hashtag query error' });
      if (hashtags.length === 0) return res.status(404).json({ error: 'No hashtags found' });

      // ดึงโพสต์ทั้งหมด พร้อมข้อมูลผู้ใช้
      const postSql = `
        SELECT 
          post.*, 
          user.uid, user.name, user.email
        FROM post
        JOIN user ON post.post_fk_uid = user.uid
      `;
      conn.query(postSql, (err, posts) => {
        if (err) return res.status(400).json({ error: 'Post query error' });

        // ดึงความสัมพันธ์ post_hashtags
        const postHashtagSql = `SELECT * FROM post_hashtags`;
        conn.query(postHashtagSql, (err, postHashtags) => {
          if (err) return res.status(400).json({ error: 'Post-Hashtag query error' });

          // รวมข้อมูล: hashtag -> posts
          const result = hashtags.map(tag => {
            // หา post_id ที่เกี่ยวกับ tag นี้
            const relatedPostIds = postHashtags
              .filter(ph => ph.hashtag_id_fk === tag.tag_id)
              .map(ph => ph.post_id_fk);

            // หาโพสต์ที่ตรงกับ post_id เหล่านี้
            const relatedPosts = posts
              .filter(p => relatedPostIds.includes(p.post_id))
              .map(p => ({
                post_id: p.post_id,
                post_topic: p.post_topic,
                post_description: p.post_description,
                post_fk_uid: p.post_fk_uid,
                post_date: p.post_date,
                user: {
                  uid: p.uid,
                  name: p.name,
                  email: p.email
                }
              }));

            return {
              tag_id: tag.tag_id,
              tag_name: tag.tag_name,
              posts: relatedPosts
            };
          });

          res.status(200).json(result);
        });
      });
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Server error' });
  }
});







