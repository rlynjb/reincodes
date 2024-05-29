export const C3 = [
  {
    problem: "Since we're using single endpoint, how do we handle multiple requests?",
    title: "Use Schema",
    desc: `
    We define a schema in GraphQL to describe the fields and types of our data. <br>
    It also specifies what queries and mutations are available for clients to execute.
    `,
    sample: `
    // in /server create schema.js
    // import in index.js entry point file

    const schema = require('./schema')

    // specify schema to graphqlHTTP function
    app.use('/graphql', graphqlHTTP({
      schema,
      graphiql: process.env.NODE_ENV === 'development'
    }))

    // we also specify which environment to use graphiql tool.
    // in the code above, we use it only in development environment.
    `
  },
  {
    problem: "How do we start plugging in data to our schema?",
    title: "Use sample data and migrate to MongoDB later",
    desc: ``,
    sample: `
    // In /server, create a file/folder (data.js) that holds your dummy data.
    // In /server/schema.js, import dummy data
    import { todos } from './data'
    `
  },
  {
    problem: "How do we represent our data in GraphQL?",
    title: "Use GraphQLObjectType to represent a type of object in the GraphQL schema.",
    desc: `
    This is used to define the fields nad types of object, as well as any relationships it <br>
    has with other types in the schema.
    `,
    sample: `
    // in server/schema.js, add the ff. code:
    const {
      GraphQLObjectType,
      GraphQLID,
      GraphQLString,
      GraphQLBoolean,
    } from 'graphql'

    const TodoType = new GraphQLObjectType({
      name: 'Todo',
      fields: {
        id: { type: GraphQLID },
        title: { type: GraphQLString },
        completed: { type: GraphQLBoolean }
      }
    })

    // these fields are the fields that we want to expose to the client.

    // NOTE: maybe look into an alternative on defining schema.
    // I know there Apollo Server uses gql tag that can be used to define schema.
    `
  }
]

export default C3
