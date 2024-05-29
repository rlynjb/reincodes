export const C4 = [
  {
    problem: "How do we query data in GraphQL?",
    title: "We need to define query schema using GraphQLObjectType",
    desc: ``,
    sample: `
    // in server/schema.js, add:
    import {
      GraphQLList,
      GraphQLSchema
    } from 'graphql'

    // we make a root query that represents all the possible
    // entry points into the GraphQL API.
    // meaining, this will retrieve all data, not just todos.
    const RootQueryType = new GraphQLObjectType({
      name: 'Query',
      fields: {
        todos: {
          type: new GraphQLList(TodoType),
          resolve: (root, args) => {
            // code to retrieve Todo objects from the data source
            // 'todos' is coming from dummy data source
            // but later on, we will use MongoDB to return a list of todos
            return todos
          }
        },
        // ... other queries
      }
    })

    // Resolvers - you can return:
    // hardcoded data, data from DB, data from another RESTFUL API,
    // or aggregate of the above into a single query
    // - It takes in a parent and arguments param.
    // - parent is where the query is being called from.
    // - args are the arguments the client pass to the query.

    module.exports = new GraphQLSchema({
      query: RootQueryType
    })
    `
  },
  {
    problem: "How do we test our query?",
    title: "import our query schema into the entry point file",
    desc: `now we have exported our schema, we can try making request using GraphiQL tool. <br>
    to do that: <br>
    - visit http://localhost:3000/graphql <br>
    `,
    sample: `
    // in /server/index.js, import our query schema
    const schema = require('./schema')

    app.use('/graphql', graphqlHTTP({
      schema,
      graphiql: process.env.NODE_ENV === 'development'
    }))
    `
  },
  {
    problem: "How do we retrieve a specific todo (item)?",
    title: "add a new field to the RootQueryType inside schema.js",
    desc: `we will pass in ID inside the resolve function to retrieve a specific todo item`,
    sample: `
    // Test the query in GraphiQL
    `
  }
]

export default C4
