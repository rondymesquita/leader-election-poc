"use strict";

const redis = require("redis");
const chalk = require("chalk");
const { promisify } = require("util");

const Logger = require("./logger.js");
const MessageHandler = require("./message-handler");
const Node = require("./node");

let logger = null;
const redisOptions = {
  host: "localhost",
  port: 6379
};

const sleep = (time = 1) => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve();
    }, time * 1);
  });
};

class Params {
  constructor(masterID, age) {
    this.masterID = masterID
    this.age = parseInt(age);
  }
}

class Criterions {
  constructor(senderID, params) {
    this.senderID = senderID
    this.params = params
  }
}

class Election {
  constructor(id) {
    this.id = id;
  }
}

module.exports = class App {
  constructor(id) {
    this.id = id;
    this.criterions = new Criterions(id, new Params(id, id));
    this.whoSaysItsMe = [];
    logger = new Logger(id);
  }

  async start() {
    await Promise.all([
      Node.deleteAll()
      // delKey(STORE_MASTER_ID)
    ]);

    const messageHandler = new MessageHandler();
    messageHandler.onMessageSubscription(async count => {
      await sleep(5);
      const isSaved = await Node.isSaved(this.id);
      if (!isSaved) {
        await Node.add(this.id);
        logger.info("[onMessageSubscription] New node added on list:", this.id);
        messageHandler.emitNodeEnter(new Election(this.id));
      }
    });

    messageHandler.onMessage(async criterions => {
      await sleep();

      const nodes = await Node.list();

      if (nodes.length === 0) {
        logger.info("[On Message] No clients, I`m the master", this.id);
        messageHandler.emitNodeElected(new Election(this.id));
        return;
      } else if (nodes.length === 1 && nodes[0] === this.id) {
        logger.info(
          "[On Message] Only me on the list, I`m the master",
          this.id
        );
        messageHandler.emitNodeElected(new Election(this.id));
        return;
      }

      if (this.id === criterions.senderID) {
        return
      }

      logger.info("[On Message] criterions", criterions, this.id, criterions.senderID === this.id);

      if (this._betterThan(criterions)) {
        // consola.info("********** Sending my criterions", this.criterions);
        messageHandler.emitMessage(
          this.criterions
        );
      } else {
        // consola.info("========== Sending received", criterions);
        messageHandler.emitMessage(
          new Criterions(this.id, criterions.params)
        );
      }

      const {isDone, masterID } = await this.checkStopCondition(criterions)
      if (isDone) {
        logger.success('[On Message] Stop condition reached! Master is: ', masterID)
        messageHandler.emitNodeElected(new Election(masterID))
        return
      }
    });

    messageHandler.onNodeEnter(async election => {
      await sleep();
      // Ignore when node enter event is triggered by myself
      if (this.id === election.id) {
        return;
      }

      logger.info("[OnNodeEnter] New node", election);
      messageHandler.startElection(this.criterions);
    });

    messageHandler.onNodeElected(async election => {
      await sleep();
      const nodes = await Node.list()
      logger.success(chalk.green("MASTER ELECTED " + election.id), nodes);
      messageHandler.stopElection();
    });

    /*
      TODO: start election only when a node loses connection with its master
     */
    messageHandler.startElection(this.criterions);
  }

  _betterThan(criterions) {
    console.log();
    logger.info('Comparing myself\n', this.criterions.params);
    logger.info('With\n', criterions);
    console.log();
    return this.criterions.params.age >= criterions.params.age;
  }

  async checkStopCondition(criterions) {
    // logger.info("Checking stop condition", this.id, criterions);
    let nodes = await Node.list()
    const nodesLengthExceptMe = nodes.filter((node) => {
      return node !== this.id
    }).length

    const heSayItsMe = parseInt(criterions.params.masterID) == parseInt(this.id)

    const senderID = criterions.senderID
    if (heSayItsMe && !this.whoSaysItsMe.includes(senderID)) {
      this.whoSaysItsMe.push(senderID)
    }

    //final check
    if (nodesLengthExceptMe == this.whoSaysItsMe.length) {
      // logger.success('Stop condition reached')
      return {isDone: true, masterID: this.id}
    } else {
      // logger.info('Election keep going')
      return {isDone: false, masterID: null}
    }
  }
};
