var express = require('express');
var router = express.Router();
var conn = require('../dbconnect')

module.exports = router;

//เส้น Api ดึงข้อมูลทั้งหมดจากเทเบิ้ล post และเทเบิ้ล image
router.get("/get", (req, res) => {
    try {
        // ดึงข้อมูลโพสต์ทั้งหมด
        const postSql = `SELECT * FROM post`;
        conn.query(postSql, (err, postResults) => {
            if (err) {
                console.log(err);
                return res.status(400).json({ error: 'Post query error' });
            }

            if (postResults.length === 0) {
                return res.status(404).json({ error: 'No posts found' });
            }

            // ดึงข้อมูลภาพทั้งหมด
            const imageSql = `SELECT * FROM image_post`;
            conn.query(imageSql, (err, imageResults) => {
                if (err) {
                    console.log(err);
                    return res.status(400).json({ error: 'Image query error' });
                }

                // จับคู่โพสต์กับรูปภาพ
                const postsWithImages = postResults.map(post => {
                    const images = imageResults.filter(img => img.image_fk_postid === post.post_id);
                    return {
                        post,
                        images
                    };
                });

                res.status(200).json(postsWithImages);
            });
        });
    } catch (err) {
        console.log(err);
        return res.status(500).json({ error: 'Server error' });
    }
});


