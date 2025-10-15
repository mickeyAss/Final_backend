var express = require('express');
var router = express.Router();
var conn = require('../dbconnect')

module.exports = router;

//เส้น Api ดึงข้อมูลทั้งหมดจากเทเบิ้ล categor หรือเทเบิ้ล หมวดหมู่
router.get("/get", (req, res) => {
  try {
    conn.query("SELECT * FROM category", (err, result) => {
      if (err) {
        console.log(err);
        return res.status(400).json({ error: 'Query error' });
      }
      if (result.length === 0) {
        return res.status(404).json({ error: 'No data category found' });
      }
      res.status(200).json(result);
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.get("/search-by-category", (req, res) => {
  try {
    const cname = req.query.cname;
    if (!cname || cname.trim() === "") {
      return res.status(400).json({ error: "กรุณาระบุ cname" });
    }

    // 1. ตรวจสอบว่าหมวดหมู่มีอยู่จริงไหม (ค้นหาจากชื่อ)
    const categorySql = "SELECT * FROM category WHERE cname LIKE ?";
    conn.query(categorySql, [`%${cname}%`], (err, categoryResults) => {
      if (err) {
        console.error("Category query error:", err);
        return res.status(400).json({ error: "Category query error" });
      }
      if (categoryResults.length === 0) {
        return res.status(404).json({ error: "ไม่พบหมวดหมู่ที่ค้นหา" });
      }

      // ดึง cid ของหมวดหมู่ทั้งหมดที่ตรงชื่อ
      const categoryIds = categoryResults.map((c) => c.cid);

      // 2. ค้นหาโพสต์ทั้งหมดในหมวดหมู่เหล่านี้
      const postSql = `
        SELECT 
          p.post_id, p.post_topic, p.post_description, p.post_date, p.post_fk_uid,
          u.uid, u.name, u.email, u.profile_image,
          c.cid AS category_id, c.cname AS category_name, c.cimage, c.ctype, c.cdescription
        FROM post p
        JOIN post_category pc ON p.post_id = pc.post_id_fk
        JOIN category c ON pc.category_id_fk = c.cid
        JOIN user u ON p.post_fk_uid = u.uid
        WHERE pc.category_id_fk IN (?)
        ORDER BY p.post_date DESC
      `;

      conn.query(postSql, [categoryIds], (err, posts) => {
        if (err) {
          console.error("Post query error:", err);
          return res.status(400).json({ error: "Post query error" });
        }

        if (posts.length === 0) {
          return res.status(404).json({ error: "ไม่พบโพสต์ในหมวดหมู่นี้" });
        }

        // 3. ดึงรูปภาพของโพสต์ทั้งหมด
        const postIds = posts.map((p) => p.post_id);
        const imageSql = `SELECT * FROM image_post WHERE image_fk_postid IN (?)`;

        conn.query(imageSql, [postIds], (err, images) => {
          if (err) {
            console.error("Image query error:", err);
            return res.status(400).json({ error: "Image query error" });
          }

          // 4. รวมข้อมูลทั้งหมด
          const result = posts.map((p) => {
            const postImages = images
              .filter((img) => img.image_fk_postid === p.post_id)
              .map((img) => img.image);

            return {
              post_id: p.post_id,
              post_topic: p.post_topic,
              post_description: p.post_description,
              post_date: p.post_date,
              category: {
                id: p.category_id,
                name: p.category_name,
                image: p.cimage,
                type: p.ctype,
                description: p.cdescription,
              },
              user: {
                uid: p.uid,
                name: p.name,
                email: p.email,
                profile_image: p.profile_image || null,
              },
              images: postImages,
            };
          });

          res.status(200).json({
            search_name: cname,
            matched_categories: categoryResults,
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


