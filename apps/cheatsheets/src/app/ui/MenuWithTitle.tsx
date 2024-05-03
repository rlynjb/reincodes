import {
  FC,
} from "react";


interface Props {
  navItems: INavItems
  initialItem?: INavItemsValue
  selectedItem?: any
}

export interface INavItems {
  [key: string]: INavItemsValue[]
}

export interface INavItemsValue {
  id: string
  title: string
  data: any[]
}

export const MenuWithTitle: FC<Props> = ({navItems, initialItem, selectedItem}) => {
  const initialSelected = initialItem

  const subMenu = (navItems: any, key: string) => {
    const handleClick = (item: any) => {
      selectedItem(item)
    }

    return (
      <>
        <ul className="menu menu-sm bg-base-200">
          {navItems[key as keyof typeof navItems].map((navItem: any) =>
            <li key={navItem.id}>
              <a
                className="rounded-none"
                onClick={() => handleClick(navItem)}
              >
                {navItem.title}
              </a>
            </li>
          )}
        </ul>
      </>
    )
  }

  return (
    <>
      <ul className="menu menu-sm bg-base-200">
        {Object.keys(navItems).map((key: string) =>
          <li key={key}>
            <h2 className="menu-title">{key}</h2>

            {subMenu(navItems, key)}
          </li>
        )}
      </ul>
    </>
  )
}
