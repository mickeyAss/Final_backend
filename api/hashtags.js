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




