'use strict'
// @flow

const redis = require("redis");
const consola = require('consola')
const chalk = require('chalk')
const { promisify } = require('util');

const ON_NODE_ELECT = 'election:done'
const ON_MESSAGE = 'election:message'
const ON_NODE_ENTER = 'election:node_entered'

const STORE_NODES = 'election:store:nodes'
const STORE_MASTER_ID = 'election:store:master_id'

const max = 10
let count = 0

const redisOptions = {
  host: 'redis',
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

class Params {
  id: string

  constructor(id: string) {
    this.id = id
  }
}

class Message {
  senderId: string
  params: Params

  toString() {
    return JSON.parse(this)
  }
}

module.exports = class App {

  id: string
  params: Params
  whoSaysItsMe: Array<string>

  constructor(id: string) {
    this.id = id
    this.params = new Params(this.id)
    this.whoSaysItsMe = []
  }

  async start() {
    await Promise.all([
      delKey(STORE_NODES),
      delKey(STORE_MASTER_ID),
      // add(STORE_NODES, this.id)
    ])

    const messages = {
      [`${ON_MESSAGE}`]: async (msg) => {
        console.log('====> here')

        const message = this._parseMessage(msg)

        const {isDone, masterId } = await this._isStopConditionReached(message)
        if (isDone) {
          consola.success('Stop condition reached! Master is: ', masterId)
          pub.publish(ON_NODE_ELECT, JSON.stringify({id: masterId}) );
          return
        }

        console.log('Message on:%s from:%s', this.id, message.senderID)
        if (this._betterThan(message)) {
          consola.info('********** Sending my criterions')
          this.emitMessage(this.params)
        } else {
          consola.info('========== Sending received', msg)
          this.emitMessage(message.params)
        }
      },
      [`${ON_NODE_ENTER}`]: (msg) => {
        consola.info(chalk.cyan('node entered ' + msg))
        sub.subscribe(ON_MESSAGE);
        sub.subscribe(ON_NODE_ELECT);
        this.emitMessage(this.params)
      },
      [`${ON_NODE_ELECT}`]: (msg) => {
        const message = JSON.parse(msg)
        consola.success(chalk.green('MASTER ELECTED ' + message.id))
        this.stopElection()
      }
    }

    const subscriptions = {
      [`${ON_MESSAGE}`]: async (count) => {
        const clients = await this._getClients()
        if (!clients.includes(this.id)) {
          consola.warn('New node added on list', this.id)
          await add(STORE_NODES, this.id)
          pub.publish(ON_NODE_ENTER, this.id)
          consola.info("Subscribed for messages on:%s:%s", this.id, count);
          consola.info(chalk.cyan('== clients =='))
          consola.info(clients)
        }
      }
    }

    sub.on("message", async (channel, msg) => {
      const clients = await this._getClients();
      consola.warn('clients =>', clients, clients.length === 1, clients.includes(this.id), this.id)
      // if (clients.length === 1 && clients.includes(this.id)) {
      if (clients.length === 0) {
        pub.publish(ON_NODE_ELECT, JSON.stringify({id: this.id}) );
        return
      }
      console.log('=====>1')
      // ignore my own messages
      const message = this._parseMessage(msg)
      if (message.senderID === this.id) {
        return
      }
      console.log('=====>2', message)
      const fn = messages[channel]
      if (fn) fn(msg)
    });
    sub.on("subscribe", async (channel, count) => {
      const fn = subscriptions[channel]
      if (fn) fn(count)
    });


    sub.subscribe(ON_MESSAGE);
    sub.subscribe(ON_NODE_ENTER);
    sub.subscribe(ON_NODE_ELECT);

    //start election right away
    this.emitMessage(this.params)
  }

  stopElection () {
    sub.unsubscribe(ON_MESSAGE);
    sub.unsubscribe(ON_NODE_ELECT);
  }

  emitMessage(params: Params) {
    pub.publish(ON_MESSAGE, this._buildMessage(params));
  }

  _buildMessage(params: Params) {
    const message = {
      senderID: this.id,
      params: params
    };
    return JSON.stringify(message)
  }

  _parseMessage(message: Message) {
    return JSON.parse(message)
  }

  _betterThan(message: Message) {
    console.log()
    return this.params.id >= message.params.id
  }

  async _getClients() {
    const clients = await list(STORE_NODES, 0, -1)
    return clients;
  }

  async _isStopConditionReached (message: Message) {
    // console.log('Checking stop condition', this.id, message.params.id)
    // console.log('Checking stop condition', typeof this.id, typeof message.params.id)
    const heSayItsMe = parseInt(message.params.id) == parseInt(this.id)
    // console.log('*** he:%s saying im master? %s', message.senderID, heSayItsMe)
    // console.log('sender id', message.senderID)
    if (heSayItsMe && !this.whoSaysItsMe.includes(message.senderID)) {
      this.whoSaysItsMe.push(message.senderID)
    }
    // this.whoSaysItsMe.push(2)
    console.log(this.whoSaysItsMe)

    let clients = await this._getClients()
    clients = clients.filter((client) => {
      return client !== this.id
    })

    consola.info('clients', clients)
    consola.info('whoSays', this.whoSaysItsMe)
    console.log()
    if (clients.sort().join() === this.whoSaysItsMe.sort().join()) {
      // console.log('Stop condition reached')
      return {isDone: true, masterId: this.id}
    } else {
      // console.log('Election keep going')
      return {isDone: false, masterId: null}
    }

  }

}
