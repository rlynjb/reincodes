import C3_CLEANING_CODE from './c3-cleaning_code'
import C4_POPULAR_COMPOSITION from './c4-popular_composition'
import C5_WRITING_CODE_FOR_THE_BROWSER from './c5-writing_code_for_the_browser'
import C7_ANTIPATTERNS_TO_BE_AVOIDED from './c7-antipatters_to_be_avoided'
import C8_REACT_HOOKS from './c8-react_hooks'
import C9_REACT_ROUTER from './c9-react_router'
import C10_REACT_18_NEW_FEATURES from './c10-react_18_new_features'
import C11_MANAGING_DATA from './c11-managing_data'
import C12_SERVER_SIDE_RENDERING from "./c12-server-side_rendering"

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
    { id: 'c3', title: 'Cleaning up code', data: C3_CLEANING_CODE },
    { id: 'c4', title: 'Exploring Popular Composition Patterns', data: C4_POPULAR_COMPOSITION },
    { id: 'c5', title: 'Writing Code for the Browser', data: C5_WRITING_CODE_FOR_THE_BROWSER },
    { id: 'c7', title: 'Anti-Patterns to be Avoided', data: C7_ANTIPATTERNS_TO_BE_AVOIDED },
    { id: 'c8', title: 'React Hooks', data: C8_REACT_HOOKS },
    { id: 'c9', title: 'React Router', data: C9_REACT_ROUTER },
    { id: 'c10', title: 'React 18 New Features', data: C10_REACT_18_NEW_FEATURES},
    { id: 'c11', title: 'Managing Data', data: C11_MANAGING_DATA},
    { id: 'c12', title: 'Server-side Rendering', data: C12_SERVER_SIDE_RENDERING }
  ],
  "A Common-Sense Guide to Data Structures and Algorithms": [
    { id: '', title: 'Sample Title', data: [] },
  ]
}


export * from './c3-cleaning_code'
export * from './c4-popular_composition'
export * from './c5-writing_code_for_the_browser'
export * from './c7-antipatters_to_be_avoided'
export * from './c8-react_hooks'
export * from './c9-react_router'
export * from './c10-react_18_new_features'
export * from './c11-managing_data'
export * from "./c12-server-side_rendering"
