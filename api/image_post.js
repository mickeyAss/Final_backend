var express = require('express');
var router = express.Router();
var conn = require('../dbconnect')

module.exports = router;

router.get("/get", (req, res) => {
    try {
        const postId = 4; // หรือ req.query.post_id ก็ได้หากรับจาก client

        // ดึงข้อมูลโพสต์
        const postSql = `SELECT * FROM post WHERE post_id = ?`;
        conn.query(postSql, [postId], (err, postResult) => {
            if (err) {
                console.log(err);
                return res.status(400).json({ error: 'Post query error' });
            }
            if (postResult.length === 0) {
                return res.status(404).json({ error: 'Post not found' });
            }

            // ดึงข้อมูลรูปภาพทั้งหมดของโพสต์นี้
            const imageSql = `SELECT * FROM image_post WHERE image_fk_postid = ?`;
            conn.query(imageSql, [postId], (err, imageResult) => {
                if (err) {
                    console.log(err);
                    return res.status(400).json({ error: 'Image query error' });
                }

                // รวมข้อมูลแล้วส่งกลับ
                const response = {
                    post: postResult[0],
                    images: imageResult
                };
                res.status(200).json(response);
            });
        });
    } catch (err) {
        console.log(err);
        return res.status(500).json({ error: 'Server error' });
    }
});

