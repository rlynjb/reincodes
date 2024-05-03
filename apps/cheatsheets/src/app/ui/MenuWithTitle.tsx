import {
  FC,
  useState,
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
  const [private_selected, set_private_selected] = useState(initialSelected) as any

  const subMenu = (navItems: any, key: string) => {
    const handleClick = (item: any) => {
      selectedItem(item)
      set_private_selected(item)
    }

    return (
      <>
        <ul className="menu menu-sm bg-base-200">
          {navItems[key as keyof typeof navItems].map((navItem: any) =>
            <li key={navItem.id}>
              {/* TODO: check if we can make this condition cleaner. check previous notes */}
              <a
                className={'rounded-none ' + (private_selected && private_selected.id === navItem.id && 'active')}
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
