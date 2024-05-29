export const C2 = [
  {
    problem: "What are the different types of tests?",
    title: "The testing pyramid",
    desc: `
    Testing is divided into three categories:
    <br>
    - UI tests (E2E) <br>
    --- verify your work from a user's perspective by interacting with software through UI <br>
    - Service tests (Integration) <br>
    --- ensure these function work in integration as a service <br>
    - Unit tests <br>
    --- attest to the quality of the most atomic unit in your software
    <br>
    <br>
    If you functions don't work, then your whole application won't. Testing these tiny pieces of software is the first step in achieving high-quality digital products.
    <br>
    If all of its modules work, but the application itself doesn't, its a useless product.
    <br>
    - Test individual functions (Unit tests)<br>
    - Test the combination of the individual functions (Unit tests) into intermediary products (Service tests)<br>
    - Test the final product (E2E tests)
    `,
    sample: ``
  },
  {
    problem: "What are the issues when dividing tests into The testing pyramid?",
    title: "It is suggested to separate tests by how broad their scope is",
    desc: `
    Example:
    <br>
    you are writing tests that target a web app, should all of its tests be considered UI tests?
    <br>
    Even though you are testing the client itself, you may have separate tests for individual functions and other tests that actually interact with the GUI.
    <br>
    <br>
    If you product is RESTful API and you test it by sending it HTTP requests, is this a service test or a UI test?
    <br>
    Even though you are testing a service, the HTTP API is the interface provided to you users.
    <br>
    <br>
    <br>
    This revised pyramid divides tests into 3 categories, but labes them differently and used the level of isolation of each test as the maincriterion for its division.
    <br>
    - End-to-end tests (E2E) <br>
    --- validate app's froma user's perspective. A test that controls a browser and interacts with your app by clicking buttons and verifying labels is in this category. SCOPE is the entire application and its features. <br>
    - Integration tests <br>
    --- validate how the different pieces of your software work together. Tests that call a function and check whether it has updated items in a database. the SCOPE of these tests is broader than the scope of unit tests, but smaller then the scope of E2E tests. They ASSERT the quality of the intermediary steps of the process <br>
    - Unit tests <br>
    --- the tests directly interact with individual functions. the SCOPE of these tests is the smallest and they ASSERT only the quality of individual functions.
    `,
    sample: ``
  },
  {
    problem: "What would a be real-world scenario of a test?",
    title: "tests don't necessarily need to be in one category or the other.",
    desc: `
    Many times they will fit between groups. These categories don't exist for us to write labels on top of each of our tests. They exist to guide us toward better and more reliable software, indicating which tests we should write, when, and how much.
    <br>
    <br>
    ref: Testing Javascript Applications - Chapter 2, Table 2.1 Characteristics of each kind of test
    <br>
    <br>
    Example:
    <br>
    1.) if your product is RESTful API, tests that send requests to it are one kind of E2E test. if you build a web app that talks to this API, then tests that open a browser and interact with it from a user's perspective are also E2E tests, but they should be placed even higher in the pyramid.
    <br>
    <br>
    2.) Tests for React components fit somewhere between the integration and unit layers. you may be testing UI, but you are orienting your development process by interacting with individual parts of your application in integration with React's API.
    `,
    sample: ``
  },
  {
    problem: "What makes up a Unit Test?",
    title: "A test sets up a scenario, executes the target code, and verifies whether the output matches what you expected.",
    desc: `
    Tests tend to follow same formula.
    <br>
    - Arrange: sets up scenario (setup)<br>
    - Act: executes the target code (execution)<br>
    - Assert: verifies whether the output matches what you expected (verification)<br>
    <br>
    Instead of manually writing convoluted logic to determine whether output matches (or equal to) what we expect, we can use Assetion library.
    <br>
    Unit tests help you iterate confidently, by providing quick feedback as you write code. (TDD)
    <br>
    Because unit tests' scope is limited to a function, their feedback is narrow and precise. Strict feedback like this makes it faster to write and fix your code.
    <br>
    They make up of:
    <br>
    - Numerous <br>
    - Cheap <br>
    - Fast <br>
    - Isolated <br>
    - Run frequently <br>
    - Provide weaker guarantees
    `,
    sample: ``
  },
  {
    problem: "How do we organize our code?",
    title: "By using test runners/frameworks like Jest",
    desc: `
    They enable you to organize and run multiple tests in a comprehensive manner, providing meaningful and easily readable results.
    <br>
    they also provide Assertion library (Jest matchers, etc).
    `,
    sample: `
    // Code below, we are using Jest to organize test with namespace (test())
    // and using Jest build-in assertion methods (expect().equalTo())

    const Cart = require("./Cart.js")

    // encapsulate teh first test into a diff namespace, isolating its variables and producing more readable output
    test("the addToCart function can add an item to the cart", () => {
      // Arrange: create an empty cart
      const cart = new Cart()
      // Act: exercieses the addToCart function
      cart.addToCart("cheesecake")
      // Assert: checks whether cart contains the newly added item
      expect.toEqual(cart.items, ["cheesecake"])
    })

    // encapsulates the 2nd test into a diff namespace
    test("The removeFromCart function can remove an item from the cart", () => {
      // Arrange: creates an empty cart and adds an item to it
      const cart = new Cart()
      cart.addToCart("cheesecake")
      // Act: exercises the removeFromCart function
      cart.removeFromCart("cheesecake")
      // Assert: checks whether the cart is empty
      expect.toEqual(cart.items, [])
    })
    `
  },
  {
    problem: "What makes up Integration testing?",
    title: "Integration tests help ensure that the diff parts of our software can work together.",
    desc: `
    - they help validate whether your software communicates appropriately with 3rd-party RESTful APIs. <br>
    - or if they can manipulate items in a database.
    <br>
    <br>
    They make up of:
    <br>
    - Commonplace <br>
    - Average cost <br>
    - Reasonably fast <br>
    - Not isolated: involve other functions or integrations <br>
    - Run regularly <br>
    - Provide average guarantees
    <br>
    <br>
    with REACT library: teh way React behaves is essential to how your app does, so you must test your code in integration with React.
    <br>
    The same is valid for interacting with a db or w a computer's filesystem
    <br>
    IMPORTANT: teh goal of integration test is NOT to test any 3rd party pieces of software but to CHECK whether you are interacting with them correctly.
    `,
    sample: ``
  },
  {
    problem: "How do we get started with Integration testing?",
    title: "a classic example of integration test is talking to a database.",
    desc: `
    `,
    sample: `
    // knex is a query builder that interface with sqlite3 db
    npm install --save knex sqlite3

    // knexfile.js
    module.exports = {
      development: {
        client: "sqlite3", // uses sqlite3 as db
        connection: { filename: "./dev.sqlite" }, // specifies the file in which db will store its data
        useNullAsDefault: true // uses NULL instead of DEFAULT for underfined keys
      }
    }

    /*
      when using Knex, you define the structure of your tables thru "migrations".
      Knex uses a db table to keep track of the migrations that havealready run and the new ones.
      It uses those records to guarantee taht your db always has a current schema.
      sample code below:
    */

    // CURRENTTIMESTAMP_create_carts.js
    // the exported up function migrates the db to the next state
    exports.up = async knex => {
      // creates a table for the app's carts containing a username column and id column that autoincrements
      await knex.schema.createTable("carts", table => {
        table.increments("id")
        table.string("username")
      })

      // creates a carts_items table that will keep track of the items in each cart
      await knex.schema.createTable("carts_items", table => {
        // creates a cartId column that references a cart's id in the carts table
        table.integer("cartId").references("carts.id")
        table.string("itemName")
      })
    }

    // teh exported down function migrates teh db to the previous state,
    // deleting teh carts and carts_items tables
    exports.dowm = async knex => {
      await knex.schema.dropTable("carts")
      await knex.schema.dtopTable("carts_items")
    }
    `
  },
  {
    problem: "How do we connect Knex with SQLite3 db?",
    title: "by creating a module with methods to add (CRUD, etc) items to SQLite db",
    desc: ``,
    sample: `
    // Finally, we can create a module with methods to add items to SQLite db
    // dbConnection.js

    // sets up a connection pool for the development db
    const db = require("knex")(require("./knexfile").development)
    // tears down the connection pool
    const closeConnection = () => db.destroy()

    module.exports = {
      db,
      closeConnection
    }
    `
  },
  {
    problem: "How do we use Knex with SQLite3 db in our code and test file?",
    title: "code sample!!",
    desc: ``,
    sample: `
    // cart.js
    const { db } = require("./dbConnection")

    const createCart = username => {
      // inserts a row in the carts table
      return db("carts").insert({ username })
    }

    const addItem = (cartId, itemName) => {
      // inserts a row in teh carts_items table referencing teh cartId passed
      return db("carts_items").insert({ cartId, itemName })
    }

    module.exports = {
      createCart,
      addItem
    }

    // cart.test.js
    const { db, closeConnection } = require("./dbConnection")
    const { createCart, addItem } = require("./cart")

    beforeEach(async () => {
      // Arrange: clears the carts and carts_items tables before each test
      await db("carts_items").truncate()
      await db("carts").truncate()
    })

    // tears down the connection pool
    afterAll(async () => await closeConnection())

    test("createCart creates a cart for a username", async () => {
      // Arrange
      await createCart("Lucas da Costa")

      // Act: selects value in teh username column for all the items in teh carts table
      const result = await db.select("username").from("carts")

      // Assert
      expect(result).toEqual([
        { username: "Lucas da Costa"}
      ])
    })

    test("addItem adds an item to a cart", async () => {
      // Arrange
      const username = "Lucas da Costa"
      await createCart(username)

      // Act
      const { id: cartId } = await db
        .select()
        .from("carts")
        .where({ username }) //selects all teh rows int the carts table whose username column matches the username used for the test

      await addItem(cartId, "cheesecake")

      // Assert
      const result = await db.select("itemName").from("carts_items")
      expect(result).toEqual([
        {
          cartId,
          itemName: "cheesecake"
        }
      ])
    })
    `
  }
]

export default C2;
