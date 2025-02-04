var express = require('express');
var app = express();

const cors = require('cors');
var bodyParser = require('body-parser')

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.text());

app.get('/',function (req,res){
    res.send('Hello world');
})

module.exports = app;