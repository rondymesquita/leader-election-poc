const redis = require("redis");
const consola = require('consola')
const chalk = require('chalk')
const { promisify } = require('util');

const ELECTION_DONE = 'election:done'
const MESSAGE = 'election:message'
const NODE_ENTERED = 'election:node_entered'

const STORE_NODES = 'election:store_nodes'
const STORE_MASTER_ID = 'election:store_master_id'

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

const sleep = () => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve()
    }, 10)
  })
}

module.exports = class App {
  constructor(id) {
    this.id = id
    this.params = {
      id: this.id,
      date: 'date'
    };
    this.whoSaysItsMe = []
  }

  async start() {
    if (this.id === 2) await sleep()

    await Promise.all([
      delKey(STORE_NODES),
      delKey(STORE_MASTER_ID),
      // add(STORE_NODES, this.id)
    ])

    const messages = {
      [`${MESSAGE}`]: async (msg) => {

        const message = this._parseMessage(msg)

        const {isDone, masterId } = await this._stopConditionReached(message)
        if (isDone) {
          consola.success('Stop condition reached! Master is: ', masterId, process.env.NAME)
          pub.publish(ELECTION_DONE, JSON.stringify({id: masterId, name: process.env.NAME}) );
          // sub.unsubscribe(MESSAGE);
          // sub.unsubscribe(ELECTION_DONE);
          return
        }

        console.log('Message on:%s from:%s', this.id, message.senderID)
        await sleep()
        if (this._betterThan(message)) {
          consola.info('********** Sending my criterions')
          pub.publish(MESSAGE, this._buildMessage(this.params));
        } else {
          consola.info('========== Sending received', msg)
          pub.publish(MESSAGE,this._buildMessage(message.params));
        }
      },
      [`${NODE_ENTERED}`]: async (msg) => {
        consola.info(chalk.cyan('node entered ' + msg))
        sub.subscribe(MESSAGE);
        sub.subscribe(ELECTION_DONE);
        pub.publish(MESSAGE, this._buildMessage(this.params));
      },
      [`${ELECTION_DONE}`]: async (msg) => {
        const message = JSON.parse(msg)
        consola.success(chalk.green('MASTER ELECTED ' + message.id +":" + message.name))
        sub.unsubscribe(MESSAGE);
        sub.unsubscribe(ELECTION_DONE);
      }
    }

    const subscriptions = {
      [`${MESSAGE}`]: async (count) => {
        const clients = await list(STORE_NODES, 0, -1)
        if (!clients.includes(this.id)) {
          consola.warn('New node added on list')
          await sleep()
          await add(STORE_NODES, this.id)
          pub.publish(NODE_ENTERED, this.id)
          consola.info("Subscribed for messages on:%s:%s", this.id, count);
          consola.info(chalk.cyan('== clients =='))
          consola.info(clients)
        }
      }
    }

    sub.on("message", (channel, msg) => {
      // ignore my own messages
      const message = this._parseMessage(msg)
      if (message.senderID === this.id) {
        return
      }
      const fn = messages[channel]
      if (fn) fn(msg)
    });
    sub.on("subscribe", async (channel, count) => {
      const fn = subscriptions[channel]
      if (fn) fn(count)
    });


    sub.subscribe(MESSAGE);
    sub.subscribe(NODE_ENTERED);
    sub.subscribe(ELECTION_DONE);

    //start election right away
    await sleep()
    pub.publish(MESSAGE, this._buildMessage(this.params));

  }

  _buildMessage(params) {
    const message = {
      senderID: this.id,
      params: params
    };
    return JSON.stringify(message)
  }

  _parseMessage(message) {
    return JSON.parse(message)
  }

  _betterThan(message) {
    console.log()
    return this.params.id >= message.params.id
  }

  async _stopConditionReached (message) {
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

    let clients = await list(STORE_NODES, 0, -1);
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
