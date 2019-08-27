'use strict'
const Logger = require('./logger.js');
const App = require('./app.js');

// const ID = Math.ceil(Math.random() * 20) + '';
const ID = process.env.ID;
const app = new App(ID)
app.start()

console.log('Application started on:%s', ID);
