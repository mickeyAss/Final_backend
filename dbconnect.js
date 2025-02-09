const mysql = require('mysql');

const conn = mysql.createConnection({
    host: 'mysqladmin.comsciproject.net',
    user: 'u528477660_micearn',
    password: 'Ysp1o@TQ',
    database: 'u528477660_micearn'
})

conn.connect((err) => {
    if (err) {
        console.log('Error connect toMySQL database = ', err)
        return;
    }
    console.log('MySQl successfully connected!');
})

module.exports = conn;