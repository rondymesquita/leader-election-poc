'use strict'

const redis = require("redis");
const chalk = require('chalk')
const { promisify } = require('util');

const Logger = require('./logger.js');
let logger = null;
const MessageHandler = require('./message-handler');
const Node = require('./node');

const ON_NODE_ELECT = 'election:done'
const ON_MESSAGE = 'election:message'
const ON_NODE_ENTER = 'election:node_entered'

const STORE_NODES = 'election:store:nodes'
const STORE_MASTER_ID = 'election:store:master_id'

const max = 10
let count = 0

const redisOptions = {
  host: 'localhost',
  port: 6379
}
const sub = redis.createClient(redisOptions);
const pub = redis.createClient(redisOptions);
const client = redis.createClient(redisOptions);

const add = promisify(client.lpush).bind(client);
const list = promisify(client.lrange).bind(client);
const del = promisify(client.lrem).bind(client);
const get = promisify(client.hget).bind(client);
const delKey = promisify(client.del).bind(client);

const sleep = (time = 10) => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve()
    }, time)
  })
}

class Criterions {
  constructor (id) {
    this.senderID = id,
    this.age = id
  }
}

class Election {
  constructor (id) {
    this.id = id
  }
}

module.exports = class App {

  constructor(id) {
    this.id = id
    this.criterions = new Criterions(id)
    this.whoSaysItsMe = []
    logger = new Logger(id);
  }

  async start() {
    await Promise.all([
      delKey(STORE_NODES),
      delKey(STORE_MASTER_ID),
      // add(STORE_NODES, this.id)
    ])

    const messageHandler = new MessageHandler()
    messageHandler.onMessageSubscription(async (count) => {
      const isSaved = await Node.isSaved(this.id)
      if (!isSaved) {
        await Node.add(this.id)
        logger.info('New node added on list:', this.id)
        messageHandler.emitNodeEnter(new Election(this.id))
      }
    })

    messageHandler.onMessage(async (criterions) => {
      logger.info('==> On Message', criterions, this.id)

      const nodes = await Node.list()
      if (nodes.length === 0) {
        logger.info('No clients, I`m the master', this.id)
        messageHandler.emitNodeElected(new Election(this.id))
        return
      }

      // // Ignore when node enter event is triggered by myself
      // if (this.id === criterions.senderID) {
      //   return
      // }

      const {isDone, masterID } = await this._isStopConditionReached(criterions)
        if (isDone) {
          logger.success('Stop condition reached! Master is: ', masterID)
          pub.publish(ON_NODE_ELECT, JSON.stringify({id: masterID}) );
          return
        }
    })

    messageHandler.onNodeEnter(async (election) => {
        logger.info(chalk.cyan('node entered'), election, this.id)

        // Ignore when node enter event is triggered by myself
        // if (this.id !== election.id) {
        //   return
        // }

        // messageHandler.subscribeEvents()
        messageHandler.startElection(this.criterions);
    })

    messageHandler.onNodeElected((election) => {
      logger.success(chalk.green('MASTER ELECTED ' + election.id))
      messageHandler.stopElection()
    })

     /*
      TODO: start election only when a node loses connection with its master
     */
    messageHandler.startElection(this.criterions);
  }

  _betterThan(message) {
    console.log()
    return this.params.id >= message.params.id
  }

  async _getClients() {
    const clients = await list(STORE_NODES, 0, -1)
    return clients;
  }

  async _isStopConditionReached (criterions) {
    logger.info('Checking stop condition', this.id, criterions.senderID)
    // console.log('Checking stop condition', this.id, message.params.id)
    // console.log('Checking stop condition', typeof this.id, typeof message.params.id)
    const heSayItsMe = parseInt(criterions.senderID) == parseInt(this.id)
    console.log('*** he:%s saying im master? %s', criterions.senderID, heSayItsMe)
    // console.log('sender id', message.senderID)
    if (heSayItsMe && !this.whoSaysItsMe.includes(criterions.senderID)) {
      this.whoSaysItsMe.push(criterions.senderID)
    }
    // this.whoSaysItsMe.push(2)

    let clients = await this._getClients()
    clients = clients.filter((client) => {
      return client !== this.id
    })

    logger.info('clients', clients)
    logger.info('whoSaysItsMe?', this.whoSaysItsMe)
    console.log()
    if (clients.sort().join() === this.whoSaysItsMe.sort().join()) {
      console.log('Stop condition reached')
      return {isDone: true, masterID: this.id}
    } else {
      console.log('Election keep going')
      return {isDone: false, masterID: null}
    }

  }

}
