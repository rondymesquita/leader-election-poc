const consola = require('consola');

class Logger{
  constructor (id) {
    this.id = id;
  }

  info(message) {
    consola.info(`#${this.id} - ${message}`)
  }

  success(message) {
    consola.success(`#${this.id} - ${message}`)
  }
}

Logger.instance = null;

module.exports = Logger;
