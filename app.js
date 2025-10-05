var express = require('express');
var app = express();
require('dotenv').config();
const userRouter =  require('./api/user');
const categoryRouter =  require('./api/category');
const imagepostRouter =  require('./api/image_post');
const hashtagsRouter =  require('./api/hashtags');

const cors = require('cors');
var bodyParser = require('body-parser')

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.text());

app.use("/user",userRouter);
app.use("/category",categoryRouter);
app.use("/image_post",imagepostRouter);
app.use("/hashtags",hashtagsRouter);


module.exports = app;
// const PORT = process.env.PORT || 5050;
// app.listen(PORT, () => console.log(`Server running on port ${PORT}`));