const redis = require("redis");
const consola = require("consola");
const { promisify } = require('util');

const redisOptions = {
  host: "localhost",
  port: 6379
};

const client = redis.createClient(redisOptions);
const add = promisify(client.lpush).bind(client);
const list = promisify(client.lrange).bind(client);

const STORE_NODES = 'election:store:nodes'
const STORE_MASTER_ID = 'election:store:master_id'

class RedisService {
  static async add(key, value) {
    await add(key, value)
  }

  static async list (key) {
    const values = await list(key, 0, -1)
    return values
  }
}

module.exports = class Node {
  static async add(id) {
    await RedisService.add(STORE_NODES, id)
    const nodes = await Node.list()
  }

  static async list() {
    const nodes = await RedisService.list(STORE_NODES)
    return nodes
  }

  static async isSaved(id) {
    const nodes = await Node.list()
    return nodes.includes(id)
  }

}
