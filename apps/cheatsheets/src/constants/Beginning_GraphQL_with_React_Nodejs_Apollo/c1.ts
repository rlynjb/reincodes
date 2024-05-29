export const C1 = [
  {
    problem: "What does GraphQL do?",
    title: "What is GraphQL?",
    desc: `GraphQL allows clients to define the structure of the data they need, and the server will return only the exact requested data. <br>
    You can think of GraphQL being a cross between REST API and SQL (Structured Query Language). Like the REST API, you can execute HTTP operations, but yet can also specify and receive only requested fields.
    `,
    sample: ``
  },
  {
    problem: "Is GraphQL better than the REST API?",
    title: "They both have their own strengths and weaknesses",
    desc: `
    - One advantage of GraphQL is that it allows the client to request exactly the data they need and nothing more.
    <br><br>
    - In REST, the client typically has to make multiple requests to retrieve all the necessary data, which can be less efficient.
    <br><br>
    - But REST is simpler and easier to understand. It's widely adopted and better suited for caching, security, and other features that are commonly required in web application development.
    <br><br>
    - The frontend developer describes the data they want, while the backend developer writes the code to resolve the request.
    <br><br>
    - GraphQL offers a great separation of concerns. A client knows the data they require. The server knows about the data structure and how to resolve data from a data source is up to the server.
    <br><br>
    - It can resolve data from a: Database, Micro-service, 3rd party API, or even a combination of all three.
    `,
    sample: ``
  },
  {
    problem: "How do we Create, Update, Delete data on server?",
    title: "Mutations",
    desc: `
    A mutation is a way to Create, Update, or Delete data on the server. A mutation is similar to a query in that it requests data from the server, but unlike a Query, a mutation also makes changes to the data.
    `,
    sample: `
    // Use the keyword 'mutation' and name the mutation

    mutation {
      createUser(name: "John Doe", email: "john.doe@example.com") {
        id
        name
        email
      }
    }

    // The response contains the data for the mutation createUser.
    // The data is wrapped in a data key. The mutation name i.e. 'createUser'
    // is used as the key to access the data.
    `
  },
  {
    problem: "How do we ensure the data is correct and valid?",
    title: "Schemas and Types",
    desc: `
    GraphQL is a stringly typed language. This means that every piece of data returned by <br>
    a GraphQL server has a predictable type. This is defined by the schema 'SDL'.
    <br><br>
    SDL specifies all the fields and its type. Being strongly typed makes GraphQL:
    <br>
    - less error prone. <br>
    - queries/mutations can be validated during compile-time <br>
    - IDEs can provide auto-completion and validation for creating queries
    <br><br>
    `,
    sample: `
    // The most basic component of a GraphQL schema is the object type.
    // For eg. we have the User type in the previous example which
    // can be defined as:

    type User {
      id: ID!
      name: String
      email: String
      phone: String
    }

    // To Note: There is also Query type and Mutation type
    `
  }
]

export default C1
