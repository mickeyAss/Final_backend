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
        `;

        conn.query(postSql, (err, postResults) => {
            if (err) {
                console.log(err);
                return res.status(400).json({ error: 'Post query error' });
            }

            if (postResults.length === 0) {
                return res.status(404).json({ error: 'No posts found' });
            }

            // ดึงรูปภาพทั้งหมด
            const imageSql = `SELECT * FROM image_post`;
            conn.query(imageSql, (err, imageResults) => {
                if (err) {
                    console.log(err);
                    return res.status(400).json({ error: 'Image query error' });
                }

                // ดึงข้อมูล category ทั้งหมดที่เชื่อมกับ post ผ่าน post_category
                const categorySql = `
                    SELECT 
                        pc.post_id_fk, 
                        c.cid, c.cname, c.cimage, c.ctype
                    FROM post_category pc
                    JOIN category c ON pc.category_id_fk = c.cid
                `;

                conn.query(categorySql, (err, categoryResults) => {
                    if (err) {
                        console.log(err);
                        return res.status(400).json({ error: 'Category query error' });
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
                                profile_image: post.profile_image
                            },
                            images,
                            categories
                        };
                    });

                    res.status(200).json(postsWithData);
                });
            });
        });
    } catch (err) {
        console.log(err);
        return res.status(500).json({ error: 'Server error' });
    }
});






