export const C3 = [
  {
    problem: "Organizing test suites",
    title: "",
    desc: ``,
    sample: ``
  },
  {
    problem: "Writing good assertions",
    title: "",
    desc: ``,
    sample: ``
  },
  {
    problem: "How do we replace parts of our application to ease or enable testing?",
    title: "Test doubles: Mocks, stubs, and spies",
    desc: `
    Spies - RECORD data RELATED to the usage of a function WITHOUT interfering in its implementation.
    <br>
    Stubs - RECORD data ASSOCIATED with the usage of a function AND CHANGE its behavior, either by PROVIDING an alternative implementation or return value.
    <br>
    Mocks - CHANGE a function's behavior, but instead of just RECORDING information about its usage, they have EXPECTATIONS PREPROGRAMMED.
    `,
    sample: ``
  },
  {
    problem: "How we keep logs for whenever someone adds an item to the inventory (or db)?",
    title: "use Pino, a lightweight library for logging",
    desc: `
    doc: https://getpino.io
    `,
    sample: `
    // install pino by
    npm install pino

    // create a logger file called logger.js
    const pino = require('pino')

    const pinoInstance = pino()

    // the value within this functions will always be the Pino instance in this file, not the logger object
    const logger = {
      logInfo: pinoInstance.info.bind(pinoInstance),
      logError: pinoInstance.error.bind(pinoInstance)
    }

    module.exports = logger
    `
  },
  {
    problem: "Why do we use logger?",
    title: "dd",
    desc: `
    `,
    sample: `
    // now we have a logger.js, modify the addToInventory function so that it logs whenever
    // an item is added to the inventory

    // inventoryController.js
    const logger = require('./logger')

    const inventory = new Map()

    const addToInventory = (item, quantity) => {
      if (typeof quantity !== 'number') {
        throw new Error('quantity must be a number')
      }

      const currentQuantity = inventory.get(item) || 0
      const newQuantity = currentQuantity + quantity
      inventory.set(item, newQuantity)

      // Logs the item added to the inventory
      logger.logInfo({ item, quantity }, "item added to the inventory")

      return newQuantity
    }

    module.exports = {
      inventory,
      addToInventory
    }

    ----------------------------

    // run node and execute ff code
    $ node
    > const { addToInventory } = require('./inventoryController')
    > addToInventory('apple', 5)

    ----------------------------

    // logger should write something like this on console:
    {
      "level": 30,
      "time": 1633660130000,
      "pid": 12345,
      "hostname": "your-machine",
      "item": "apple",
      "quantity": 5,
      "msg": "item added to the inventory",
      "v": 1
    }
    `
  },
  {
    problem: "Choosing what to test",
    title: "",
    desc: ``,
    sample: ``
  },
  {
    problem: "Code coverage",
    title: "",
    desc: ``,
    sample: ``
  }
]

export default C3;
