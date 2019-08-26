const consola = require('consola');

class Logger{
  constructor (id) {
    this.id = id;
  }

  info(message, ...args) {
    consola.info(`#${this.id} - ${message}`, args)
  }

  success(message, ...args) {
    consola.success(`#${this.id} - ${message}`, args)
  }

  warn(message, ...args) {
    consola.warn(`#${this.id} - ${message}`, args)
  }
}

Logger.instance = null;

module.exports = Logger;
