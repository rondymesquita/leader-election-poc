'use strict'
const Logger = require('./logger.js');
const App = require('./app.js');
// const ID = process.env.ID

const ID = Math.ceil(Math.random() * 11) + '';

const l = new Logger(ID)
console.log('test', l);
const app = new App(ID)
app.start()

console.log('Application started on:%s', ID);
