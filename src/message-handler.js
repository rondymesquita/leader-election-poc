const redis = require("redis");
const consola = require("consola");
const { promisify } = require("util");

const redisOptions = {
  host: "localhost",
  port: 6379
};

const sub = redis.createClient(redisOptions);
const pub = redis.createClient(redisOptions);
const client = redis.createClient(redisOptions);

const ON_MESSAGE = "election:message";
const ON_NODE_ENTER = "election:node_entered";
const ON_NODE_ELECT = "election:done";

const STORE_NODES = "election:store:nodes";

const list = promisify(client.lrange).bind(client);
const add = promisify(client.lpush).bind(client);

module.exports = class MessageHandler {
  constructor() {
    this.isRunning = false;

    this.messageChannels = {
      [`${ON_MESSAGE}`]: null,
      [`${ON_NODE_ELECT}`]: null
    };

    this.subscriptionChannels = {
      [`${ON_MESSAGE}`]: null
    };

    /*
      Always enabled since new nodes may enter and leave on redis channel
     */
    sub.subscribe(ON_NODE_ENTER);

   /*
    When messages came by channel
   */
    sub.on("message", (channel, message) => {
      const criterions = JSON.parse(message);
      const handler = this.messageChannels[channel];
      if (handler) handler(criterions);
    });

   /*
    When a subscription happens in any channel
   */
    sub.on("subscribe", async (channel, count) => {
      const handler = this.subscriptionChannels[channel];
      if (handler) handler(count);
    });
  }

  startElection(criterions) {
    if (!this.isRunning) {
      this.subscribeEvents()
      this.emitMessage(criterions);
      this.isRunning = true
      consola.info("Election started");
    }
  }

  stopElection() {
    if (this.isRunning) {
      this.unsubscribeEvents()
      this.isRunning = false
      consola.info("Election stopped");
    }
  }

  unsubscribeEvents() {
    sub.unsubscribe(ON_MESSAGE);
    sub.unsubscribe(ON_NODE_ELECT);
  }

  subscribeEvents() {
    sub.subscribe(ON_MESSAGE);
    sub.subscribe(ON_NODE_ELECT);
  }

  /*
    Subscriptions
   */
  onMessageSubscription (fn) {
     this.subscriptionChannels[`${ON_MESSAGE}`] = fn;
  }

  /*
    Messages
   */
  onMessage(fn) {
    this.messageChannels[`${ON_MESSAGE}`] = fn;
  }

  onNodeElected(fn) {
    this.messageChannels[`${ON_NODE_ELECT}`] = fn;
  }

  onNodeEnter(fn) {
    this.messageChannels[`${ON_NODE_ENTER}`] = fn;
  }

  /*
    Emitting
   */
  emitMessage (criterions) {
   this._publish(ON_MESSAGE, criterions)
  }

  emitNodeEnter (election) {
   this._publish(ON_NODE_ENTER, election)
  }

  emitNodeElected (election) {
    this._publish(ON_NODE_ELECT, election)
  }

  // async _onSubscribeMessage (count) {
  //    const nodes = await this._getNodes()
  //    console.log('============>', count, nodes)
  //    if (!nodes.includes(this.id)) {
  //      consola.info('New node added on list:')
  //      consola.info("Subscribed for messages on id:%s count:%s", this.id, count);
  //      consola.info('nodes', nodes)
  //      await add(STORE_NODES, this.id)
  //      consola.info('clients2', nodes)
  //      // pub.publish(ON_NODE_ENTER, this.id)
  //    }
  // }

  // onMessageHandler(criterions) {
  //   consola.info('==> On Message', criterions)
  // }

  _publish(channel, payload) {
    // consola.info("Emmiting message\n", { channel, payload });
    pub.publish(channel, JSON.stringify(payload));
  }

  // async _getNodes() {
  //   const nodes = await list(STORE_NODES, 0, -1)
  //   return nodes;
  // }
};
