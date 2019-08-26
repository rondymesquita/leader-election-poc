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
        logger.info('[onMessageSubscription] New node added on list:', this.id)
        messageHandler.emitNodeEnter(new Election(this.id))
      }
    })

    messageHandler.onMessage(async (criterions) => {
      // Ignore when node enter event is triggered by myself
      // if (this.id === criterions.senderID) {
      //   return
      // }

      logger.info('[On Message]', criterions, this.id)

      const nodes = await Node.list()

      logger.info('[On Message] Nodes',  nodes)
      if (nodes.length === 0) {
        logger.info('[On Message] No clients, I`m the master', this.id)
        messageHandler.emitNodeElected(new Election(this.id))
        return
      } else if (nodes.length === 1 && nodes[0] === this.id){
        logger.info('[On Message] Clients on the list', nodes)
        logger.info('[On Message] Only me on the list, I`m the master', this.id)
        messageHandler.emitNodeElected(new Election(this.id))
        return
      }

      const {isDone, masterID } = await this._isStopConditionReached(criterions)
        if (isDone) {
          logger.success('[On Message] Stop condition reached! Master is: ', masterID)
          pub.publish(ON_NODE_ELECT, JSON.stringify({id: masterID}) );
          return
        }
    })

    messageHandler.onNodeEnter(async (election) => {
        // if (this.id === election.id) {
        //   return
        // }
        logger.info('[OnNodeEnter] node entered', election, this.id)

        // Ignore when node enter event is triggered by myself
        // if (this.id !== election.id) {
        //   return
        // }

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
    logger.info('Checking stop condition', this.id, criterions)
    const heSayItsMe = parseInt(criterions.senderID) == parseInt(this.id)
    console.log('*** he:%s saying im master? %s', criterions.senderID, heSayItsMe)
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
