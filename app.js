var express = require('express');
var app = express();

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
