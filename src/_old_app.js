'use strict'

const redis = require("redis");
const consola = require('consola')
const chalk = require('chalk')
const { promisify } = require('util');

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
  }

  async start() {
    consola.info('==> Starting')
    await Promise.all([
      delKey(STORE_NODES),
      delKey(STORE_MASTER_ID),
      // add(STORE_NODES, this.id)
    ])

    const messageHandler = new MessageHandler()
    messageHandler.onMessageSubscription(async (count) => {
      // consola.info('==> onMessageSubscription', count, this.id)

      const isSaved = await Node.isSaved(this.id)
      if (!isSaved) {
        await Node.add(this.id)
        consola.info('New node added on list:', this.id)
        messageHandler.emitNodeEnter(new Election(this.id))
      }
    })

    messageHandler.onMessage(async (criterions) => {
      consola.info('==> On Message')

      const nodes = await Node.list()
      if (nodes.length === 0) {
        consola.info('No clients, I`m the master', this.id)
        messageHandler.emitNodeElected(new Election(this.id))
        return
      }

      const {isDone, masterID } = await this._isStopConditionReached(criterions)
        if (isDone) {
          consola.success('Stop condition reached! Master is: ', masterID)
          pub.publish(ON_NODE_ELECT, JSON.stringify({id: masterID}) );
          return
        }
    })

    messageHandler.onNodeEnter(async (election) => {
        consola.info(chalk.cyan('node entered'), election)
        sub.subscribe(ON_MESSAGE);
        sub.subscribe(ON_NODE_ELECT);
        messageHandler.emitMessage(this.criterions)
        // this.emitMessage(ON_MESSAGE, this.params)
    })

    messageHandler.onNodeElected((election) => {
      consola.success(chalk.green('MASTER ELECTED ' + election.id))
      messageHandler.stopElection()
    })

     /*
      TODO: start election only when a node loses connection with its master
     */
    messageHandler.startElection(this.criterions);

    // const subscrictionHandler = new SubscriptionHandler();

    // const messages = {
    //   [`${ON_MESSAGE}`]: async (msg) => {
    //     console.log('====> here')

    //     const message = this._parseMessage(msg)

    //     const {isDone, masterId } = await this._isStopConditionReached(message)
    //     if (isDone) {
    //       consola.success('Stop condition reached! Master is: ', masterId)
    //       pub.publish(ON_NODE_ELECT, JSON.stringify({id: masterId}) );
    //       return
    //     }

    //     console.log('Message on:%s from:%s', this.id, message.senderID)
    //     if (this._betterThan(message)) {
    //       consola.info('********** Sending my criterions')
    //       this.emitMessage(ON_MESSAGE, this.params)
    //     } else {
    //       consola.info('========== Sending received', msg)
    //       this.emitMessage(ON_MESSAGE, message.params)
    //     }
    //   },
    //   [`${ON_NODE_ENTER}`]: (msg) => {
    //     consola.info(chalk.cyan('node entered ' + msg))
    //     sub.subscribe(ON_MESSAGE);
    //     sub.subscribe(ON_NODE_ELECT);
    //     this.emitMessage(ON_MESSAGE, this.params)
    //   },
    //   [`${ON_NODE_ELECT}`]: (msg) => {
    //     const message = JSON.parse(msg)
    //     consola.success(chalk.green('MASTER ELECTED ' + message.id))
    //     this.stopElection()
    //   }
    // }

    // const subscriptions = {
    //   [`${ON_MESSAGE}`]: async (count) => {
    //     const clients = await this._getClients()
    //     if (!clients.includes(this.id)) {
    //       consola.info('New node added on list:')
    //       consola.info("Subscribed for messages on id:%s count:%s", this.id, count);
    //       consola.info('clients', clients)
    //       await add(STORE_NODES, this.id)
    //       consola.info('clients2', clients)
    //       pub.publish(ON_NODE_ENTER, this.id)
    //     }
    //   }
    // }

    // sub.on("message", async (channel, msg) => {
    //   // const clients = await this._getClients();
    //   // // consola.info('on message ', clients, clients.length === 1, clients.includes(this.id), this.id)
    //   // consola.info('==> on message ==>', channel, msg)
    //   // consola.info('==> clients ==>', clients)
    //   // // if (clients.length === 1 && clients.includes(this.id)) {
    //   // if (clients.length === 0) {
    //   //   consola.info('No clients, I`m the master', this.id)
    //   //   pub.publish(ON_NODE_ELECT, JSON.stringify({id: this.id}) );
    //   //   return
    //   // }

    //   // // ignore my own messages
    //   // const message = this._parseMessage(msg)
    //   // console.log('=====> Checking message', channel, message)
    //   // if (message.senderID === this.id) {
    //   //   return
    //   // }
    //   // console.log('=====>Calling chanel', channel)
    //   // calling proper channel on messages
    //   const fn = messages[channel]
    //   if (fn) fn(msg)
    // });
    // sub.on("subscribe", async (channel, count) => {
    //   const fn = subscriptions[channel]
    //   if (fn) fn(count)
    // });


    // sub.subscribe(ON_MESSAGE);
    // sub.subscribe(ON_NODE_ENTER);
    // sub.subscribe(ON_NODE_ELECT);

    //start election right away
    // this.emitMessage(ON_MESSAGE, this.params)
  }

  // stopElection () {
  //   sub.unsubscribe(ON_MESSAGE);
  //   sub.unsubscribe(ON_NODE_ELECT);
  //   consola.info("Election stopped");
  // }

  // emitMessage(channel, params) {
  //   consola.info('Emmiting message', {channel, params})
  //   pub.publish(channel, this._buildMessage(params));
  // }

  // _buildMessage(params) {
  //   const message = {
  //     senderID: this.id,
  //     params: params
  //   };
  //   return JSON.stringify(message)
  // }


  // _parseMessage(msg) {
  //   return JSON.parse(msg)
  // }

  _betterThan(message) {
    console.log()
    return this.params.id >= message.params.id
  }

  async _getClients() {
    const clients = await list(STORE_NODES, 0, -1)
    return clients;
  }

  async _isStopConditionReached (criterions) {
    consola.info('Checking stop condition', this.id, criterions.senderID)
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

    consola.info('clients', clients)
    consola.info('whoSaysItsMe?', this.whoSaysItsMe)
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
