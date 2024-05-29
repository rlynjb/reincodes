// React Deisgn Patterns and Best Practices
import C3_CLEANING_CODE from './React_Design_Patterns_and_Best_Practices/c3-cleaning_code'
import C4_POPULAR_COMPOSITION from './React_Design_Patterns_and_Best_Practices/c4-popular_composition'
import C5_WRITING_CODE_FOR_THE_BROWSER from './React_Design_Patterns_and_Best_Practices/c5-writing_code_for_the_browser'
import C7_ANTIPATTERNS_TO_BE_AVOIDED from './React_Design_Patterns_and_Best_Practices/c7-antipatters_to_be_avoided'
import C8_REACT_HOOKS from './React_Design_Patterns_and_Best_Practices/c8-react_hooks'
import C9_REACT_ROUTER from './React_Design_Patterns_and_Best_Practices/c9-react_router'
import C10_REACT_18_NEW_FEATURES from './React_Design_Patterns_and_Best_Practices/c10-react_18_new_features'
import C11_MANAGING_DATA from './React_Design_Patterns_and_Best_Practices/c11-managing_data'
import C12_SERVER_SIDE_RENDERING from "./React_Design_Patterns_and_Best_Practices/c12-server-side_rendering"
import C13_UNDERSTANDING_GRAPHQL from './React_Design_Patterns_and_Best_Practices/c13-understanding_graphql'


// Beginning GraphQL with React, NodeJS, and Apollo
import C1 from "./Beginning_GraphQL_with_React_Nodejs_Apollo/c1"
import C2 from "./Beginning_GraphQL_with_React_Nodejs_Apollo/c2"
import C3 from "./Beginning_GraphQL_with_React_Nodejs_Apollo/c3"
import C4 from "./Beginning_GraphQL_with_React_Nodejs_Apollo/c4"
import C5 from "./Beginning_GraphQL_with_React_Nodejs_Apollo/c5"


// Testing JavaScript Applications
import C1_INTRO_TO_AUTOMATED_TESTING from "./Testing_Javascript_Applications/c1"
import C2_WHAT_TO_TEST_AND_WHEN from "./Testing_Javascript_Applications/c2"
import C3_TESTING_TECHNIQUES from "./Testing_Javascript_Applications/c3"


import {
  INavItems,
  INavItemsValue
} from "../app/ui/MenuWithTitle"

/**
 * TODO:
 * - learn how to implement nested Typescript types
 */

interface INoteData {
  problem: string
  title: string
  desc?: string
  sample?: string
}

export const notesNav: INavItems = {
  "React 18 Design Patterns and Best Practices": [
    { id: 'react-c3', title: 'Cleaning up code', data: C3_CLEANING_CODE },
    { id: 'react-c4', title: 'Exploring Popular Composition Patterns', data: C4_POPULAR_COMPOSITION },
    { id: 'react-c5', title: 'Writing Code for the Browser', data: C5_WRITING_CODE_FOR_THE_BROWSER },
    { id: 'react-c7', title: 'Anti-Patterns to be Avoided', data: C7_ANTIPATTERNS_TO_BE_AVOIDED },
    { id: 'react-c8', title: 'React Hooks', data: C8_REACT_HOOKS },
    { id: 'react-c9', title: 'React Router', data: C9_REACT_ROUTER },
    { id: 'react-c10', title: 'React 18 New Features', data: C10_REACT_18_NEW_FEATURES },
    { id: 'react-c11', title: 'Managing Data', data: C11_MANAGING_DATA},
    { id: 'react-c12', title: 'Server-side Rendering', data: C12_SERVER_SIDE_RENDERING },
    { id: 'react-c13', title: 'Understanding GraphQL', data: C13_UNDERSTANDING_GRAPHQL }
  ],
  "Beginning GraphQL with React, NodeJS, and Apollo": [
    { id: 'graphql-c1', title: 'Introduction to GraphQL', data: C1 },
    { id: 'graphql-c2', title: 'Setting up our Todo App', data: C2 },
    { id: 'graphql-c3', title: 'Specifying our Schema', data: C3 },
    { id: 'graphql-c4', title: 'GraphQL Queries', data: C4 },
    { id: 'graphql-c5', title: 'Using MongoDB as our Database', data: C5 },
  ],
  "Testing JavaScript Applications": [
    { id: 'testing-c1', title: 'An introduction to automated testing', data: C1_INTRO_TO_AUTOMATED_TESTING },
    { id: 'testing-c2', title: 'What to test and when?', data: C2_WHAT_TO_TEST_AND_WHEN},
    { id: 'testing-c3', title: 'Testing techniques', data: C3_TESTING_TECHNIQUES}
  ],
  "A Common-Sense Guide to Data Structures and Algorithms": [
    { id: '', title: 'Sample Title', data: [] },
  ]
}
