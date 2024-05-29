export const C2 = [
  {
    problem: "What are the tech use to build GraphQL?",
    title: "To start building GraphQL from scratch..",
    desc: `
    - Express (atleast basics) <br>
    - Mongoose - helps connect and create our DB models in a MondoDB <br>
    - Nodemon - will constantly watch our files so we dont have to keep <br>
      restarting our server when we make code changes.
    `,
    sample: `
    // 1. Create a folder and create package.json file
    - npm init -y

    // 2. Run GraphQL server with Express
    - Install the ff. packages: express, express-graphql, graphql
    - npm install express express-graphql graphql

    // 3. For DB, install mongoose
    - npm install mongoose

    // 4. Install nodemon
    - npm install nodemon --save-dev

    // 5. create a folder called server. This will store all our
    // GraphQL queries, schemas, MongoDB models, and other
    // resources related to the GraphQL server backend.
    `
  },
  {
    problem: "Where does the GraphQL server live?",
    title: "create a server folder or its own app in monorepo",
    desc: `

    `,
    sample: `
    // 1. Create index.js file which will be app's entry point
    // 2. Create a simple Express server by:

    // require modules
    const express = require('express');

    // create instance of express
    const app = express();

    // specify the port
    const port = 8000;

    // where the server will listen for incoming requests
    app.listen(port, console.log('server running on port {port}'))


    `
  },
  {
    problem: "How do we run the server?",
    title: "create npm scripts and use node and nodemon",
    desc: `
    - Use Node to start server in production
    - Use Nodemon to start server in development
    `,
    sample: `
    // add scripts in package.json

    "scripts": {
      "start": "node server/index.js",
      "dev": "nodemon server/index.js"
    }

    // REMEMBER: nodemon is a tool for local development. its an HMR (Hot Module Reload)
    `
  },
  {
    problem: "Why do we use .env to store environment variables?",
    title: "whats the purpose for dotenv module?",
    desc: `
    from wikipedia: <br>
    env is a shell command for Unix and Unix-like operating systems. It is used to either print a list of environment variables or run another utility in an altered environment without having to modify the currently existing environment.
    `,
    sample: `
    npm install dotenv
    // dotenv allow us to have a .env file to define our environment variables.

    // in root directory, create a .env file and add ff:
    NODE_ENV='development'
    PORT=8000

    // in index.js file, add the following:
    require('dotenv').config()
    const port = process.env.PORT || 8000

    // now run app to make sure its working
    `
  },
  {
    problem: "How do we bring GraphQL into this express server?",
    title: "using express-graphql module",
    desc: ``,
    sample: `
    // inside index.js file, add the following:

    const { graphqlHTTP } = require('express-graphql')

    // register the graphql middleware function for handling GraphQL requests
    app.use('/graphql', graphqlHTTP({}))
    // for all requests to the server that have the path '/graphql'

    // you see how REST API requires different endpoints but with GraphQL,
    // we just use one single endpoint. Either query or mutation (on users, posts or todos)
    // we send a GraphQL request to a single entry point /graphql

    // next is specifying a scheme in graphqlHTTP to describe the shape of data
    `
  }
]

export default C2;
